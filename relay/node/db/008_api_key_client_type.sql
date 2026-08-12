-- What kind of client a publishable key speaks for.
--
-- A browser key is protected by its Origin allowlist: the key ships inside a
-- page's JavaScript, and what makes a stolen copy useless is that it only works
-- from the site it belongs to. A native client has no Origin at all — not by
-- oversight but by nature — so for it the list is meaningless.
--
-- Today that difference is inferred from an empty list, and "empty means anyone
-- may" is the kind of implicitness somebody eventually slips on: a browser key
-- saved with no origins looks exactly like a native one. The type is written
-- down instead, so the decision lives in the data rather than in a gap.
--
-- Default 'browser': every key that exists today ships in a page.

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS client_type text NOT NULL DEFAULT 'browser';

ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_client_type_check;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_client_type_check
  CHECK (client_type IN ('browser', 'native'));

COMMENT ON COLUMN api_keys.client_type IS
  'browser = protected by the Origin allowlist; native = no Origin exists, the '
  'allowlist is neither kept nor checked, and no per-key daily quota applies '
  'because one key is shared by every copy of the client.';
