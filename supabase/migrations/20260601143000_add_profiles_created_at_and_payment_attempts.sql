alter table public.profiles
add column if not exists created_at timestamp with time zone;

update public.profiles as profile
set created_at = coalesce(auth_user.created_at, profile.updated_at, now())
from auth.users as auth_user
where profile.id = auth_user.id
  and profile.created_at is null;

update public.profiles
set created_at = coalesce(updated_at, now())
where created_at is null;

alter table public.profiles
alter column created_at set default now();

alter table public.profiles
alter column created_at set not null;

create index if not exists idx_profiles_role_created_at
on public.profiles (role, created_at desc);

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'flutterwave',
  payment_type text not null default 'unknown',
  status text not null default 'initiated',
  actor_user_id uuid references public.profiles(id) on delete set null,
  driver_id uuid references public.profiles(id) on delete set null,
  customer_id uuid references public.profiles(id) on delete set null,
  ride_id uuid references public.rides(id) on delete set null,
  amount numeric(12, 2),
  currency text not null default 'NGN',
  provider_reference text,
  provider_transaction_id text,
  checkout_url text,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint payment_attempts_payment_type_check check (
    payment_type in (
      'driver_subscription',
      'ride_payment',
      'customer_payment',
      'driver_payout',
      'unknown'
    )
  ),
  constraint payment_attempts_status_check check (
    status in (
      'initiated',
      'initialized',
      'pending',
      'successful',
      'failed',
      'cancelled'
    )
  )
);

create index if not exists idx_payment_attempts_created_at
on public.payment_attempts (created_at desc);

create index if not exists idx_payment_attempts_actor_created_at
on public.payment_attempts (actor_user_id, created_at desc);

create index if not exists idx_payment_attempts_driver_created_at
on public.payment_attempts (driver_id, created_at desc);

create index if not exists idx_payment_attempts_provider_reference
on public.payment_attempts (provider, provider_reference);

alter table public.payment_attempts enable row level security;

create or replace function public.set_payment_attempts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_payment_attempts_updated_at on public.payment_attempts;
create trigger set_payment_attempts_updated_at
before update on public.payment_attempts
for each row execute function public.set_payment_attempts_updated_at();

create or replace function public.dashboard_capture_section_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  global_sections text[] := array[]::text[];
  partner_scope_key text := null;
  partner_sections text[] := array[]::text[];
  throttle_seconds integer := 0;
  target_role text := '';
begin
  case TG_TABLE_NAME
    when 'rides' then
      global_sections := array['overview', 'live-ops', 'rides', 'customers', 'finance', 'partners'];
      partner_scope_key := coalesce(case when TG_OP = 'DELETE' then old.partner_id::text else new.partner_id::text end, null);
      partner_sections := array['workspace'];
      throttle_seconds := 2;
    when 'otp_verifications' then
      global_sections := array['live-ops', 'customers', 'drivers'];
      throttle_seconds := 0;
    when 'scheduled_rides' then
      global_sections := array['overview', 'live-ops', 'scheduled-rides'];
      throttle_seconds := 5;
    when 'ride_offers' then
      global_sections := array['overview', 'live-ops'];
      throttle_seconds := 5;
    when 'profiles' then
      global_sections := array['overview', 'live-ops', 'rides', 'drivers', 'customers', 'finance', 'support'];
    when 'driver_locations' then
      global_sections := array['live-ops', 'drivers'];
      throttle_seconds := 20;
    when 'vehicles' then
      global_sections := array['live-ops', 'drivers'];
      throttle_seconds := 10;
    when 'customer_payments' then
      global_sections := array['overview', 'finance'];
      throttle_seconds := 4;
    when 'payment_attempts' then
      global_sections := array['finance'];
      throttle_seconds := 2;
    when 'driver_wallets' then
      global_sections := array['overview', 'live-ops', 'drivers', 'finance'];
      throttle_seconds := 8;
    when 'driver_payout_accounts' then
      global_sections := array['drivers'];
    when 'driver_payouts' then
      global_sections := array['drivers', 'finance'];
      throttle_seconds := 8;
    when 'ride_financials' then
      global_sections := array['finance'];
      throttle_seconds := 6;
    when 'partners' then
      global_sections := array['overview', 'finance', 'partners', 'access'];
      partner_scope_key := coalesce(case when TG_OP = 'DELETE' then old.id::text else new.id::text end, null);
      partner_sections := array['workspace'];
    when 'partner_members' then
      global_sections := array['partners'];
    when 'partner_customer_links' then
      global_sections := array['partners'];
      partner_scope_key := coalesce(case when TG_OP = 'DELETE' then old.partner_id::text else new.partner_id::text end, null);
      partner_sections := array['workspace'];
      throttle_seconds := 6;
    when 'partner_commissions' then
      global_sections := array['finance', 'partners'];
      partner_scope_key := coalesce(case when TG_OP = 'DELETE' then old.partner_id::text else new.partner_id::text end, null);
      partner_sections := array['workspace'];
      throttle_seconds := 6;
    when 'partner_payouts' then
      global_sections := array['finance', 'partners'];
      partner_scope_key := coalesce(case when TG_OP = 'DELETE' then old.partner_id::text else new.partner_id::text end, null);
      partner_sections := array['workspace'];
      throttle_seconds := 8;
    when 'partner_payout_accounts' then
      global_sections := array['partners'];
    when 'partner_referral_codes' then
      global_sections := array['partners'];
      partner_scope_key := coalesce(case when TG_OP = 'DELETE' then old.partner_id::text else new.partner_id::text end, null);
      partner_sections := array['workspace'];
    when 'ride_partner_attributions' then
      global_sections := array['partners'];
      partner_scope_key := coalesce(case when TG_OP = 'DELETE' then old.partner_id::text else new.partner_id::text end, null);
      partner_sections := array['workspace'];
      throttle_seconds := 6;
    when 'reports' then
      global_sections := array['overview', 'live-ops', 'support'];
      throttle_seconds := 4;
    when 'reviews' then
      global_sections := array['support'];
      throttle_seconds := 10;
    when 'ride_messages' then
      global_sections := array['support'];
      throttle_seconds := 12;
    when 'app_configs' then
      global_sections := array['overview', 'finance', 'settings'];
    when 'app_dispatch_configs' then
      global_sections := array['overview', 'settings'];
    when 'service_types' then
      global_sections := array['rides', 'scheduled-rides', 'settings'];
    when 'cancel_reasons' then
      global_sections := array['settings'];
    when 'dashboard_accounts' then
      global_sections := array['access', 'partners'];
      target_role := coalesce(case when TG_OP = 'DELETE' then old.role else new.role end, '');
      if target_role = 'partner' then
        partner_scope_key := coalesce(case when TG_OP = 'DELETE' then old.partner_id::text else new.partner_id::text end, null);
        partner_sections := array['workspace'];
      end if;
    else
      return null;
  end case;

  if array_length(global_sections, 1) is not null then
    perform public.dashboard_bump_section_signal(section_name, TG_TABLE_NAME, 'global', null, throttle_seconds)
    from unnest(global_sections) as section_name;
  end if;

  if partner_scope_key is not null and array_length(partner_sections, 1) is not null then
    perform public.dashboard_bump_section_signal(section_name, TG_TABLE_NAME, 'partner', partner_scope_key, throttle_seconds)
    from unnest(partner_sections) as section_name;
  end if;

  return null;
end;
$$;

drop trigger if exists dashboard_capture_section_change on public.payment_attempts;
create trigger dashboard_capture_section_change
after insert or update or delete on public.payment_attempts
for each row execute function public.dashboard_capture_section_change();
