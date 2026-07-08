-- Send the branded welcome email when someone joins the waitlist:
-- AFTER INSERT trigger → pg_net → the send-waitlist-welcome edge function.
-- The function URL + shared secret live in a private config table (values set
-- at runtime, not in this migration), so no secrets are committed.
create extension if not exists pg_net;

create schema if not exists private;
create table if not exists private.app_config (
  key text primary key,
  value text not null
);
-- private schema is server-only (trigger runs as owner); deny app roles.
revoke all on schema private from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;

create or replace function private.on_waitlist_insert()
returns trigger
language plpgsql
security definer
set search_path = private, public, net
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url    from private.app_config where key = 'welcome_url';
  select value into v_secret from private.app_config where key = 'welcome_secret';
  if v_url is null or v_secret is null then
    return NEW;  -- not configured yet → skip quietly
  end if;
  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object('email', NEW.email),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-welcome-secret', v_secret)
  );
  return NEW;
end;
$$;

drop trigger if exists trg_waitlist_welcome on public.waitlist;
create trigger trg_waitlist_welcome
  after insert on public.waitlist
  for each row execute function private.on_waitlist_insert();
