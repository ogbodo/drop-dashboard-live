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
    'payment_provider_customer_fee_percent', 1.5,
    'driver_minimum_withdrawal_amount', 1000,
    'driver_auto_withdraw_enabled_default', false,
    'partner_commission_hold_days', 7
  )
)
ON CONFLICT (key) DO UPDATE
SET
  value = COALESCE(public.app_configs.value, '{}'::jsonb) || jsonb_build_object(
    'payment_provider_customer_fee_percent',
    COALESCE(
      NULLIF(public.app_configs.value ->> 'payment_provider_customer_fee_percent', '')::numeric,
      1.5
    )
  ),
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
    'payment_provider_customer_fee_percent',
    COALESCE(
      NULLIF(v_value ->> 'payment_provider_customer_fee_percent', '')::numeric,
      1.5
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

CREATE OR REPLACE FUNCTION public.get_customer_payment_processor_fee_amount(
  p_subtotal_amount BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_settings JSONB;
  v_fee_percent NUMERIC := 1.5;
BEGIN
  IF COALESCE(p_subtotal_amount, 0) <= 0 THEN
    RETURN 0;
  END IF;

  v_settings := public.get_hybrid_finance_settings();
  v_fee_percent := COALESCE(
    NULLIF(v_settings ->> 'payment_provider_customer_fee_percent', '')::numeric,
    1.5
  );

  RETURN GREATEST(
    CEIL((GREATEST(COALESCE(p_subtotal_amount, 0), 0)::numeric * GREATEST(v_fee_percent, 0)) / 100),
    0
  )::BIGINT;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_checkout_breakdown(
  p_booking_fare_amount BIGINT,
  p_partner_id UUID DEFAULT NULL
)
RETURNS TABLE (
  booking_fare_amount BIGINT,
  service_fee_amount BIGINT,
  partner_fee_amount BIGINT,
  customer_total_amount BIGINT,
  partner_commission_amount BIGINT,
  drop_net_margin_amount BIGINT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_base_service_fee BIGINT := public.get_drop_service_fee(p_booking_fare_amount);
  v_partner_fee BIGINT := 0;
  v_partner_commission BIGINT := 0;
  v_customer_subtotal BIGINT := 0;
  v_processor_pass_through_fee BIGINT := 0;
  v_customer_service_fee BIGINT := 0;
BEGIN
  IF p_partner_id IS NOT NULL THEN
    SELECT default_partner_fee_amount
    INTO v_partner_fee
    FROM public.partners
    WHERE id = p_partner_id
      AND status = 'active';
  END IF;

  v_partner_fee := GREATEST(COALESCE(v_partner_fee, 0), 0);
  v_partner_commission := public.get_partner_commission_amount(
    p_partner_id,
    v_base_service_fee,
    v_partner_fee
  );
  v_customer_subtotal :=
    GREATEST(COALESCE(p_booking_fare_amount, 0), 0) +
    v_base_service_fee +
    v_partner_fee;
  v_processor_pass_through_fee :=
    public.get_customer_payment_processor_fee_amount(v_customer_subtotal);
  v_customer_service_fee := v_base_service_fee + v_processor_pass_through_fee;

  RETURN QUERY
  SELECT
    GREATEST(COALESCE(p_booking_fare_amount, 0), 0),
    v_customer_service_fee,
    v_partner_fee,
    v_customer_subtotal + v_processor_pass_through_fee,
    v_partner_commission,
    v_customer_service_fee + v_partner_fee - v_partner_commission;
END;
$$;

ALTER TABLE public.customer_payments
DROP CONSTRAINT IF EXISTS customer_payments_provider_check;

ALTER TABLE public.customer_payments
ADD CONSTRAINT customer_payments_provider_check
CHECK (provider IN ('manual', 'paystack', 'flutterwave', 'monnify', 'internal'));

ALTER TABLE public.driver_payout_accounts
DROP CONSTRAINT IF EXISTS driver_payout_accounts_provider_check;

ALTER TABLE public.driver_payout_accounts
ADD CONSTRAINT driver_payout_accounts_provider_check
CHECK (provider IN ('manual', 'paystack', 'flutterwave', 'monnify', 'internal'));

ALTER TABLE public.driver_payouts
DROP CONSTRAINT IF EXISTS driver_payouts_provider_check;

ALTER TABLE public.driver_payouts
ADD CONSTRAINT driver_payouts_provider_check
CHECK (provider IN ('manual', 'paystack', 'flutterwave', 'monnify', 'internal'));
