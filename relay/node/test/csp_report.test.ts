import { assert, assertEquals } from "jsr:@std/assert@1";
import { CSP_REPORT_LIMITS, cspReport, normalise, worthKeeping } from "../src/routes/csp_report.ts";
import { reset } from "../src/lib/rate_limit.ts";

// The Reporting API's shape: an array, camelCase, the violation under `body`.
const REPORTING_API = [{
  type: "csp-violation",
  age: 0,
  url: "https://panel.example/dashboard?token=secret",
  body: {
    documentURL: "https://panel.example/dashboard?token=secret",
    blockedURL: "https://evil.example/x.js?who=me",
    effectiveDirective: "script-src-elem",
    disposition: "enforce",
    sourceFile: "https://panel.example/assets/index.js?v=2",
    lineNumber: 12,
    statusCode: 200,
  },
}];

// report-uri's shape: one object, hyphenated, under a `csp-report` key.
const REPORT_URI = {
  "csp-report": {
    "document-uri": "https://neighbro.example/rules.html?q=1",
    "blocked-uri": "inline",
    "violated-directive": "style-src-attr",
    "effective-directive": "style-src-attr",
    "disposition": "enforce",
    "source-file": "https://neighbro.example/rules.html?q=1",
    "line-number": 4,
    "status-code": 200,
  },
};

Deno.test("csp: the Reporting API shape is read", () => {
  const [violation] = normalise(REPORTING_API);
  assertEquals(violation.effective_directive, "script-src-elem");
  assertEquals(violation.line_number, 12);
  assertEquals(violation.blocked_path, "https://evil.example/x.js");
});

Deno.test("csp: the report-uri shape is read", () => {
  const [violation] = normalise(REPORT_URI);
  assertEquals(violation.effective_directive, "style-src-attr");
  assertEquals(violation.violated_directive, "style-src-attr");
  assertEquals(violation.line_number, 4);
});

Deno.test("csp: a keyword blocked-uri survives as itself", () => {
  const [violation] = normalise(REPORT_URI);
  // "inline" is not a URL and must not be mangled into one.
  assertEquals(violation.blocked_path, "inline");
});

// The register promises that no personal data reaches the logs, and a document
// URL is the easiest way to break that by accident — a person is on the page
// with whatever they typed still in the address.
Deno.test("csp: queries are dropped from every path", () => {
  const [fromApi] = normalise(REPORTING_API);
  assertEquals(fromApi.document_path, "https://panel.example/dashboard");
  assertEquals(fromApi.source_file, "https://panel.example/assets/index.js");
  const [fromUri] = normalise(REPORT_URI);
  assertEquals(fromUri.document_path, "https://neighbro.example/rules.html");
});

Deno.test("csp: fields are bounded", () => {
  const [violation] = normalise({
    "csp-report": {
      "effective-directive": "d".repeat(500),
      "blocked-uri": "b".repeat(900),
      "disposition": "e".repeat(90),
    },
  });
  assert(violation.effective_directive!.length <= 120);
  assert(violation.blocked_path!.length <= 200);
  assert(violation.disposition!.length <= 20);
});

Deno.test("csp: rubbish yields nothing rather than a record of nothing", () => {
  assertEquals(normalise(null), []);
  assertEquals(normalise("a string"), []);
  assertEquals(normalise([]), []);
  assertEquals(normalise({ nope: 1 }), []);
  // An array of reports of some other type is not ours to keep.
  assertEquals(normalise([{ type: "deprecation", body: {} }]), []);
  // A malformed number is dropped rather than coerced.
  const [violation] = normalise({ "csp-report": { "line-number": "twelve", "blocked-uri": "eval" } });
  assertEquals(violation.line_number, null);
});

Deno.test("csp: an empty violation is not worth keeping", () => {
  assertEquals(worthKeeping(normalise({ "csp-report": {} })[0]), false);
  assertEquals(worthKeeping(normalise(REPORT_URI)[0]), true);
});

function post(body: unknown, address: string): Request {
  return new Request("https://relay.example/csp-report", {
    method: "POST",
    headers: { "content-type": "application/csp-report", "x-forwarded-for": address },
    body: JSON.stringify(body),
  });
}

Deno.test("csp: the answer is always 204, whatever arrives", async () => {
  reset();
  assertEquals((await cspReport(post(REPORT_URI, "10.0.0.1"))).status, 204);
  assertEquals((await cspReport(post({ nope: 1 }, "10.0.0.1"))).status, 204);
  const broken = new Request("https://relay.example/csp-report", {
    method: "POST",
    headers: { "x-forwarded-for": "10.0.0.1" },
    body: "{not json",
  });
  assertEquals((await cspReport(broken)).status, 204);
});

Deno.test("csp: past the limit the answer does not change", async () => {
  reset();
  const hourly = CSP_REPORT_LIMITS[0].max;
  for (let i = 0; i < hourly + 5; i++) {
    const response = await cspReport(post(REPORT_URI, "10.0.0.2"));
    // A browser must never be told to retry, and never told it is being
    // ignored: the limit decides what is stored, not what is said.
    assertEquals(response.status, 204);
  }
});
