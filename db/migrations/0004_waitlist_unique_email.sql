-- Enforce one waitlist entry per email. This makes a duplicate submit return
-- 409 (unique violation), which the landing pages treat as "you're already on
-- the list" instead of inserting duplicate rows.

-- First dedupe any existing duplicates, keeping the earliest signup per email
-- (idempotent: a no-op once the table is already unique).
delete from public.waitlist a
  using public.waitlist b
  where a.email = b.email
    and (a.created_at > b.created_at
         or (a.created_at = b.created_at and a.id > b.id));

-- Add the constraint only if missing (keeps the migration re-runnable in CI).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'waitlist_email_key') then
    alter table public.waitlist add constraint waitlist_email_key unique (email);
  end if;
end $$;
