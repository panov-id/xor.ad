-- Web Push subscriptions captured from the landing "notify me" offer. The
-- landing posts { endpoint, p256dh, auth, source, lang } with the anon key.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  source text not null,
  lang text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- The landing submits with the anon key — insert-only, no read/update/delete.
-- drop-then-create keeps the migration idempotent (re-runnable in CI).
drop policy if exists "push_subscriptions_insert_anon" on public.push_subscriptions;
create policy "push_subscriptions_insert_anon" on public.push_subscriptions
  for insert
  to anon
  with check (true);

-- Panel users (admin or moderator) can read the subscriptions.
drop policy if exists "push_subscriptions_select_panel" on public.push_subscriptions;
create policy "push_subscriptions_select_panel" on public.push_subscriptions
  for select
  to authenticated
  using (public.current_panel_role() in ('admin', 'moderator'));

-- Narrow table privileges (see the waitlist migration for the rationale).
revoke all on public.push_subscriptions from anon, authenticated;
grant insert on public.push_subscriptions to anon;
grant select on public.push_subscriptions to authenticated;
