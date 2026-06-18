begin;

-- Enable RLS on all public app tables so anon/authenticated access is explicit.
alter table if exists public.app_configs enable row level security;
alter table if exists public.app_dispatch_configs enable row level security;
alter table if exists public.cancel_reasons enable row level security;
alter table if exists public.customer_payments enable row level security;
alter table if exists public.dashboard_accounts enable row level security;
alter table if exists public.dashboard_section_signals enable row level security;
alter table if exists public.dashboard_support_responses enable row level security;
alter table if exists public.dashboard_support_thread_reads enable row level security;
alter table if exists public.driver_locations enable row level security;
alter table if exists public.driver_payout_accounts enable row level security;
alter table if exists public.driver_payouts enable row level security;
alter table if exists public.driver_wallet_transactions enable row level security;
alter table if exists public.driver_wallets enable row level security;
alter table if exists public.expo_push_tickets enable row level security;
alter table if exists public.notification_email_events enable row level security;
alter table if exists public.otp_verifications enable row level security;
alter table if exists public.partner_commissions enable row level security;
alter table if exists public.partner_customer_links enable row level security;
alter table if exists public.partner_members enable row level security;
alter table if exists public.partner_payout_accounts enable row level security;
alter table if exists public.partner_payouts enable row level security;
alter table if exists public.partner_referral_codes enable row level security;
alter table if exists public.partners enable row level security;
alter table if exists public.payment_attempts enable row level security;
alter table if exists public.profiles enable row level security;
alter table if exists public.rate_limits enable row level security;
alter table if exists public.reports enable row level security;
alter table if exists public.reviews enable row level security;
alter table if exists public.ride_breadcrumbs enable row level security;
alter table if exists public.ride_cancellation_logs enable row level security;
alter table if exists public.ride_code_attempts enable row level security;
alter table if exists public.ride_financials enable row level security;
alter table if exists public.ride_messages enable row level security;
alter table if exists public.ride_offer_debug enable row level security;
alter table if exists public.ride_offers enable row level security;
alter table if exists public.ride_partner_attributions enable row level security;
alter table if exists public.rides enable row level security;
alter table if exists public.scheduled_rides enable row level security;
alter table if exists public.service_types enable row level security;
alter table if exists public.services enable row level security;
alter table if exists public.trigger_debug enable row level security;
alter table if exists public.vehicles enable row level security;

-- Public/mobile read-only configuration and seed data.
drop policy if exists app_configs_public_mobile_read on public.app_configs;
create policy app_configs_public_mobile_read
  on public.app_configs
  for select
  to anon, authenticated
  using (key in ('driver_monthly_fee', 'hybrid_finance_settings', 'trip_billing_settings'));

drop policy if exists app_dispatch_configs_authenticated_read on public.app_dispatch_configs;
create policy app_dispatch_configs_authenticated_read
  on public.app_dispatch_configs
  for select
  to authenticated
  using (true);

drop policy if exists cancel_reasons_public_active_read on public.cancel_reasons;
create policy cancel_reasons_public_active_read
  on public.cancel_reasons
  for select
  to anon, authenticated
  using (coalesce(is_active, true));

drop policy if exists services_public_active_read on public.services;
create policy services_public_active_read
  on public.services
  for select
  to anon, authenticated
  using (coalesce(is_active, true));

drop policy if exists "Allow public read of services" on public.service_types;
drop policy if exists service_types_public_active_read on public.service_types;
create policy service_types_public_active_read
  on public.service_types
  for select
  to anon, authenticated
  using (coalesce(is_active, true));

-- Driver live location: hidden globally; visible only to assigned customer and driver self.
drop policy if exists customers_can_read_assigned_driver_location on public.driver_locations;
drop policy if exists driver_locations_customer_can_read_assigned on public.driver_locations;
create policy driver_locations_customer_can_read_assigned
  on public.driver_locations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.rides r
      where r.customer_id = auth.uid()
        and r.driver_id = driver_locations.driver_id
        and r.status in (
          'accepted'::public.ride_status,
          'arrived'::public.ride_status,
          'picked_up'::public.ride_status,
          'on_trip'::public.ride_status,
          'completed'::public.ride_status
        )
    )
  );

drop policy if exists driver_locations_driver_can_read_self on public.driver_locations;
create policy driver_locations_driver_can_read_self
  on public.driver_locations
  for select
  to authenticated
  using (driver_id = auth.uid());

-- Vehicles: keep customer assigned read; tighten driver management to authenticated owner.
drop policy if exists "Drivers manage own vehicle" on public.vehicles;
drop policy if exists vehicles_driver_can_select_self on public.vehicles;
create policy vehicles_driver_can_select_self
  on public.vehicles
  for select
  to authenticated
  using (driver_id = auth.uid());

drop policy if exists vehicles_driver_can_insert_self on public.vehicles;
create policy vehicles_driver_can_insert_self
  on public.vehicles
  for insert
  to authenticated
  with check (driver_id = auth.uid());

drop policy if exists vehicles_driver_can_update_self on public.vehicles;
create policy vehicles_driver_can_update_self
  on public.vehicles
  for update
  to authenticated
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid());

