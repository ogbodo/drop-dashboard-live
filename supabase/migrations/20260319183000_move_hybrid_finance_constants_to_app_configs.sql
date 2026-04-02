-- Move hybrid cashless finance constants into app_configs so pricing and
-- settlement behavior can be tuned without changing SQL code again.

INSERT INTO public.app_configs (key, description, value)
VALUES (
  'hybrid_finance_settings',
  'Hybrid cashless marketplace settings for service fees, withdrawals, and partner settlement.',
  jsonb_build_object(
    'service_fee_bands',
    jsonb_build_array(
      jsonb_build_object('max_fare', 4999, 'fee', 100),
      jsonb_build_object('max_fare', 9999, 'fee', 150),
      jsonb_build_object('max_fare', 19999, 'fee', 250),
      jsonb_build_object('max_fare', NULL, 'fee', 350)
    ),
    'driver_minimum_withdrawal_amount', 1000,
    'driver_auto_withdraw_enabled_default', false,
    'partner_commission_hold_days', 7
  )
)
ON CONFLICT (key) DO UPDATE
SET
  description = EXCLUDED.description,
  value = EXCLUDED.value,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.get_hybrid_finance_settings()
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
  WHERE key = 'hybrid_finance_settings'
  LIMIT 1;

  RETURN jsonb_build_object(
    'service_fee_bands',
    COALESCE(
      v_value -> 'service_fee_bands',
      jsonb_build_array(
        jsonb_build_object('max_fare', 4999, 'fee', 100),
        jsonb_build_object('max_fare', 9999, 'fee', 150),
        jsonb_build_object('max_fare', 19999, 'fee', 250),
        jsonb_build_object('max_fare', NULL, 'fee', 350)
      )
    ),
    'driver_minimum_withdrawal_amount',
    COALESCE((v_value ->> 'driver_minimum_withdrawal_amount')::BIGINT, 1000),
    'driver_auto_withdraw_enabled_default',
    COALESCE((v_value ->> 'driver_auto_withdraw_enabled_default')::BOOLEAN, false),
    'partner_commission_hold_days',
    COALESCE((v_value ->> 'partner_commission_hold_days')::INT, 7)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_driver_minimum_withdrawal_amount()
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_settings JSONB;
BEGIN
  v_settings := public.get_hybrid_finance_settings();
  RETURN COALESCE((v_settings ->> 'driver_minimum_withdrawal_amount')::BIGINT, 1000);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_partner_commission_hold_until()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_settings JSONB;
  v_hold_days INT := 7;
BEGIN
  v_settings := public.get_hybrid_finance_settings();
  v_hold_days := COALESCE((v_settings ->> 'partner_commission_hold_days')::INT, 7);
  RETURN now() + make_interval(days => GREATEST(v_hold_days, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_drop_service_fee(
  p_booking_fare_amount BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_settings JSONB;
  v_band JSONB;
  v_max_fare BIGINT;
  v_fee BIGINT := 0;
BEGIN
  IF COALESCE(p_booking_fare_amount, 0) <= 0 THEN
    RETURN 0;
  END IF;

  v_settings := public.get_hybrid_finance_settings();

  FOR v_band IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(v_settings -> 'service_fee_bands', '[]'::jsonb))
  LOOP
    v_fee := COALESCE((v_band ->> 'fee')::BIGINT, v_fee);
    v_max_fare := NULLIF(v_band ->> 'max_fare', '')::BIGINT;

    IF v_max_fare IS NULL OR p_booking_fare_amount <= v_max_fare THEN
      RETURN GREATEST(COALESCE(v_fee, 0), 0);
    END IF;
  END LOOP;

  RETURN GREATEST(COALESCE(v_fee, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_driver_wallet(
  p_driver_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings JSONB;
BEGIN
  IF p_driver_id IS NULL THEN
    RETURN;
  END IF;

  v_settings := public.get_hybrid_finance_settings();

  INSERT INTO public.driver_wallets (
    driver_id,
    auto_withdraw_enabled,
    auto_withdraw_minimum_amount
  )
  VALUES (
    p_driver_id,
    COALESCE((v_settings ->> 'driver_auto_withdraw_enabled_default')::BOOLEAN, false),
    COALESCE((v_settings ->> 'driver_minimum_withdrawal_amount')::BIGINT, 1000)
  )
  ON CONFLICT (driver_id) DO NOTHING;
END;
$$;

ALTER TABLE public.partner_commissions
ALTER COLUMN hold_until SET DEFAULT public.get_partner_commission_hold_until();

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

  SELECT *
  INTO v_breakdown
  FROM public.get_checkout_breakdown(COALESCE(NEW.price, 0), NEW.partner_id);

  SELECT COALESCE(provider_fee_amount, 0)
  INTO v_processor_fee
  FROM public.customer_payments
  WHERE ride_id = NEW.id
  ORDER BY created_at DESC
  LIMIT 1;

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

CREATE OR REPLACE FUNCTION public.queue_driver_payout(
  p_driver_id UUID,
  p_amount BIGINT,
  p_payout_account_id UUID DEFAULT NULL,
  p_provider TEXT DEFAULT NULL,
  p_ride_id UUID DEFAULT NULL
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
    jsonb_build_object('requested_by', COALESCE(auth.uid()::text, 'system'))
  )
  RETURNING id INTO v_wallet_transaction_id;

  INSERT INTO public.driver_payouts (
    driver_id,
    payout_account_id,
    wallet_transaction_id,
    ride_id,
    amount,
    provider,
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
