// POST /csp-report — where a browser says the content policy blocked something.
//
// The policy is computed at deploy time from the bytes about to be served, so
// it drifts by construction: a markup change the builder does not recognise
// ships a policy that blocks the page. The header lives at the CDN edge, so no
// local server ever sends it and no test ever sees it, and until this route
// existed the only thing between a drifted policy and a dead page was somebody
// remembering to open the console after every deploy. This is that somebody,
// made unnecessary.
//
// Public and unauthenticated by necessity, not by oversight: a browser posts a
// violation report with none of our headers on it, and a report that needed a
// key would be silenced by exactly the kind of policy error it exists to
// describe.

import { config } from "../config.ts";
import { readJson } from "../lib/http.ts";
import { storageEnabled } from "../lib/storage.ts";
import { scopedForBrand } from "../lib/scoped_storage.ts";
import { clientAddress } from "../lib/client_ip.ts";
import { checkAll, type Limit } from "../lib/rate_limit.ts";
import { pagePath } from "./client_error.ts";
import { log } from "../lib/log.ts";
import { inc } from "../lib/metrics.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// One broken page emits a report per blocked subresource, so the ceiling sits
// well above what a single honest visitor produces and is still bounded. Over
// it, the answer does not change — only whether the record is kept.
export const CSP_REPORT_LIMITS: Limit[] = [
  { name: "csp-report", max: 120, windowMs: HOUR },
  { name: "csp-report-day", max: 600, windowMs: DAY },
];

// A page can post an array. Reading a hundred of them changes nothing a reader
// would not learn from the first few.
const MAX_PER_REQUEST = 10;

const FIELD_MAX = 200;
const DIRECTIVE_MAX = 120;

export interface Violation {
  document_path: string | null;
  blocked_path: string | null;
  effective_directive: string | null;
  violated_directive: string | null;
  disposition: string | null;
  source_file: string | null;
  line_number: number | null;
  status_code: number | null;
}

function text(value: unknown, max = FIELD_MAX): string | null {
  return typeof value === "string" && value !== "" ? value.slice(0, max) : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

// A blocked URI is a URL most of the time and a keyword the rest of it —
// "inline", "eval", "data". Both are worth keeping, and neither should carry a
// query string into a collection the register describes as holding no personal
// data.
function blocked(value: unknown): string | null {
  const raw = text(value, 500);
  if (!raw) return null;
  if (!raw.includes("/")) return raw.slice(0, FIELD_MAX);
  return pagePath(raw);
}

// The two live spellings disagree about everything except their purpose. The
// Reporting API posts application/reports+json — an array, camelCase, the
// violation under `body`. report-uri posts application/csp-report — one object,
// hyphenated, under a `csp-report` key. Rather than pick a favourite, both are
// read: Chrome sends the first, Firefox and Safari the second, and a policy
// blocking a page in one browser is worth hearing about from any of them.
export function normalise(body: unknown): Violation[] {
  if (Array.isArray(body)) {
    return body
      .filter((entry) =>
        typeof entry === "object" && entry !== null &&
        (entry as Record<string, unknown>).type === "csp-violation"
      )
      .map((entry) => fromReportingApi((entry as Record<string, unknown>).body));
  }
  if (typeof body === "object" && body !== null) {
    const legacy = (body as Record<string, unknown>)["csp-report"];
    if (typeof legacy === "object" && legacy !== null) {
      return [fromReportUri(legacy as Record<string, unknown>)];
    }
  }
  return [];
}

function fromReportingApi(raw: unknown): Violation {
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    document_path: pagePath(body.documentURL),
    blocked_path: blocked(body.blockedURL),
    effective_directive: text(body.effectiveDirective, DIRECTIVE_MAX),
    violated_directive: text(body.effectiveDirective, DIRECTIVE_MAX),
    disposition: text(body.disposition, 20),
    source_file: pagePath(body.sourceFile),
    line_number: count(body.lineNumber),
    status_code: count(body.statusCode),
  };
}

function fromReportUri(body: Record<string, unknown>): Violation {
  return {
    document_path: pagePath(body["document-uri"]),
    blocked_path: blocked(body["blocked-uri"]),
    effective_directive: text(body["effective-directive"], DIRECTIVE_MAX),
    violated_directive: text(body["violated-directive"], DIRECTIVE_MAX),
    disposition: text(body.disposition, 20),
    source_file: pagePath(body["source-file"]),
    line_number: count(body["line-number"]),
    status_code: count(body["status-code"]),
  };
}

// A violation with nothing in it says nothing. Storing it would only make the
// collection harder to read.
export function worthKeeping(violation: Violation): boolean {
  return violation.effective_directive !== null || violation.blocked_path !== null;
}

export async function cspReport(req: Request): Promise<Response> {
  // The answer never varies: 204 whatever happens, so a browser has nothing to
  // retry and a broken page cannot be told it is being ignored. What the limit
  // decides is only whether the record is kept.
  const address = clientAddress(req).ip;
  if (!checkAll(CSP_REPORT_LIMITS, address).allowed) {
    inc("relay_csp_reports_total", { kept: "false" });
    return new Response(null, { status: 204 });
  }

  const body = await readJson<unknown>(req);
  const violations = normalise(body).filter(worthKeeping).slice(0, MAX_PER_REQUEST);
  inc("relay_csp_reports_total", { kept: violations.length ? "true" : "false" });

  for (const violation of violations) {
    // Deliberately unattributed. The report arrives with no key, and guessing
    // the tenant from a hostname in the body is the exact move this codebase
    // decided against for every other route. Which face it came from is legible
    // from document_path without anyone having to guess.
    const record = {
      ...violation,
      user_agent: text(req.headers.get("user-agent"), 300),
      node: config.nodeId,
      env: config.envName,
      received_at: new Date().toISOString(),
    };
    if (storageEnabled()) {
      const key = `csp-reports/${config.envName}/${crypto.randomUUID()}.json`;
      scopedForBrand(null).put(key, record).catch((error) =>
        log("error", "csp report store failed", { key, error: String(error) })
      );
    }
  }

  return new Response(null, { status: 204 });
}
