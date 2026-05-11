CREATE OR REPLACE FUNCTION public.confirm_cash_ride_payment(
  p_ride_id UUID,
  p_amount BIGINT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_ride RECORD;
  v_payment_id UUID;
  v_amount BIGINT;
  v_actor_role TEXT;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT
    id,
    customer_id,
    driver_id,
    price,
    status,
    payment_status
  INTO v_ride
  FROM public.rides
  WHERE id = p_ride_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ride % not found', p_ride_id;
  END IF;

  IF v_actor_id <> v_ride.customer_id AND v_actor_id <> v_ride.driver_id THEN
    RAISE EXCEPTION 'Only the trip customer or driver can confirm cash payment';
  END IF;

  IF v_ride.status <> 'completed' THEN
    RAISE EXCEPTION 'Cash payment can only be confirmed after the trip ends';
  END IF;

  v_amount := GREATEST(
    COALESCE(
      p_amount,
      ROUND(COALESCE(v_ride.price, 0))::BIGINT
    ),
    0
  );

  v_actor_role := CASE
    WHEN v_actor_id = v_ride.customer_id THEN 'customer'
    ELSE 'driver'
  END;

  INSERT INTO public.customer_payments (
    ride_id,
    customer_id,
    amount,
    payment_method,
    provider,
    provider_reference,
    provider_fee_amount,
    status,
    metadata,
    paid_at
  )
  VALUES (
    v_ride.id,
    v_ride.customer_id,
    v_amount,
    'manual',
    'manual',
    'cash-to-driver',
    0,
    'paid',
    jsonb_build_object(
      'collection_model', 'cash_to_driver',
      'confirmed_by', v_actor_role,
      'confirmed_by_user_id', v_actor_id,
      'confirmed_at', now()
    ),
    now()
  )
  ON CONFLICT (ride_id) DO UPDATE
  SET
    amount = EXCLUDED.amount,
    payment_method = EXCLUDED.payment_method,
    provider = EXCLUDED.provider,
    provider_reference = EXCLUDED.provider_reference,
    provider_fee_amount = EXCLUDED.provider_fee_amount,
    status = 'paid',
    metadata = public.customer_payments.metadata || EXCLUDED.metadata,
    paid_at = COALESCE(public.customer_payments.paid_at, now())
  RETURNING id INTO v_payment_id;

  UPDATE public.rides
  SET
    payment_status = 'paid',
    customer_payment_id = v_payment_id,
    "paymentMode" = 'Cash',
    updated_at = (now() AT TIME ZONE 'utc')
  WHERE id = v_ride.id;

  RETURN v_payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_cash_ride_payment(UUID, BIGINT)
TO authenticated, service_role;

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

CREATE OR REPLACE FUNCTION public.handle_completed_ride_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_breakdown RECORD;
  v_processor_fee BIGINT := 0;
  v_payout_fee BIGINT := 0;
  v_latest_payment RECORD;
  v_collection_model TEXT := '';
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed'::public.ride_status THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.payment_status, 'pending') <> 'paid' THEN
    RETURN NEW;
  END IF;

  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    provider,
    payment_method,
    provider_fee_amount,
    metadata
  INTO v_latest_payment
  FROM public.customer_payments
  WHERE ride_id = NEW.id
  ORDER BY created_at DESC
  LIMIT 1;

  v_processor_fee := COALESCE(v_latest_payment.provider_fee_amount, 0);
  v_collection_model := COALESCE(v_latest_payment.metadata->>'collection_model', '');

  IF v_collection_model = 'cash_to_driver'
     OR COALESCE(NEW."paymentMode", '') = 'Cash' THEN
    UPDATE public.rides
    SET
      settlement_status = 'paid',
      updated_at = (now() AT TIME ZONE 'utc')
    WHERE id = NEW.id
      AND settlement_status IS DISTINCT FROM 'paid';

    RETURN NEW;
  END IF;

  SELECT *
  INTO v_breakdown
  FROM public.get_checkout_breakdown(COALESCE(NEW.price, 0), NEW.partner_id);

  INSERT INTO public.ride_financials (
    ride_id,
    booking_fare_amount,
    service_fee_amount,
    partner_fee_amount,
    customer_total_amount,
    processor_fee_amount,
    payout_fee_amount,
    partner_commission_amount,
    driver_gross_amount,
    driver_net_payout_amount,
    drop_net_margin_amount,
    updated_at
  )
  VALUES (
    NEW.id,
    v_breakdown.booking_fare_amount,
    v_breakdown.service_fee_amount,
    v_breakdown.partner_fee_amount,
    v_breakdown.customer_total_amount,
    v_processor_fee,
    v_payout_fee,
    v_breakdown.partner_commission_amount,
    v_breakdown.booking_fare_amount,
    v_breakdown.booking_fare_amount,
    v_breakdown.drop_net_margin_amount - v_processor_fee - v_payout_fee,
    now()
  )
  ON CONFLICT (ride_id) DO UPDATE
  SET
    booking_fare_amount = EXCLUDED.booking_fare_amount,
    service_fee_amount = EXCLUDED.service_fee_amount,
    partner_fee_amount = EXCLUDED.partner_fee_amount,
    customer_total_amount = EXCLUDED.customer_total_amount,
    processor_fee_amount = EXCLUDED.processor_fee_amount,
    payout_fee_amount = EXCLUDED.payout_fee_amount,
    partner_commission_amount = EXCLUDED.partner_commission_amount,
    driver_gross_amount = EXCLUDED.driver_gross_amount,
    driver_net_payout_amount = EXCLUDED.driver_net_payout_amount,
    drop_net_margin_amount = EXCLUDED.drop_net_margin_amount,
    updated_at = now();

  PERFORM public.ensure_driver_wallet(NEW.driver_id);

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
    NEW.driver_id,
    NEW.id,
    'credit',
    v_breakdown.booking_fare_amount,
    'posted',
    'ride-completion-credit',
    jsonb_build_object(
      'ride_status', NEW.status::text,
      'payment_status', NEW.payment_status
    )
  )
  ON CONFLICT DO NOTHING;

  IF NEW.partner_id IS NOT NULL AND v_breakdown.partner_commission_amount > 0 THEN
    INSERT INTO public.partner_commissions (
      ride_id,
      partner_id,
      commission_type,
      commission_value,
      commission_amount,
      status,
      hold_until,
      updated_at
    )
    SELECT
      NEW.id,
      p.id,
      p.default_commission_type,
      p.default_commission_value,
      v_breakdown.partner_commission_amount,
      'pending',
      public.get_partner_commission_hold_until(),
      now()
    FROM public.partners p
    WHERE p.id = NEW.partner_id
    ON CONFLICT (ride_id) DO UPDATE
    SET
      partner_id = EXCLUDED.partner_id,
      commission_type = EXCLUDED.commission_type,
      commission_value = EXCLUDED.commission_value,
      commission_amount = EXCLUDED.commission_amount,
      hold_until = EXCLUDED.hold_until,
      updated_at = now();
  END IF;

  UPDATE public.rides
  SET
    settlement_status = 'wallet_credited',
    updated_at = (now() AT TIME ZONE 'utc')
  WHERE id = NEW.id
    AND settlement_status = 'pending';

  RETURN NEW;
END;
$$;
