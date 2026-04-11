DO $$
DECLARE
  v_value JSONB;
BEGIN
  SELECT value
  INTO v_value
  FROM public.app_configs
  WHERE key = 'trip_billing_settings'
  LIMIT 1;

  INSERT INTO public.app_configs (key, description, value)
  VALUES (
    'trip_billing_settings',
    'Post-trip billing rules for flat wait-only fare adjustments after the applicable pickup or dropoff grace period.',
    jsonb_build_object(
      'pickup_wait_grace_minutes',
      COALESCE((v_value ->> 'pickup_wait_grace_minutes')::INT, 10),
      'allow_price_reduction',
      COALESCE((v_value ->> 'allow_price_reduction')::BOOLEAN, false),
      'delivery_wait_charge_grace_minutes',
      COALESCE((v_value ->> 'delivery_wait_charge_grace_minutes')::INT, 10),
      'delivery_wait_fee_interval_minutes',
      COALESCE((v_value ->> 'delivery_wait_fee_interval_minutes')::INT, 5),
      'delivery_wait_fee_amount',
      COALESCE((v_value ->> 'delivery_wait_fee_amount')::BIGINT, 10)
    )
  )
  ON CONFLICT (key) DO UPDATE
  SET
    description = EXCLUDED.description,
    value = EXCLUDED.value,
    updated_at = now();
END;
$$;

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS dropoff_wait_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_wait_charge_amount BIGINT;

UPDATE public.rides
SET
  dropoff_wait_seconds = COALESCE(dropoff_wait_seconds, 0),
  delivery_wait_charge_amount = COALESCE(delivery_wait_charge_amount, 0)
WHERE
  dropoff_wait_seconds IS NULL
  OR delivery_wait_charge_amount IS NULL;

CREATE OR REPLACE FUNCTION public.get_trip_billing_settings()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_value JSONB;
BEGIN
  SELECT value
  INTO v_value
  FROM public.app_configs
  WHERE key = 'trip_billing_settings'
  LIMIT 1;

  RETURN jsonb_build_object(
    'pickup_wait_grace_minutes',
    COALESCE((v_value ->> 'pickup_wait_grace_minutes')::INT, 10),
    'allow_price_reduction',
    COALESCE((v_value ->> 'allow_price_reduction')::BOOLEAN, false),
    'delivery_wait_charge_grace_minutes',
    COALESCE(
      (v_value ->> 'delivery_wait_charge_grace_minutes')::INT,
      (v_value ->> 'delivery_code_wait_grace_minutes')::INT,
      10
    ),
    'delivery_wait_fee_interval_minutes',
    COALESCE(
      (v_value ->> 'delivery_wait_fee_interval_minutes')::INT,
      (v_value ->> 'wait_fee_interval_minutes')::INT,
      5
    ),
    'delivery_wait_fee_amount',
    COALESCE(
      (v_value ->> 'delivery_wait_fee_amount')::BIGINT,
      (v_value ->> 'wait_fee_amount')::BIGINT,
      10
    )
  );
END;
$$;

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
  v_delivery_wait_charge_grace_minutes INTEGER := 10;
  v_delivery_wait_fee_interval_minutes INTEGER := 5;
  v_delivery_wait_fee_amount BIGINT := 10;
  v_quoted_price BIGINT := 0;
  v_actual_trip_seconds INTEGER := 0;
  v_pickup_wait_seconds INTEGER := 0;
  v_dropoff_wait_seconds INTEGER := 0;
  v_billable_waiting_seconds INTEGER := 0;
  v_final_price BIGINT := 0;
  v_wait_charge_amount BIGINT := 0;
  v_pickup_billable_wait_seconds INTEGER := 0;
  v_dropoff_billable_wait_seconds INTEGER := 0;
  v_wait_fee_block_count INTEGER := 0;
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
  v_delivery_wait_charge_grace_minutes := COALESCE(
    (v_settings ->> 'delivery_wait_charge_grace_minutes')::INT,
    (v_settings ->> 'delivery_code_wait_grace_minutes')::INT,
    10
  );
  v_delivery_wait_fee_interval_minutes := COALESCE(
    (v_settings ->> 'delivery_wait_fee_interval_minutes')::INT,
    (v_settings ->> 'wait_fee_interval_minutes')::INT,
    5
  );
  v_delivery_wait_fee_amount := COALESCE(
    (v_settings ->> 'delivery_wait_fee_amount')::BIGINT,
    (v_settings ->> 'wait_fee_amount')::BIGINT,
    10
  );

  v_quoted_price := GREATEST(
    COALESCE(v_ride.quoted_price_amount, v_ride.price, 0),
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

  IF v_ride.dropoff_arrived_at IS NOT NULL
     AND v_ride.completed_at IS NOT NULL
     AND v_ride.completed_at > v_ride.dropoff_arrived_at THEN
    v_dropoff_wait_seconds := GREATEST(
      EXTRACT(EPOCH FROM (v_ride.completed_at - v_ride.dropoff_arrived_at))::INT,
      0
    );
  END IF;

  IF COALESCE(v_ride.is_delivery, false) THEN
    v_pickup_billable_wait_seconds := GREATEST(
      v_pickup_wait_seconds -
        (GREATEST(v_delivery_wait_charge_grace_minutes, 0) * 60),
      0
    );
    v_dropoff_billable_wait_seconds := GREATEST(
      v_dropoff_wait_seconds -
        (GREATEST(v_delivery_wait_charge_grace_minutes, 0) * 60),
      0
    );
    v_billable_waiting_seconds :=
      v_pickup_billable_wait_seconds + v_dropoff_billable_wait_seconds;
  ELSE
    v_billable_waiting_seconds := GREATEST(
      v_pickup_wait_seconds - (GREATEST(v_pickup_wait_grace_minutes, 0) * 60),
      0
    );
  END IF;

  IF
    v_billable_waiting_seconds > 0
    AND GREATEST(v_delivery_wait_fee_interval_minutes, 0) > 0
    AND GREATEST(v_delivery_wait_fee_amount, 0) > 0
  THEN
    v_wait_fee_block_count := CEIL(
      v_billable_waiting_seconds
      / (GREATEST(v_delivery_wait_fee_interval_minutes, 1) * 60.0)
    )::INT;
    v_wait_charge_amount :=
      GREATEST(v_wait_fee_block_count, 0) * GREATEST(v_delivery_wait_fee_amount, 0);
  END IF;

  v_final_price := GREATEST(v_quoted_price + v_wait_charge_amount, 0);

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
    dropoff_wait_seconds = v_dropoff_wait_seconds,
    delivery_wait_charge_amount = v_wait_charge_amount,
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
