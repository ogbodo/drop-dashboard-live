INSERT INTO public.app_configs (key, description, value)
VALUES (
  'trip_billing_settings',
  'Post-trip billing rules for recalculating final fare from actual trip and pickup waiting time.',
  jsonb_build_object(
    'pickup_wait_grace_minutes', 10,
    'allow_price_reduction', false
  )
)
ON CONFLICT (key) DO UPDATE
SET
  description = EXCLUDED.description,
  value = EXCLUDED.value,
  updated_at = now();

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS quoted_price_amount BIGINT,
  ADD COLUMN IF NOT EXISTS quoted_estimated_pickup_mins INTEGER,
  ADD COLUMN IF NOT EXISTS quoted_estimated_dropoff_mins INTEGER,
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_trip_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS pickup_wait_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS billable_waiting_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS finalized_price_at TIMESTAMPTZ;

UPDATE public.rides
SET
  quoted_price_amount = COALESCE(quoted_price_amount, price),
  quoted_estimated_pickup_mins = COALESCE(
    quoted_estimated_pickup_mins,
    estimated_pickup_mins
  ),
  quoted_estimated_dropoff_mins = COALESCE(
    quoted_estimated_dropoff_mins,
    estimated_dropoff_mins
  ),
  pickup_wait_seconds = COALESCE(pickup_wait_seconds, 0),
  billable_waiting_seconds = COALESCE(billable_waiting_seconds, 0)
WHERE
  quoted_price_amount IS NULL
  OR quoted_estimated_pickup_mins IS NULL
  OR quoted_estimated_dropoff_mins IS NULL
  OR pickup_wait_seconds IS NULL
  OR billable_waiting_seconds IS NULL;

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
    COALESCE((v_value ->> 'allow_price_reduction')::BOOLEAN, false)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_ride_quote_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.quoted_price_amount IS NULL THEN
    NEW.quoted_price_amount := NEW.price;
  END IF;

  IF NEW.quoted_estimated_pickup_mins IS NULL THEN
    NEW.quoted_estimated_pickup_mins := NEW.estimated_pickup_mins;
  END IF;

  IF NEW.quoted_estimated_dropoff_mins IS NULL THEN
    NEW.quoted_estimated_dropoff_mins := NEW.estimated_dropoff_mins;
  END IF;

  IF NEW.pickup_wait_seconds IS NULL THEN
    NEW.pickup_wait_seconds := 0;
  END IF;

  IF NEW.billable_waiting_seconds IS NULL THEN
    NEW.billable_waiting_seconds := 0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_ride_quote_fields ON public.rides;
CREATE TRIGGER tr_sync_ride_quote_fields
BEFORE INSERT OR UPDATE OF price, estimated_pickup_mins, estimated_dropoff_mins
ON public.rides
FOR EACH ROW
EXECUTE FUNCTION public.sync_ride_quote_fields();

CREATE OR REPLACE FUNCTION public.stamp_ride_arrived_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF
    NEW.status = 'arrived'::public.ride_status
    AND OLD.status IS DISTINCT FROM NEW.status
    AND NEW.arrived_at IS NULL
  THEN
    NEW.arrived_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_stamp_ride_arrived_at ON public.rides;
CREATE TRIGGER tr_stamp_ride_arrived_at
BEFORE UPDATE OF status
ON public.rides
FOR EACH ROW
EXECUTE FUNCTION public.stamp_ride_arrived_at();

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

  IF v_ride.arrived_at IS NOT NULL AND v_ride.started_at IS NOT NULL AND v_ride.started_at > v_ride.arrived_at THEN
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

  UPDATE public.rides
  SET
    quoted_price_amount = COALESCE(quoted_price_amount, v_quoted_price),
    quoted_estimated_pickup_mins = COALESCE(
      quoted_estimated_pickup_mins,
      estimated_pickup_mins
    ),
    quoted_estimated_dropoff_mins = COALESCE(
      quoted_estimated_dropoff_mins,
      estimated_dropoff_mins
    ),
    price = v_final_price,
    actual_trip_seconds = v_actual_trip_seconds,
    pickup_wait_seconds = v_pickup_wait_seconds,
    billable_waiting_seconds = v_billable_waiting_seconds,
    finalized_price_at = CASE
      WHEN status = 'completed'::public.ride_status THEN now()
      ELSE finalized_price_at
    END,
    updated_at = now()
  WHERE id = p_ride_id;

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

  IF p_target_status = 'completed' THEN
    PERFORM public.finalize_ride_billing(p_ride_id);
  END IF;

  RETURN jsonb_build_object(
    'status',
    'ok',
    'message',
    'Trip status updated to ' || p_target_status
  );
END;
$$;
