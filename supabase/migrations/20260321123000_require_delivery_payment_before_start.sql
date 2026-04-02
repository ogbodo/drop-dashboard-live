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
       AND COALESCE(v_ride.payment_status, 'pending') <> 'paid' THEN
      RETURN jsonb_build_object(
        'status',
        'error',
        'message',
        'Delivery payment must be confirmed before the delivery can start.'
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
