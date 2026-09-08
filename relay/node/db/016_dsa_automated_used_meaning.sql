-- What `automated_used` is answering, written where the column lives.
--
-- Article 17(3)(c) asks whether automated means were used, and the honest answer
-- has two halves that this column has been quietly conflating: automation does
-- screen what gets published here, and automation does not decide any notice —
-- a person does, and the letter says so in as many words (lib/mailer.ts).
--
-- The column means the second half: whether the DECISION was automated. Today
-- that is always false, and it has been written by nothing at all — the DEFAULT
-- supplied it, so a reader of \d+ or of an export could not tell "we considered
-- this and it was false" from "nobody ever thought about it". Under an audit
-- those are different answers, and only one of them is ours.
--
-- Nothing about the value changes. What changes is that the route now writes it
-- explicitly (routes/dsa.ts) and the database says what it means.

COMMENT ON COLUMN dsa_notices.automated_used IS
  'Article 17(3)(c): were automated means used to DECIDE this notice. A person '
  'decides every one, so this is false; automated screening of publication is a '
  'different fact and is not recorded here. Written explicitly, never left to '
  'the default.';

COMMENT ON COLUMN dsa_statements.automated_used IS
  'Article 17(3)(c): were automated means used to reach the decision this '
  'statement explains. False while every decision is a person''s. The letter '
  'says the same thing in words (lib/mailer.ts), and the two must not drift.';
