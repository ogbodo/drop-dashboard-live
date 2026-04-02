create extension if not exists pg_net;

create or replace function public.handle_driver_verified_notification()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  project_url text;
  anon_key text;
begin
  select decrypted_secret
  into project_url
  from vault.decrypted_secrets
  where name = 'project_url'
  limit 1;

  select decrypted_secret
  into anon_key
  from vault.decrypted_secrets
  where name = 'anon_key'
  limit 1;

  if project_url is null or anon_key is null then
    raise log 'driver verification notification skipped: missing vault secret project_url or anon_key';
    return new;
  end if;

  perform net.http_post(
    url := project_url || '/functions/v1/driver-verification-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'apikey', anon_key
    ),
    body := jsonb_build_object(
      'driverId', new.id,
      'email', new.email,
      'fullName', new.full_name
    )
  );

  return new;
end;
$$;

drop trigger if exists on_driver_verified_notification on public.profiles;

create trigger on_driver_verified_notification
after update of is_verified on public.profiles
for each row
when (
  old.is_verified is distinct from new.is_verified
  and new.is_verified = true
  and new.role = 'driver'
)
execute function public.handle_driver_verified_notification();
