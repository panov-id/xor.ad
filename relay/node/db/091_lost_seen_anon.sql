-- "I saw it" from somebody who is not signed in (owner, 02.11.2026; docs/
-- newdesign4/LOST_SPOTS §5 path 3, §6): a mark on a live lost from the public
-- page /l/<id>, with no identity behind it.
--
-- What tells such marks apart from one another is a daily hash: the address
-- (an IPv6 by its /64), the browser's User-Agent and its language, salted
-- with a value the node draws once a day and keeps in memory only — never
-- in this table, never past the day. The raw address and browser are not
-- written anywhere; the hash is what the ceiling of MARKS_PER_PERSON per
-- notice counts by, and nothing else reads it. It lives 24 hours: the
-- anonymous path clears every hash older than a day before it writes
-- (routes/lost.ts), and the ceiling counts only the day's rows, so a cleared
-- hash and an uncounted one are the same thing.
--
-- author_identity stays NULL on such a row. It is also NULL on a signed mark
-- whose author was erased (db/090: SET NULL), so "anonymous" is "anon_hash
-- was set", not "author is null"; after the day both look alike, which is
-- the point — the author of the lost reads every mark the same way.
ALTER TABLE lost_seen_marks
  ADD COLUMN IF NOT EXISTS anon_hash text CHECK (anon_hash IS NULL OR anon_hash ~ '^[0-9a-f]{64}$');
CREATE INDEX IF NOT EXISTS lost_seen_marks_anon
  ON lost_seen_marks (lost_id, anon_hash, created_at) WHERE anon_hash IS NOT NULL;
