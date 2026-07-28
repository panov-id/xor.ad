-- A quota belongs to the key, not to the brand: a tenant may hold several keys
-- (a landing, a staging copy, a server-side integration) and they are not
-- interchangeable — one going noisy should not spend another's allowance.
--
-- NULL means unlimited, which is what every key issued so far implicitly had and
-- what the platform's own keys keep having. A limit is opt-in, so turning quotas
-- on cannot break a tenant nobody remembered to configure.
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS quota_events_per_day bigint;

-- Reading "how much has this key used today" happens on the public path, so it
-- gets its own index rather than a scan of the counter table.
CREATE INDEX IF NOT EXISTS quota_counters_lookup
  ON quota_counters (key_id, counter, day);
