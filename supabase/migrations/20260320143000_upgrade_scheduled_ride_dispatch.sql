CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.scheduled_rides
  ADD COLUMN IF NOT EXISTS quoted_estimated_pickup_mins integer,
  ADD COLUMN IF NOT EXISTS quoted_estimated_dropoff_mins integer,
  ADD COLUMN IF NOT EXISTS quoted_driver_pickup_distance_km numeric(10, 2),
  ADD COLUMN IF NOT EXISTS quoted_eta_source text,
  ADD COLUMN IF NOT EXISTS quoted_eta_last_calculated_at timestamptz,
  ADD COLUMN IF NOT EXISTS quoted_routing_provider text,
  ADD COLUMN IF NOT EXISTS quoted_routing_preference text;

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
  numeric
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
  in_quoted_routing_preference text DEFAULT NULL
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
    quoted_routing_preference
  )
  VALUES (
    in_customer_id,
    in_pickup_address,
    in_destination_address,
    in_pickup_lat,
    in_pickup_lon,
    in_destination_lat,
    in_destination_lon,
    COALESCE(in_requested_vehicle, 'car'::public.vehicle_category),
    in_service_type_id,
    in_scheduled_for,
    GREATEST(COALESCE(in_dispatch_lead_minutes, 15), 5),
    in_quoted_price,
    in_quoted_distance_km,
    in_quoted_estimated_pickup_mins,
    in_quoted_estimated_dropoff_mins,
    in_quoted_driver_pickup_distance_km,
    in_quoted_eta_source,
    in_quoted_eta_last_calculated_at,
    in_quoted_routing_provider,
    in_quoted_routing_preference
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

CREATE OR REPLACE FUNCTION public.claim_due_scheduled_rides(
  p_limit integer DEFAULT 20
)
RETURNS SETOF public.scheduled_rides
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH due AS (
    SELECT sr.id
    FROM public.scheduled_rides sr
    WHERE sr.status = 'scheduled'
      AND sr.spawned_ride_id IS NULL
      AND sr.scheduled_for <= now() + make_interval(mins => sr.dispatch_lead_minutes)
    ORDER BY sr.scheduled_for ASC
    LIMIT GREATEST(COALESCE(p_limit, 20), 1)
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.scheduled_rides sr
    SET
      status = 'dispatching',
      dispatched_at = now(),
      dispatch_attempts = sr.dispatch_attempts + 1,
      last_dispatch_error = NULL,
      updated_at = now() AT TIME ZONE 'utc'
    FROM due
    WHERE sr.id = due.id
    RETURNING sr.*
  )
  SELECT * FROM claimed;
$$;

CREATE OR REPLACE FUNCTION public.complete_scheduled_ride_dispatch(
  p_scheduled_ride_id uuid,
  p_spawned_ride_id uuid
)
RETURNS public.scheduled_rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.scheduled_rides%ROWTYPE;
BEGIN
  UPDATE public.scheduled_rides
  SET
    spawned_ride_id = p_spawned_ride_id,
    status = 'dispatching',
    last_dispatch_error = NULL,
    updated_at = now() AT TIME ZONE 'utc'
  WHERE id = p_scheduled_ride_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_scheduled_ride_dispatch(
  p_scheduled_ride_id uuid,
  p_error text
)
RETURNS public.scheduled_rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.scheduled_rides%ROWTYPE;
BEGIN
  UPDATE public.scheduled_rides
  SET
    status = 'scheduled',
    last_dispatch_error = LEFT(COALESCE(p_error, 'Unknown dispatch error'), 500),
    updated_at = now() AT TIME ZONE 'utc'
  WHERE id = p_scheduled_ride_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_due_scheduled_rides()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scheduled_ride public.scheduled_rides%ROWTYPE;
  v_created_ride RECORD;
  v_dispatched_count integer := 0;
BEGIN
  FOR v_scheduled_ride IN
    SELECT * FROM public.claim_due_scheduled_rides(20)
  LOOP
    BEGIN
      SELECT *
      INTO v_created_ride
      FROM public.create_ride_v2(
        v_scheduled_ride.customer_id,
        v_scheduled_ride.pickup_lon,
        v_scheduled_ride.pickup_lat,
        v_scheduled_ride.destination_lon,
        v_scheduled_ride.destination_lat,
        v_scheduled_ride.pickup_address,
        v_scheduled_ride.destination_address,
        false,
        v_scheduled_ride.requested_vehicle_type,
        v_scheduled_ride.service_type_id,
        NULL,
        COALESCE(v_scheduled_ride.quoted_price, NULL),
        COALESCE(v_scheduled_ride.quoted_distance_km, NULL),
        COALESCE(v_scheduled_ride.quoted_estimated_pickup_mins, NULL),
        COALESCE(v_scheduled_ride.quoted_estimated_dropoff_mins, NULL),
        COALESCE(v_scheduled_ride.quoted_eta_source, 'scheduled_quote_fallback'),
        COALESCE(v_scheduled_ride.quoted_eta_last_calculated_at, now()),
        COALESCE(v_scheduled_ride.quoted_distance_km, NULL),
        COALESCE(v_scheduled_ride.quoted_driver_pickup_distance_km, NULL),
        COALESCE(v_scheduled_ride.quoted_routing_provider, 'scheduled_quote'),
        COALESCE(v_scheduled_ride.quoted_routing_preference, 'quoted')
      )
      LIMIT 1;

      PERFORM public.complete_scheduled_ride_dispatch(
        v_scheduled_ride.id,
        v_created_ride.id
      );

      v_dispatched_count := v_dispatched_count + 1;
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM public.fail_scheduled_ride_dispatch(v_scheduled_ride.id, SQLERRM);
    END;
  END LOOP;

  RETURN v_dispatched_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_scheduled_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  project_url text;
  anon_key text;
  dispatch_token text;
BEGIN
  SELECT decrypted_secret
  INTO project_url
  FROM vault.decrypted_secrets
  WHERE name = 'project_url'
  LIMIT 1;

  SELECT decrypted_secret
  INTO anon_key
  FROM vault.decrypted_secrets
  WHERE name = 'anon_key'
  LIMIT 1;

  SELECT decrypted_secret
  INTO dispatch_token
  FROM vault.decrypted_secrets
  WHERE name = 'scheduled_dispatch_token'
  LIMIT 1;

  IF project_url IS NULL OR anon_key IS NULL OR dispatch_token IS NULL THEN
    RAISE LOG 'scheduled dispatch skipped: missing vault secret project_url, anon_key, or scheduled_dispatch_token';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := project_url || '/functions/v1/dispatch-scheduled-rides',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'apikey', anon_key,
      'x-scheduled-dispatch-token', dispatch_token
    ),
    body := jsonb_build_object(
      'batchSize', 20,
      'source', 'pg_cron'
    )
  );
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'dispatch-scheduled-rides';
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'dispatch-scheduled-rides'
  ) THEN
    PERFORM cron.schedule(
      'dispatch-scheduled-rides',
      '* * * * *',
      'SELECT public.invoke_scheduled_dispatch();'
    );
  END IF;
END $$;

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
  text
) TO authenticated;
