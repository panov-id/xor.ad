#!/usr/bin/env bash
# Verifies the prevent_last_admin_removal trigger against a controlled
# single-admin state, inside a transaction that is always rolled back so the
# real panel_users data is untouched. The guard is global across the table,
# so it cannot be exercised hermetically from the e2e suite (which runs
# against a stack that has more than one admin).
set -euo pipefail

sql=$(cat <<'EOF'
begin;
-- Isolate a single admin without tripping the guard during setup.
alter table public.panel_users disable trigger prevent_last_admin_removal;
delete from public.panel_users;
-- id references auth.users(id), so reuse a real auth user for this scratch row.
insert into public.panel_users (id, email, role)
  select id, 'solo-admin@guard.test', 'admin' from auth.users limit 1;
alter table public.panel_users enable trigger prevent_last_admin_removal;

do $$ begin
  update public.panel_users set role = 'moderator' where role = 'admin';
  raise exception 'FAIL: demote of the last admin was allowed';
exception
  when sqlstate 'P0001' then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'OK: demote blocked (%)', sqlerrm;
end $$;

do $$ begin
  delete from public.panel_users where role = 'admin';
  raise exception 'FAIL: delete of the last admin was allowed';
exception
  when sqlstate 'P0001' then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'OK: delete blocked (%)', sqlerrm;
end $$;
rollback;
EOF
)

echo "$sql" | docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1
echo "last-admin guard: PASS"
