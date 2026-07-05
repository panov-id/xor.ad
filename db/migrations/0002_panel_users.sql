-- Panel users (admin/moderator) and the role-check helper used by RLS
-- policies across the panel's tables.
create table if not exists public.panel_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'moderator')),
  created_at timestamptz not null default now()
);

alter table public.panel_users enable row level security;

create or replace function public.current_panel_role()
returns text
language sql
security definer
stable
as $$
  select role from public.panel_users where id = auth.uid();
$$;

-- Any panel user (admin or moderator) can see the panel user list.
create policy "panel_users_select" on public.panel_users
  for select
  to authenticated
  using (public.current_panel_role() in ('admin', 'moderator'));

-- Only admins can add rows directly (in practice, rows are created by the
-- invite-panel-user Edge Function using the service role key, after it
-- verifies the caller is an admin — see supabase/volumes/functions).
create policy "panel_users_insert_admin_only" on public.panel_users
  for insert
  to authenticated
  with check (public.current_panel_role() = 'admin');

-- Panel users can read the waitlist.
create policy "waitlist_select_panel" on public.waitlist
  for select
  to authenticated
  using (public.current_panel_role() in ('admin', 'moderator'));
