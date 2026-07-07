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

-- drop-then-create on every policy keeps this migration idempotent so CI can
-- re-apply it on each deploy without "policy already exists" errors.

-- Any panel user (admin or moderator) can see the panel user list.
drop policy if exists "panel_users_select" on public.panel_users;
create policy "panel_users_select" on public.panel_users
  for select
  to authenticated
  using (public.current_panel_role() in ('admin', 'moderator'));

-- Only admins can add rows directly (in practice, rows are created by the
-- invite-panel-user Edge Function using the service role key, after it
-- verifies the caller is an admin — see supabase/volumes/functions).
drop policy if exists "panel_users_insert_admin_only" on public.panel_users;
create policy "panel_users_insert_admin_only" on public.panel_users
  for insert
  to authenticated
  with check (public.current_panel_role() = 'admin');

-- Only admins can change a panel user's role (e.g. promote/demote).
drop policy if exists "panel_users_update_admin_only" on public.panel_users;
create policy "panel_users_update_admin_only" on public.panel_users
  for update
  to authenticated
  using (public.current_panel_role() = 'admin')
  with check (public.current_panel_role() = 'admin');

-- Only admins can remove a panel user (revoke access).
drop policy if exists "panel_users_delete_admin_only" on public.panel_users;
create policy "panel_users_delete_admin_only" on public.panel_users
  for delete
  to authenticated
  using (public.current_panel_role() = 'admin');

-- Guard against locking everyone out: the last remaining admin cannot be
-- deleted or demoted. Runs as security definer so the admin headcount is
-- computed over all rows, not just those visible to the caller under RLS.
create or replace function public.prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
as $$
declare
  other_admins int;
begin
  if tg_op = 'DELETE' then
    if old.role = 'admin' then
      select count(*) into other_admins
        from public.panel_users where role = 'admin' and id <> old.id;
      if other_admins = 0 then
        raise exception 'Cannot remove the last admin';
      end if;
    end if;
    return old;
  end if;

  -- UPDATE: only a demotion of the last admin is a problem.
  if old.role = 'admin' and new.role <> 'admin' then
    select count(*) into other_admins
      from public.panel_users where role = 'admin' and id <> old.id;
    if other_admins = 0 then
      raise exception 'Cannot demote the last admin';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_last_admin_removal on public.panel_users;
create trigger prevent_last_admin_removal
  before update or delete on public.panel_users
  for each row execute function public.prevent_last_admin_removal();

-- Panel users can read the waitlist.
drop policy if exists "waitlist_select_panel" on public.waitlist;
create policy "waitlist_select_panel" on public.waitlist
  for select
  to authenticated
  using (public.current_panel_role() in ('admin', 'moderator'));
