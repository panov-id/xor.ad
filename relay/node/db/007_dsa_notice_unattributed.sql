-- A notice under Article 16 may arrive without a brand.
--
-- The key that names the face is a convenience, not a condition: an unknown,
-- revoked or out-of-quota publishable key used to make the route answer 401 or
-- 429 before anything was stored, so the notice did not exist and its sender
-- could not be answered. The route no longer refuses (src/lib/tenant.ts,
-- resolveTenantSoft), which means the column has to admit "we do not know".
--
-- NULL here reads as unattributed, not as "belongs to everyone". Whoever adds
-- the per-brand filter to the moderator's queue must decide what to do with
-- these rows deliberately — they belong to the platform, not to a tenant.

ALTER TABLE dsa_notices ALTER COLUMN brand DROP NOT NULL;

COMMENT ON COLUMN dsa_notices.brand IS
  'Which face the notice came through. NULL = unattributed: the key was missing, '
  'unknown, revoked or out of quota, and a notice is never refused for that.';
