-- Values stored as a JSON string of themselves, turned back into the values.
--
-- postgres.js encodes a string handed to a jsonb parameter as JSON a second
-- time, and four writers handed it JSON.stringify(...): the notice snapshot
-- (routes/report.ts — on production since the intake shipped on 2026-08-05, so
-- every notice's evidence reads as one escaped line), the idempotency answer
-- (lib/idempotency.ts — /v1 replayed a 200 with no body), the step away's
-- stored answer (routes/away.ts) and the job payload (lib/jobs.ts, fixed
-- 23.09; its rows hold the string "{}"). The writers go through text now
-- (test/jsonb_params.test.ts and the notice test hold them there); this
-- rewrites what they left. None of these columns ever holds a string on
-- purpose, and `#>> '{}'` is the string's own text, so a row already an object
-- is not touched and running this twice changes nothing (loop, 2026-09-24).
-- `IS JSON`: a string whose text is not JSON is left as it is rather than
-- failing the cast, which would stop a rollout after 022–045 had committed
-- (review panel 2026-09-24, seen in postgres:16); tools/check_jsonb_strings.ts
-- still names it.
UPDATE dsa_notices SET snapshot = (snapshot #>> '{}')::jsonb WHERE jsonb_typeof(snapshot) = 'string' AND (snapshot #>> '{}') IS JSON;
UPDATE idempotency SET response = (response #>> '{}')::jsonb WHERE jsonb_typeof(response) = 'string' AND (response #>> '{}') IS JSON;
UPDATE nonces SET response = (response #>> '{}')::jsonb WHERE jsonb_typeof(response) = 'string' AND (response #>> '{}') IS JSON;
UPDATE jobs SET payload = (payload #>> '{}')::jsonb WHERE jsonb_typeof(payload) = 'string' AND (payload #>> '{}') IS JSON;
