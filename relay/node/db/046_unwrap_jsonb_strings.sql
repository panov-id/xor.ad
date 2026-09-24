-- Values stored as a JSON string of themselves, turned back into the values.
--
-- postgres.js encodes a string handed to a jsonb parameter as JSON a second
-- time, and four writers handed it JSON.stringify(...): the notice snapshot
-- (routes/report.ts — on production since the intake shipped, so a year of the
-- moderator's evidence reads as one escaped line), the idempotency answer
-- (lib/idempotency.ts — /v1 replayed a 200 with no body), the step away's
-- stored answer (routes/away.ts) and the job payload (lib/jobs.ts, fixed
-- 23.09; its rows hold the string "{}"). The writers go through text now
-- (test/jsonb_params.test.ts and the notice test hold them there); this
-- rewrites what they left. None of these columns ever holds a string on
-- purpose, and `#>> '{}'` is the string's own text, so a row already an object
-- is not touched and running this twice changes nothing (loop, 2026-09-24).
UPDATE dsa_notices SET snapshot = (snapshot #>> '{}')::jsonb WHERE jsonb_typeof(snapshot) = 'string';
UPDATE idempotency SET response = (response #>> '{}')::jsonb WHERE jsonb_typeof(response) = 'string';
UPDATE nonces SET response = (response #>> '{}')::jsonb WHERE jsonb_typeof(response) = 'string';
UPDATE jobs SET payload = (payload #>> '{}')::jsonb WHERE jsonb_typeof(payload) = 'string';
