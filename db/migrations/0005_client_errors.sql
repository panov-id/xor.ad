-- Client-side error logs from the landing pages (lightweight frontend error tracking).
-- The landing posts here directly (not through the api.* proxy) so errors are
-- still captured even if the proxy/DNS is the thing that's broken.
create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  kind text not null,            -- 'waitlist-submit' | 'window.onerror' | 'unhandledrejection' | ...
  message text,
  stack text,
  page_url text,
  user_agent text,
  source text,                   -- e.g. 'neighbro.place-landing'
  extra jsonb,
  created_at timestamptz not null default now()
);

alter table public.client_errors enable row level security;

-- Anon (the landing) may insert only — no read/update/delete. Idempotent.
drop policy if exists "client_errors_insert_anon" on public.client_errors;
create policy "client_errors_insert_anon" on public.client_errors
  for insert
  to anon
  with check (true);

-- Narrow default grants: anon inserts, panel users (authenticated) read.
revoke all on public.client_errors from anon, authenticated;
grant insert on public.client_errors to anon;
grant select on public.client_errors to authenticated;
