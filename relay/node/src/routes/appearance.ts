// GET and PUT /identities/appearance — theme, contrast step and accent, kept on
// the node for one identity on one face (chat spec §8.2, protocol §4.1/§4.11,
// screen 22; the table is db/022).
//
// One row per face, not columns on the identity: the identity is one across all
// faces, and a choice made on one storefront must not repaint another. The face
// is the storefront key beside the signature (lib/identity_guard.ts) and nothing
// the body says. A caller with no key — the terminal — has no face, so there is
// nothing to keep for it; that is refused rather than filed under a made-up one.
//
// Nobody else reads this: the only answer it goes into is the identity's own.
// Closing the identity deletes the rows at once (lib/identity_sweeper.ts).
//
// PUT replaces the whole choice. A field left out, or null, means "the
// storefront's default" — the column's own NULL — so a device that sends only
// what the person touched still says everything, and "back to default" stays
// expressible.

import { route } from "../lib/router.ts";
import { json } from "../lib/http.ts";
import { query } from "../lib/db.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { inc } from "../lib/metrics.ts";

// The same sets as the CHECKs in db/022 and the Appearance schema in openapi.yaml.
export const THEMES = ["light", "dark", "system"] as const;
export const CONTRASTS = ["normal", "raised", "maximum"] as const;
export const ACCENTS = ["terra", "amber", "turquoise", "azure", "violet", "carmine"] as const;

const FIELDS = { theme: THEMES, contrast: CONTRASTS, accent: ACCENTS } as const;
type Field = keyof typeof FIELDS;
type Appearance = Record<Field, string | null>;

const EMPTY: Appearance = { theme: null, contrast: null, accent: null };

async function faceOf(req: Request) {
  // Not among the exceptions to a time away (protocol §4.9 names four, by the
  // owner's decision): a person stepped away gets 409 stepped_away here too.
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (!caller.brand) {
    return refuse("no_face", "appearance is kept per storefront; this request names none", 409);
  }
  return { identityId: caller.identityId, brand: caller.brand };
}

async function readAppearance(req: Request): Promise<Response> {
  const face = await faceOf(req);
  if (face instanceof Response) return face;
  const rows = await query<Appearance>(
    `SELECT theme, contrast, accent FROM identity_appearance WHERE identity = $1 AND brand = $2`,
    [face.identityId, face.brand],
  );
  if (rows === null) {
    inc("relay_appearance_total", { route: "get", result: "db_error" });
    return refuse("unavailable", "the appearance could not be read", 503);
  }
  // No row is not an error: nothing chosen yet, every field the storefront's default.
  return json(rows[0] ?? EMPTY);
}

async function writeAppearance(req: Request): Promise<Response> {
  const face = await faceOf(req);
  if (face instanceof Response) return face;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return refuse("invalid_body", "a JSON object is expected", 400);
  }
  // Unknown fields are refused, not dropped: a client sending `colour` would
  // otherwise be told "saved" and see nothing change.
  const unknown = Object.keys(body).filter((k) => !(k in FIELDS));
  if (unknown.length > 0) return refuse("invalid_body", `unknown field: ${unknown[0]}`, 400);

  const chosen: Appearance = { ...EMPTY };
  for (const field of Object.keys(FIELDS) as Field[]) {
    const value = body[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || !(FIELDS[field] as readonly string[]).includes(value)) {
      return refuse("invalid_body", `${field} must be one of ${FIELDS[field].join(", ")} or null`, 400);
    }
    chosen[field] = value;
  }

  const rows = await query<Appearance>(
    `INSERT INTO identity_appearance (identity, brand, theme, contrast, accent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (identity, brand)
       DO UPDATE SET theme = EXCLUDED.theme, contrast = EXCLUDED.contrast, accent = EXCLUDED.accent
     RETURNING theme, contrast, accent`,
    [face.identityId, face.brand, chosen.theme, chosen.contrast, chosen.accent],
  );
  if (rows === null) {
    inc("relay_appearance_total", { route: "put", result: "db_error" });
    return refuse("unavailable", "the appearance could not be saved", 503);
  }
  inc("relay_appearance_total", { route: "put", result: "ok" });
  return json(rows[0]);
}

route("GET", "/identities/appearance", (c) => readAppearance(c.req));
route("PUT", "/identities/appearance", (c) => writeAppearance(c.req));
