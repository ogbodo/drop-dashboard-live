CREATE OR REPLACE FUNCTION public.finalize_ride_billing(
  p_ride_id UUID
)
RETURNS TABLE (
  ride_id UUID,
  quoted_price_amount BIGINT,
  final_price_amount BIGINT,
  actual_trip_seconds INTEGER,
  pickup_wait_seconds INTEGER,
  billable_waiting_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride RECORD;
  v_settings JSONB;
  v_pickup_wait_grace_minutes INTEGER := 10;
  v_allow_price_reduction BOOLEAN := false;
  v_quoted_price BIGINT := 0;
  v_estimated_trip_minutes INTEGER := 0;
  v_actual_trip_seconds INTEGER := 0;
  v_actual_trip_minutes INTEGER := 0;
  v_pickup_wait_seconds INTEGER := 0;
  v_billable_waiting_seconds INTEGER := 0;
  v_effective_billable_minutes INTEGER := 0;
  v_base_per_minute NUMERIC := 0;
  v_recalculated_price BIGINT := 0;
  v_final_price BIGINT := 0;
BEGIN
  SELECT *
  INTO v_ride
  FROM public.rides
  WHERE id = p_ride_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ride % not found for billing finalization', p_ride_id;
  END IF;

  v_settings := public.get_trip_billing_settings();
  v_pickup_wait_grace_minutes := COALESCE(
    (v_settings ->> 'pickup_wait_grace_minutes')::INT,
    10
  );
  v_allow_price_reduction := COALESCE(
    (v_settings ->> 'allow_price_reduction')::BOOLEAN,
    false
  );

  v_quoted_price := GREATEST(
    COALESCE(v_ride.quoted_price_amount, v_ride.price, 0),
    0
  );
  v_estimated_trip_minutes := GREATEST(
    COALESCE(v_ride.quoted_estimated_dropoff_mins, v_ride.estimated_dropoff_mins, 0),
    0
  );

  IF v_ride.started_at IS NOT NULL AND v_ride.completed_at IS NOT NULL THEN
    v_actual_trip_seconds := GREATEST(
      EXTRACT(EPOCH FROM (v_ride.completed_at - v_ride.started_at))::INT,
      0
    );
  END IF;

  IF v_ride.arrived_at IS NOT NULL
     AND v_ride.started_at IS NOT NULL
     AND v_ride.started_at > v_ride.arrived_at THEN
    v_pickup_wait_seconds := GREATEST(
      EXTRACT(EPOCH FROM (v_ride.started_at - v_ride.arrived_at))::INT,
      0
    );
  END IF;

  v_actual_trip_minutes := CASE
    WHEN v_actual_trip_seconds > 0 THEN CEIL(v_actual_trip_seconds / 60.0)::INT
    ELSE 0
  END;

  v_billable_waiting_seconds := GREATEST(
    v_pickup_wait_seconds - (GREATEST(v_pickup_wait_grace_minutes, 0) * 60),
    0
  );

  v_effective_billable_minutes :=
    v_actual_trip_minutes
    + CASE
        WHEN v_billable_waiting_seconds > 0
          THEN CEIL(v_billable_waiting_seconds / 60.0)::INT
        ELSE 0
      END;

  IF v_estimated_trip_minutes > 0 THEN
    v_base_per_minute := v_quoted_price::NUMERIC / v_estimated_trip_minutes::NUMERIC;
  END IF;

  v_recalculated_price := v_quoted_price;

  IF v_base_per_minute > 0 AND v_effective_billable_minutes > v_estimated_trip_minutes THEN
    v_recalculated_price := CEIL(
      v_quoted_price
      + ((v_effective_billable_minutes - v_estimated_trip_minutes) * v_base_per_minute)
    )::BIGINT;
  ELSIF
    v_allow_price_reduction
    AND v_base_per_minute > 0
    AND v_effective_billable_minutes > 0
    AND v_effective_billable_minutes < v_estimated_trip_minutes
  THEN
    v_recalculated_price := CEIL(
      v_effective_billable_minutes * v_base_per_minute
    )::BIGINT;
  END IF;

  v_final_price := CASE
    WHEN v_allow_price_reduction THEN GREATEST(v_recalculated_price, 0)
    ELSE GREATEST(v_quoted_price, v_recalculated_price, 0)
  END;

  UPDATE public.rides AS r
  SET
    quoted_price_amount = COALESCE(r.quoted_price_amount, v_quoted_price),
    quoted_estimated_pickup_mins = COALESCE(
      r.quoted_estimated_pickup_mins,
      r.estimated_pickup_mins
    ),
    quoted_estimated_dropoff_mins = COALESCE(
      r.quoted_estimated_dropoff_mins,
      r.estimated_dropoff_mins
    ),
    price = v_final_price,
    actual_trip_seconds = v_actual_trip_seconds,
    pickup_wait_seconds = v_pickup_wait_seconds,
    billable_waiting_seconds = v_billable_waiting_seconds,
    finalized_price_at = CASE
      WHEN r.status = 'completed'::public.ride_status THEN now()
      ELSE r.finalized_price_at
    END,
    updated_at = now()
  WHERE r.id = p_ride_id;

  RETURN QUERY
  SELECT
    p_ride_id,
    v_quoted_price,
    v_final_price,
    v_actual_trip_seconds,
    v_pickup_wait_seconds,
    v_billable_waiting_seconds;
END;
$$;
