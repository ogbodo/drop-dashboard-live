ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS client_request_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rides_customer_client_request_id
ON public.rides (customer_id, client_request_id)
WHERE client_request_id IS NOT NULL;

ALTER TABLE public.scheduled_rides
  ADD COLUMN IF NOT EXISTS client_request_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_rides_customer_client_request_id
ON public.scheduled_rides (customer_id, client_request_id)
WHERE client_request_id IS NOT NULL;

ALTER TABLE public.driver_payouts
  ADD COLUMN IF NOT EXISTS client_reference UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_payouts_driver_client_reference
ON public.driver_payouts (driver_id, client_reference)
WHERE client_reference IS NOT NULL;

DROP FUNCTION IF EXISTS public.create_ride_v2(
  uuid,
  double precision,
  double precision,
  double precision,
  double precision,
  text,
  text,
  boolean,
  public.vehicle_category,
  uuid,
  jsonb,
  numeric,
  numeric,
  integer,
  integer,
  text,
  timestamptz,
  numeric,
  numeric,
  text,
  text
);

CREATE OR REPLACE FUNCTION public.create_ride_v2(
  in_customer_id uuid,
  in_pickup_lon double precision,
  in_pickup_lat double precision,
  in_destination_lon double precision,
  in_destination_lat double precision,
  in_pickup_address text,
  in_destination_address text,
  in_is_delivery boolean,
  in_requested_vehicle public.vehicle_category,
  in_service_type_id uuid,
  in_delivery_item_info jsonb,
  in_price numeric DEFAULT NULL,
  in_distance_km numeric DEFAULT NULL,
  in_estimated_pickup_mins integer DEFAULT NULL,
  in_estimated_dropoff_mins integer DEFAULT NULL,
  in_eta_source text DEFAULT NULL,
  in_eta_last_calculated_at timestamptz DEFAULT NULL,
  in_route_distance_km numeric DEFAULT NULL,
  in_driver_pickup_distance_km numeric DEFAULT NULL,
  in_routing_provider text DEFAULT NULL,
  in_routing_preference text DEFAULT NULL,
  in_client_request_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  customer_id uuid,
  driver_id uuid,
  pickup_code text,
  dropoff_code text,
  price numeric,
  status text,
  is_delivery boolean,
  pickup_address text,
  pickup_lat double precision,
  pickup_lon double precision,
  destination_address text,
  destination_lat double precision,
  destination_lon double precision,
  requested_vehicle_type text,
  service_type_id uuid,
  delivery_item_info jsonb,
  estimated_pickup_mins integer,
  estimated_dropoff_mins integer,
  distance_km numeric,
  route_distance_km numeric,
  driver_pickup_distance_km numeric,
  eta_source text,
  eta_last_calculated_at timestamptz,
  routing_provider text,
  routing_preference text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF in_client_request_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      rides.id,
      rides.customer_id,
      rides.driver_id,
      rides.pickup_code,
      rides.dropoff_code,
      rides.price::numeric,
      rides.status::text,
      rides.is_delivery,
      rides.pickup_address,
      rides.pickup_lat,
      rides.pickup_lon,
      rides.destination_address,
      rides.destination_lat,
      rides.destination_lon,
      rides.requested_vehicle_type::text,
      rides.service_type_id,
      rides.delivery_item_info,
      rides.estimated_pickup_mins,
      rides.estimated_dropoff_mins,
      rides.distance_km,
      rides.route_distance_km,
      rides.driver_pickup_distance_km,
      rides.eta_source,
      rides.eta_last_calculated_at,
      rides.routing_provider,
      rides.routing_preference,
      rides.created_at
    FROM public.rides
    WHERE rides.customer_id = in_customer_id
      AND rides.client_request_id = in_client_request_id
    LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  INSERT INTO public.rides (
    pickup_lon,
    pickup_lat,
    destination_lon,
    destination_lat,
    pickup_address,
    destination_address,
    is_delivery,
    customer_id,
    requested_vehicle_type,
    service_type_id,
    delivery_item_info,
    price,
    distance_km,
    estimated_pickup_mins,
    estimated_dropoff_mins,
    eta_source,
    eta_last_calculated_at,
    route_distance_km,
    driver_pickup_distance_km,
    routing_provider,
    routing_preference,
    client_request_id,
    status
  )
  VALUES (
    in_pickup_lon,
    in_pickup_lat,
    in_destination_lon,
    in_destination_lat,
    in_pickup_address,
    in_destination_address,
    COALESCE(in_is_delivery, false),
    in_customer_id,
    in_requested_vehicle,
    in_service_type_id,
    in_delivery_item_info,
    in_price,
    in_distance_km,
    in_estimated_pickup_mins,
    in_estimated_dropoff_mins,
    in_eta_source,
    in_eta_last_calculated_at,
    in_route_distance_km,
    in_driver_pickup_distance_km,
    in_routing_provider,
    in_routing_preference,
    in_client_request_id,
    'pending'
  )
  RETURNING
    rides.id,
    rides.customer_id,
    rides.driver_id,
    rides.pickup_code,
    rides.dropoff_code,
    rides.price::numeric,
    rides.status::text,
    rides.is_delivery,
    rides.pickup_address,
    rides.pickup_lat,
    rides.pickup_lon,
    rides.destination_address,
    rides.destination_lat,
    rides.destination_lon,
    rides.requested_vehicle_type::text,
    rides.service_type_id,
    rides.delivery_item_info,
    rides.estimated_pickup_mins,
    rides.estimated_dropoff_mins,
    rides.distance_km,
    rides.route_distance_km,
    rides.driver_pickup_distance_km,
    rides.eta_source,
    rides.eta_last_calculated_at,
    rides.routing_provider,
    rides.routing_preference,
    rides.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_ride_v2(
  uuid,
  double precision,
  double precision,
  double precision,
  double precision,
  text,
  text,
  boolean,
  public.vehicle_category,
  uuid,
  jsonb,
  numeric,
  numeric,
  integer,
  integer,
  text,
  timestamptz,
  numeric,
  numeric,
  text,
  text,
  uuid
) TO authenticated;

DROP FUNCTION IF EXISTS public.create_scheduled_ride(
  uuid,
  double precision,
  double precision,
  double precision,
  double precision,
  text,
  text,
  public.vehicle_category,
  uuid,
  timestamptz,
  integer,
  numeric,
  numeric,
  integer,
  integer,
  numeric,
  text,
  timestamptz,
  text,
  text
);

CREATE OR REPLACE FUNCTION public.create_scheduled_ride(
  in_customer_id uuid,
  in_pickup_lon double precision,
  in_pickup_lat double precision,
  in_destination_lon double precision,
  in_destination_lat double precision,
  in_pickup_address text,
  in_destination_address text,
  in_requested_vehicle public.vehicle_category,
  in_service_type_id uuid,
  in_scheduled_for timestamptz,
  in_dispatch_lead_minutes integer DEFAULT 15,
  in_quoted_price numeric DEFAULT NULL,
  in_quoted_distance_km numeric DEFAULT NULL,
  in_quoted_estimated_pickup_mins integer DEFAULT NULL,
  in_quoted_estimated_dropoff_mins integer DEFAULT NULL,
  in_quoted_driver_pickup_distance_km numeric DEFAULT NULL,
  in_quoted_eta_source text DEFAULT NULL,
  in_quoted_eta_last_calculated_at timestamptz DEFAULT NULL,
  in_quoted_routing_provider text DEFAULT NULL,
  in_quoted_routing_preference text DEFAULT NULL,
  in_client_request_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  customer_id uuid,
  status text,
  pickup_address text,
  destination_address text,
  pickup_lat double precision,
  pickup_lon double precision,
  destination_lat double precision,
  destination_lon double precision,
  requested_vehicle_type text,
  service_type_id uuid,
  scheduled_for timestamptz,
  dispatch_lead_minutes integer,
  quoted_price numeric,
  quoted_distance_km numeric,
  quoted_estimated_pickup_mins integer,
  quoted_estimated_dropoff_mins integer,
  quoted_driver_pickup_distance_km numeric,
  quoted_eta_source text,
  quoted_eta_last_calculated_at timestamptz,
  quoted_routing_provider text,
  quoted_routing_preference text,
  spawned_ride_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_scheduled_for timestamptz := now() + interval '30 minutes';
  v_max_scheduled_for timestamptz := now() + interval '7 days';
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> in_customer_id THEN
    RAISE EXCEPTION 'You can only schedule rides for your own account.';
  END IF;

  IF in_client_request_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      scheduled_rides.id,
      scheduled_rides.customer_id,
      scheduled_rides.status::text,
      scheduled_rides.pickup_address,
      scheduled_rides.destination_address,
      scheduled_rides.pickup_lat,
      scheduled_rides.pickup_lon,
      scheduled_rides.destination_lat,
      scheduled_rides.destination_lon,
      scheduled_rides.requested_vehicle_type::text,
      scheduled_rides.service_type_id,
      scheduled_rides.scheduled_for,
      scheduled_rides.dispatch_lead_minutes,
      scheduled_rides.quoted_price,
      scheduled_rides.quoted_distance_km,
      scheduled_rides.quoted_estimated_pickup_mins,
      scheduled_rides.quoted_estimated_dropoff_mins,
      scheduled_rides.quoted_driver_pickup_distance_km,
      scheduled_rides.quoted_eta_source,
      scheduled_rides.quoted_eta_last_calculated_at,
      scheduled_rides.quoted_routing_provider,
      scheduled_rides.quoted_routing_preference,
      scheduled_rides.spawned_ride_id,
      scheduled_rides.created_at,
      scheduled_rides.updated_at
    FROM public.scheduled_rides
    WHERE scheduled_rides.customer_id = in_customer_id
      AND scheduled_rides.client_request_id = in_client_request_id
    LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  IF in_scheduled_for IS NULL THEN
    RAISE EXCEPTION 'Please choose when you want this ride.';
  END IF;

  IF in_scheduled_for < v_min_scheduled_for THEN
    RAISE EXCEPTION 'Scheduled rides must be at least 30 minutes ahead.';
  END IF;

  IF in_scheduled_for > v_max_scheduled_for THEN
    RAISE EXCEPTION 'Scheduled rides can only be booked up to 7 days ahead.';
  END IF;

  RETURN QUERY
  INSERT INTO public.scheduled_rides (
    customer_id,
    pickup_address,
    destination_address,
    pickup_lat,
    pickup_lon,
    destination_lat,
    destination_lon,
    requested_vehicle_type,
    service_type_id,
    scheduled_for,
    dispatch_lead_minutes,
    quoted_price,
    quoted_distance_km,
    quoted_estimated_pickup_mins,
    quoted_estimated_dropoff_mins,
    quoted_driver_pickup_distance_km,
    quoted_eta_source,
    quoted_eta_last_calculated_at,
    quoted_routing_provider,
    quoted_routing_preference,
    client_request_id,
    status
  )
  VALUES (
    in_customer_id,
    in_pickup_address,
    in_destination_address,
    in_pickup_lat,
    in_pickup_lon,
    in_destination_lat,
    in_destination_lon,
    in_requested_vehicle,
    in_service_type_id,
    in_scheduled_for,
    COALESCE(in_dispatch_lead_minutes, 15),
    in_quoted_price,
    in_quoted_distance_km,
    in_quoted_estimated_pickup_mins,
    in_quoted_estimated_dropoff_mins,
    in_quoted_driver_pickup_distance_km,
    in_quoted_eta_source,
    in_quoted_eta_last_calculated_at,
    in_quoted_routing_provider,
    in_quoted_routing_preference,
    in_client_request_id,
    'scheduled'
  )
  RETURNING
    scheduled_rides.id,
    scheduled_rides.customer_id,
    scheduled_rides.status::text,
    scheduled_rides.pickup_address,
    scheduled_rides.destination_address,
    scheduled_rides.pickup_lat,
    scheduled_rides.pickup_lon,
    scheduled_rides.destination_lat,
    scheduled_rides.destination_lon,
    scheduled_rides.requested_vehicle_type::text,
    scheduled_rides.service_type_id,
    scheduled_rides.scheduled_for,
    scheduled_rides.dispatch_lead_minutes,
    scheduled_rides.quoted_price,
    scheduled_rides.quoted_distance_km,
    scheduled_rides.quoted_estimated_pickup_mins,
    scheduled_rides.quoted_estimated_dropoff_mins,
    scheduled_rides.quoted_driver_pickup_distance_km,
    scheduled_rides.quoted_eta_source,
    scheduled_rides.quoted_eta_last_calculated_at,
    scheduled_rides.quoted_routing_provider,
    scheduled_rides.quoted_routing_preference,
    scheduled_rides.spawned_ride_id,
    scheduled_rides.created_at,
    scheduled_rides.updated_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_scheduled_ride(
  uuid,
  double precision,
  double precision,
  double precision,
  double precision,
  text,
  text,
  public.vehicle_category,
  uuid,
  timestamptz,
  integer,
  numeric,
  numeric,
  integer,
  integer,
  numeric,
  text,
  timestamptz,
  text,
  text,
  uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public.queue_driver_payout(
  p_driver_id UUID,
  p_amount BIGINT,
  p_payout_account_id UUID DEFAULT NULL,
  p_provider TEXT DEFAULT NULL,
  p_ride_id UUID DEFAULT NULL,
  p_client_reference UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available_balance BIGINT;
  v_minimum_withdrawal BIGINT := public.get_driver_minimum_withdrawal_amount();
  v_payout_account_id UUID;
  v_provider TEXT := LOWER(COALESCE(p_provider, 'manual'));
  v_wallet_transaction_id UUID;
  v_payout_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_driver_id THEN
    RAISE EXCEPTION 'You can only queue payouts for your own wallet';
  END IF;

  IF p_client_reference IS NOT NULL THEN
    SELECT id
    INTO v_payout_id
    FROM public.driver_payouts
    WHERE driver_id = p_driver_id
      AND client_reference = p_client_reference
    LIMIT 1;

    IF FOUND THEN
      RETURN v_payout_id;
    END IF;
  END IF;

  PERFORM public.ensure_driver_wallet(p_driver_id);

  SELECT available_balance
  INTO v_available_balance
  FROM public.driver_wallets
  WHERE driver_id = p_driver_id
  FOR UPDATE;

  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Payout amount must be greater than zero';
  END IF;

  IF COALESCE(p_amount, 0) < GREATEST(COALESCE(v_minimum_withdrawal, 0), 0) THEN
    RAISE EXCEPTION 'Minimum withdrawal amount is %', v_minimum_withdrawal;
  END IF;

  IF COALESCE(v_available_balance, 0) < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance for payout';
  END IF;

  IF p_payout_account_id IS NULL THEN
    SELECT id, provider
    INTO v_payout_account_id, v_provider
    FROM public.driver_payout_accounts
    WHERE driver_id = p_driver_id
      AND is_default = true
    ORDER BY created_at ASC
    LIMIT 1;
  ELSE
    SELECT id, provider
    INTO v_payout_account_id, v_provider
    FROM public.driver_payout_accounts
    WHERE id = p_payout_account_id
      AND driver_id = p_driver_id;
  END IF;

  INSERT INTO public.driver_wallet_transactions (
    driver_id,
    ride_id,
    type,
    amount,
    status,
    reference,
    metadata
  )
  VALUES (
    p_driver_id,
    p_ride_id,
    'debit',
    p_amount,
    'pending',
    'driver-payout-queued',
    jsonb_build_object(
      'requested_by',
      COALESCE(auth.uid()::text, 'system'),
      'client_reference',
      p_client_reference
    )
  )
  RETURNING id INTO v_wallet_transaction_id;

  INSERT INTO public.driver_payouts (
    driver_id,
    payout_account_id,
    wallet_transaction_id,
    ride_id,
    amount,
    provider,
    client_reference,
    status,
    requested_at
  )
  VALUES (
    p_driver_id,
    v_payout_account_id,
    v_wallet_transaction_id,
    p_ride_id,
    p_amount,
    COALESCE(v_provider, 'manual'),
    p_client_reference,
    'queued',
    now()
  )
  RETURNING id INTO v_payout_id;

  IF p_ride_id IS NOT NULL THEN
    UPDATE public.rides
    SET settlement_status = 'payout_queued'
    WHERE id = p_ride_id
      AND settlement_status IN ('pending', 'wallet_credited');
  END IF;

  RETURN v_payout_id;
END;
$$;

DROP FUNCTION IF EXISTS public.request_driver_withdrawal(
  bigint,
  uuid
);

CREATE OR REPLACE FUNCTION public.request_driver_withdrawal(
  p_amount BIGINT,
  p_payout_account_id UUID DEFAULT NULL,
  p_client_reference UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id UUID := auth.uid();
BEGIN
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN public.queue_driver_payout(
    v_driver_id,
    p_amount,
    p_payout_account_id,
    NULL,
    NULL,
    p_client_reference
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_driver_withdrawal(
  bigint,
  uuid,
  uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_trip_status_rpc(
  p_ride_id uuid,
  p_target_status text,
  p_entered_code text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride RECORD;
  v_uid UUID := auth.uid();
BEGIN
  SELECT *
  INTO v_ride
  FROM public.rides
  WHERE id = p_ride_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Ride not found');
  END IF;

  IF v_ride.status::text = p_target_status THEN
    RETURN jsonb_build_object(
      'status',
      'ok',
      'message',
      'Trip status already ' || p_target_status
    );
  END IF;

  IF v_ride.is_delivery = false THEN
    IF v_uid IS NOT NULL AND v_uid <> v_ride.customer_id THEN
      RETURN jsonb_build_object(
        'status',
        'error',
        'message',
        'Only the passenger can start or end this ride.'
      );
    END IF;
  ELSE
    IF v_uid IS NOT NULL AND v_uid <> v_ride.driver_id THEN
      RETURN jsonb_build_object(
        'status',
        'error',
        'message',
        'Only the driver can update delivery status.'
      );
    END IF;

    IF p_target_status = 'on_trip'
       AND v_ride.pickup_code IS DISTINCT FROM p_entered_code THEN
      RETURN jsonb_build_object(
        'status',
        'error',
        'message',
        'Incorrect Pickup Code.'
      );
    ELSIF p_target_status = 'completed'
       AND v_ride.dropoff_code IS DISTINCT FROM p_entered_code THEN
      RETURN jsonb_build_object(
        'status',
        'error',
        'message',
        'Incorrect Dropoff Code.'
      );
    END IF;
  END IF;

  UPDATE public.rides
  SET
    status = p_target_status::ride_status,
    started_at = CASE
      WHEN p_target_status = 'on_trip' AND started_at IS NULL THEN now()
      ELSE started_at
    END,
    completed_at = CASE
      WHEN p_target_status = 'completed' AND completed_at IS NULL THEN now()
      ELSE completed_at
    END,
    updated_at = now()
  WHERE id = p_ride_id;

  RETURN jsonb_build_object(
    'status',
    'ok',
    'message',
    'Trip status updated to ' || p_target_status
  );
END;
$$;
