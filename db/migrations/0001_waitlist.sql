-- Waitlist signups from the sosed.place / neighbro.place landing pages.
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null,
  early_access boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

-- The landing pages submit with the anon key — insert-only, no read/update/delete.
-- drop-then-create keeps the migration idempotent (re-runnable in CI).
drop policy if exists "waitlist_insert_anon" on public.waitlist;
create policy "waitlist_insert_anon" on public.waitlist
  for insert
  to anon
  with check (true);

-- Defense in depth: RLS already denies anything without a matching policy,
-- but Supabase grants ALL on public tables to anon/authenticated by default
-- (INSERT/SELECT/UPDATE/DELETE/TRUNCATE…). Narrow privileges to exactly what
-- the policies above rely on: anon inserts, panel users (authenticated) read.
revoke all on public.waitlist from anon, authenticated;
grant insert on public.waitlist to anon;
grant select on public.waitlist to authenticated;
