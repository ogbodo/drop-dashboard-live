create table if not exists public.dashboard_section_signals (
  id bigint generated always as identity primary key,
  section text not null,
  scope text not null default 'global',
  scope_key text,
  scope_key_normalized text generated always as (coalesce(scope_key, '')) stored,
  last_source_table text not null,
  event_version bigint not null default 1,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint dashboard_section_signals_section_check check (
    section in (
      'overview',
      'live-ops',
      'rides',
      'drivers',
      'customers',
      'scheduled-rides',
      'finance',
      'partners',
      'support',
      'access',
      'settings',
      'workspace'
    )
  ),
  constraint dashboard_section_signals_scope_check check (scope in ('global', 'partner'))
);

create unique index if not exists dashboard_section_signals_scope_idx
  on public.dashboard_section_signals (section, scope, scope_key_normalized);

create index if not exists dashboard_section_signals_updated_at_idx
  on public.dashboard_section_signals (updated_at desc);

alter table public.dashboard_section_signals enable row level security;

drop policy if exists dashboard_section_signals_select_all on public.dashboard_section_signals;

create policy dashboard_section_signals_select_all
  on public.dashboard_section_signals
  for select
  using (true);

create or replace function public.dashboard_bump_section_signal(
  _section text,
  _source_table text,
  _scope text default 'global',
  _scope_key text default null,
  _minimum_gap_seconds integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  should_write boolean := true;
begin
  if coalesce(_minimum_gap_seconds, 0) > 0 then
    select signals.updated_at <= timezone('utc', now()) - make_interval(secs => _minimum_gap_seconds)
      into should_write
    from public.dashboard_section_signals signals
    where signals.section = _section
      and signals.scope = _scope
      and signals.scope_key_normalized = coalesce(_scope_key, '');
  end if;

  if should_write is false then
    return;
  end if;

  insert into public.dashboard_section_signals (
    section,
    scope,
    scope_key,
    last_source_table,
    event_version,
    updated_at
  )
  values (
    _section,
    _scope,
    _scope_key,
    _source_table,
    1,
    timezone('utc', now())
  )
  on conflict (section, scope, scope_key_normalized)
  do update set
    event_version = public.dashboard_section_signals.event_version + 1,
    last_source_table = excluded.last_source_table,
    updated_at = excluded.updated_at;
end;
$$;

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

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'rides',
    'scheduled_rides',
    'ride_offers',
    'profiles',
    'driver_locations',
    'vehicles',
    'customer_payments',
    'driver_wallets',
    'driver_payout_accounts',
    'driver_payouts',
    'ride_financials',
    'partners',
    'partner_members',
    'partner_customer_links',
    'partner_commissions',
    'partner_payouts',
    'partner_payout_accounts',
    'partner_referral_codes',
    'ride_partner_attributions',
    'reports',
    'reviews',
    'ride_messages',
    'app_configs',
    'app_dispatch_configs',
    'service_types',
    'cancel_reasons',
    'dashboard_accounts'
  ]
  loop
    execute format('drop trigger if exists dashboard_capture_section_change on public.%I', table_name);
    execute format(
      'create trigger dashboard_capture_section_change after insert or update or delete on public.%I for each row execute function public.dashboard_capture_section_change()',
      table_name
    );
  end loop;
end
$$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.dashboard_section_signals;
  exception
    when duplicate_object then
      null;
  end;
end
$$;