drop policy if exists vehicles_driver_can_delete_self on public.vehicles;
create policy vehicles_driver_can_delete_self
  on public.vehicles
  for delete
  to authenticated
  using (driver_id = auth.uid());

-- Ride chat messages: only ride participants can read/send messages.
drop policy if exists ride_messages_participants_can_select on public.ride_messages;
create policy ride_messages_participants_can_select
  on public.ride_messages
  for select
  to authenticated
  using (
    sender_id = auth.uid()
    or receiver_id = auth.uid()
    or exists (
      select 1
      from public.rides r
      where r.id = ride_messages.ride_id
        and (r.customer_id = auth.uid() or r.driver_id = auth.uid())
    )
  );

drop policy if exists ride_messages_participants_can_insert on public.ride_messages;
create policy ride_messages_participants_can_insert
  on public.ride_messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.rides r
      where r.id = ride_messages.ride_id
        and (
          (r.customer_id = auth.uid() and ride_messages.receiver_id = r.driver_id)
          or (r.driver_id = auth.uid() and ride_messages.receiver_id = r.customer_id)
        )
    )
  );

-- Reviews: remove global authenticated read; allow only reviews tied to the user.
drop policy if exists "Allow users to view reviews" on public.reviews;
drop policy if exists reviews_users_can_select_related on public.reviews;
create policy reviews_users_can_select_related
  on public.reviews
  for select
  to authenticated
  using (
    reviewer_id = auth.uid()
    or target_id = auth.uid()
    or driver_id = auth.uid()
    or customer_id = auth.uid()
  );

-- Reports are submitted through security-definer RPCs; allow direct read only for own reports.
drop policy if exists reports_reporter_can_select_own on public.reports;
create policy reports_reporter_can_select_own
  on public.reports
  for select
  to authenticated
  using (reporter_id = auth.uid());

-- Internal log/audit tables: allow related users to read their own context only.
drop policy if exists ride_cancellation_logs_users_can_select_related on public.ride_cancellation_logs;
create policy ride_cancellation_logs_users_can_select_related
  on public.ride_cancellation_logs
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.rides r
      where r.id = ride_cancellation_logs.ride_id
        and (r.customer_id = auth.uid() or r.driver_id = auth.uid())
    )
  );

drop policy if exists ride_code_attempts_users_can_select_related on public.ride_code_attempts;
create policy ride_code_attempts_users_can_select_related
  on public.ride_code_attempts
  for select
  to authenticated
  using (
    attempted_by = auth.uid()
    or exists (
      select 1
      from public.rides r
      where r.id = ride_code_attempts.ride_id
        and (r.customer_id = auth.uid() or r.driver_id = auth.uid())
    )
  );

drop policy if exists ride_breadcrumbs_driver_can_select_self on public.ride_breadcrumbs;
create policy ride_breadcrumbs_driver_can_select_self
  on public.ride_breadcrumbs
  for select
  to authenticated
  using (driver_id = auth.uid());

-- Payment attempts are normally handled by edge functions; users may read their own status only.
drop policy if exists payment_attempts_users_can_select_own on public.payment_attempts;
create policy payment_attempts_users_can_select_own
  on public.payment_attempts
  for select
  to authenticated
  using (
    actor_user_id = auth.uid()
    or driver_id = auth.uid()
    or customer_id = auth.uid()
    or exists (
      select 1
      from public.rides r
      where r.id = payment_attempts.ride_id
        and (r.customer_id = auth.uid() or r.driver_id = auth.uid())
    )
  );

-- OTP compatibility: current mobile builds verify OTP via direct table read.
-- Limit exposure to unexpired rows until mobile moves verification behind an RPC/Edge Function.
drop policy if exists "Admins can view OTPs" on public.otp_verifications;
drop policy if exists "Enable read for verification" on public.otp_verifications;
drop policy if exists otp_verifications_active_code_lookup_compat on public.otp_verifications;
create policy otp_verifications_active_code_lookup_compat
  on public.otp_verifications
  for select
  to anon, authenticated
  using (expires_at > now());

drop policy if exists "Service role can manage OTPs" on public.otp_verifications;
create policy "Service role can manage OTPs"
  on public.otp_verifications
  for all
  to service_role
  using (true)
  with check (true);

-- Storage RLS hardening for user-uploaded chat/delivery images.
drop policy if exists "Allow Authenticated Uploads" on storage.objects;
drop policy if exists "Allow User Manage" on storage.objects;
drop policy if exists "Allow authenticated uploads to deliveries" on storage.objects;

drop policy if exists chat_images_insert_own_folder on storage.objects;
create policy chat_images_insert_own_folder
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat_images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists chat_images_update_own_folder on storage.objects;
create policy chat_images_update_own_folder
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'chat_images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'chat_images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists chat_images_delete_own_folder on storage.objects;
create policy chat_images_delete_own_folder
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'chat_images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists deliveries_insert_own_folder on storage.objects;
create policy deliveries_insert_own_folder
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'deliveries'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists deliveries_update_own_folder on storage.objects;
create policy deliveries_update_own_folder
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'deliveries'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'deliveries'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;

select pg_notify('pgrst', 'reload schema');
