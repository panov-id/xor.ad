// Why there is no copy, in the moderator's words.
//
// Six situations answer the reporter identically — we could not look — and mean
// six different things to us: a rule of the product, a gap in it, and a defect
// are not the same work. The queue showed all six as "never held", so telling a
// broken query out of a night's reports meant opening every notice.
//
// The values are the CHECK in relay/node/db/014, and the node has written them
// since db/013; the list endpoint returns the row as it is. A gate keeps these
// maps equal to that list (scripts/check-panel-reason-labels.sh).
//
// This lives beside the screen rather than inside it so it can be tested without
// a DOM — the same reason src/access/resources.ts is its own file.

export const COPY_LABEL: Record<string, string> = {
  target_gone: "gone before we looked",
  not_accessible: "never held",
};

export const REASON_SHORT: Record<string, string> = {
  chat_not_stored: "a chat is carried, not stored",
  unknown_kind: "no snapshot rule for this kind",
  surface_absent: "that surface is not built here yet",
  unattributed: "no tenant to scope the lookup to",
  out_of_scope: "it belongs to another face",
  lookup_failed: "the lookup broke — a defect",
};

export const REASON_LONG: Record<string, string> = {
  chat_not_stored:
    "None — a chat is carried, never stored, so there was nothing on our side to copy. " +
    "Say so in the answer rather than implying it was examined.",
  unknown_kind:
    "None — this kind of target has no snapshot rule yet, so nothing was copied. " +
    "That is a gap on our side, not a property of the content.",
  surface_absent:
    "None — the surface this report is about is not built on this deployment, " +
    "so there was nothing to copy from.",
  unattributed:
    "None — the report arrived without a usable key, so there was no tenant to scope " +
    "the lookup to. Copying from a guess would have been worse than copying nothing.",
  out_of_scope:
    "None — the target was not found under this face. Answer without naming another one.",
  lookup_failed:
    "None — the lookup broke while trying to copy. That is a defect to fix, not a rule, " +
    "and the report still needs a decision either way.",
};

// Notices older than db/013 carry no reason at all. That is a real absence of
// knowledge rather than a missing label, and the wording has to say so instead
// of picking one of the two possibilities and sounding certain.
export const NO_REASON_RECORDED =
  "None. Either the content had already expired before the report arrived, or it is " +
  "something we never hold — a chat is carried, not stored. This notice predates the " +
  "column that records which, so neither can be ruled out. Say so in the answer rather " +
  "than implying it was examined.";

/** The list's Copy cell: whether a copy exists and, when it does not, why. */
export const copyCell = (
  hasSnapshot: boolean,
  state: string,
  reason: string | null,
): string => {
  if (hasSnapshot) return "yes";
  const head = COPY_LABEL[state] ?? "—";
  if (!reason) return head;
  // An unknown value is shown as itself. Falling back to silence is how the
  // screen got here: a seventh reason added to the node would otherwise look
  // like every other "never held" until somebody read the database by hand.
  return `${head} · ${REASON_SHORT[reason] ?? reason}`;
};

/** The modal's paragraph under "The copy we hold", when there is none. */
export const longReason = (reason: string | null): string => {
  if (!reason) return NO_REASON_RECORDED;
  return (
    REASON_LONG[reason] ??
    `None — recorded as "${reason}", a reason this screen has no wording for yet. ` +
      "Read it as: we could not look."
  );
};
