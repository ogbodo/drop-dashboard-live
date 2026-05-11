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

drop trigger if exists dashboard_capture_section_change on public.otp_verifications;

create trigger dashboard_capture_section_change
after insert or update or delete on public.otp_verifications
for each row execute function public.dashboard_capture_section_change();
