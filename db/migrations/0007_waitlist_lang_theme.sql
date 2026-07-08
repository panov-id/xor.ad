-- Remember the visitor's language and colour theme at signup, so the welcome
-- email arrives in the same language and accent/mode they saw on the landing.
alter table public.waitlist
  add column if not exists lang   text,
  add column if not exists accent text,
  add column if not exists mode   text;

-- Pass them through to the edge function.
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
    body    := jsonb_build_object('email', NEW.email, 'lang', NEW.lang, 'accent', NEW.accent, 'mode', NEW.mode),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-welcome-secret', v_secret)
  );
  return NEW;
end;
$$;
