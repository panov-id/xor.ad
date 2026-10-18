// What a failed call shows on a screen (review of day61-merge, 18.10.2026): never the error's own text —
// a node's body, the core's English, a PIN refusal with its JSON — but one line in the person's language;
// the error itself goes to the developer's console. An error a screen threw in words already (Said) shows as is.
// No i18n import here, so the unit tests take it without vite: i18n.ts binds it to say (failedLine).

/** An error whose message is already the person's words (thrown with say()). */
export class Said extends Error {}

export function makeFailedLine(say: (key: string) => string, log: (e: unknown) => void) {
  return (e: unknown): string => {
    if (e instanceof Said) return e.message;
    log(e);
    return say("app.failed");
  };
}
