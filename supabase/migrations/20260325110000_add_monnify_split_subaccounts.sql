ALTER TABLE public.driver_payout_accounts
ADD COLUMN IF NOT EXISTS provider_email TEXT,
ADD COLUMN IF NOT EXISTS sub_account_code TEXT,
ADD COLUMN IF NOT EXISTS settlement_profile_code TEXT,
ADD COLUMN IF NOT EXISTS settlement_report_emails JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_payout_accounts_sub_account_code
ON public.driver_payout_accounts (sub_account_code)
WHERE sub_account_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.partner_payout_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT,
  provider TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'paystack', 'flutterwave', 'monnify', 'internal')),
  provider_email TEXT,
  recipient_reference TEXT,
  sub_account_code TEXT,
  settlement_profile_code TEXT,
  settlement_report_emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, bank_code, account_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_payout_accounts_one_default
ON public.partner_payout_accounts (partner_id)
WHERE is_default = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_payout_accounts_sub_account_code
ON public.partner_payout_accounts (sub_account_code)
WHERE sub_account_code IS NOT NULL;

ALTER TABLE public.partner_payout_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_payout_accounts_partner_can_manage ON public.partner_payout_accounts;
CREATE POLICY partner_payout_accounts_partner_can_manage
ON public.partner_payout_accounts
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.partner_members pm
    WHERE pm.partner_id = partner_payout_accounts.partner_id
      AND pm.auth_user_id = auth.uid()
      AND pm.role IN ('owner', 'finance')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.partner_members pm
    WHERE pm.partner_id = partner_payout_accounts.partner_id
      AND pm.auth_user_id = auth.uid()
      AND pm.role IN ('owner', 'finance')
  )
);

CREATE OR REPLACE FUNCTION public.save_partner_payout_account(
  p_partner_id UUID,
  p_bank_name TEXT,
  p_bank_code TEXT,
  p_account_number TEXT,
  p_account_name TEXT DEFAULT NULL,
  p_provider TEXT DEFAULT 'manual',
  p_provider_email TEXT DEFAULT NULL,
  p_recipient_reference TEXT DEFAULT NULL,
  p_sub_account_code TEXT DEFAULT NULL,
  p_settlement_profile_code TEXT DEFAULT NULL,
  p_settlement_report_emails JSONB DEFAULT '[]'::jsonb,
  p_make_default BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id UUID := auth.uid();
  v_account_id UUID;
  v_should_be_default BOOLEAN;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  IF p_partner_id IS NULL THEN
    RAISE EXCEPTION 'Partner is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.partner_members
    WHERE partner_id = p_partner_id
      AND auth_user_id = v_auth_user_id
      AND role IN ('owner', 'finance')
  ) THEN
    RAISE EXCEPTION 'You are not allowed to manage this partner payout account';
  END IF;

  v_should_be_default := COALESCE(p_make_default, false)
    OR NOT EXISTS (
      SELECT 1
      FROM public.partner_payout_accounts
      WHERE partner_id = p_partner_id
    );

  IF v_should_be_default THEN
    UPDATE public.partner_payout_accounts
    SET is_default = false,
        updated_at = now()
    WHERE partner_id = p_partner_id;
  END IF;

  INSERT INTO public.partner_payout_accounts (
    partner_id,
    bank_name,
    bank_code,
    account_number,
    account_name,
    provider,
    provider_email,
    recipient_reference,
    sub_account_code,
    settlement_profile_code,
    settlement_report_emails,
    is_default
  )
  VALUES (
    p_partner_id,
    BTRIM(p_bank_name),
    BTRIM(p_bank_code),
    BTRIM(p_account_number),
    NULLIF(BTRIM(COALESCE(p_account_name, '')), ''),
    LOWER(COALESCE(p_provider, 'manual')),
    NULLIF(BTRIM(COALESCE(p_provider_email, '')), ''),
    NULLIF(BTRIM(COALESCE(p_recipient_reference, '')), ''),
    NULLIF(BTRIM(COALESCE(p_sub_account_code, '')), ''),
    NULLIF(BTRIM(COALESCE(p_settlement_profile_code, '')), ''),
    COALESCE(p_settlement_report_emails, '[]'::jsonb),
    v_should_be_default
  )
  ON CONFLICT (partner_id, bank_code, account_number)
  DO UPDATE SET
    bank_name = EXCLUDED.bank_name,
    account_name = COALESCE(EXCLUDED.account_name, public.partner_payout_accounts.account_name),
    provider = EXCLUDED.provider,
    provider_email = COALESCE(EXCLUDED.provider_email, public.partner_payout_accounts.provider_email),
    recipient_reference = COALESCE(EXCLUDED.recipient_reference, public.partner_payout_accounts.recipient_reference),
    sub_account_code = COALESCE(EXCLUDED.sub_account_code, public.partner_payout_accounts.sub_account_code),
    settlement_profile_code = COALESCE(EXCLUDED.settlement_profile_code, public.partner_payout_accounts.settlement_profile_code),
    settlement_report_emails = COALESCE(EXCLUDED.settlement_report_emails, public.partner_payout_accounts.settlement_report_emails),
    is_default = CASE
      WHEN v_should_be_default THEN true
      ELSE public.partner_payout_accounts.is_default
    END,
    updated_at = now()
  RETURNING id INTO v_account_id;

  IF v_should_be_default THEN
    UPDATE public.partner_payout_accounts
    SET is_default = false,
        updated_at = now()
    WHERE partner_id = p_partner_id
      AND id <> v_account_id
      AND is_default = true;
  END IF;

  RETURN v_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_partner_payout_account(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  JSONB,
  BOOLEAN
) TO authenticated;

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
    'payment_provider_customer_fee_percent', 0,
    'driver_minimum_withdrawal_amount', 1000,
    'driver_auto_withdraw_enabled_default', false,
    'partner_commission_hold_days', 7
  )
)
ON CONFLICT (key) DO UPDATE
SET
  value = COALESCE(public.app_configs.value, '{}'::jsonb) || jsonb_build_object(
    'payment_provider_customer_fee_percent',
    0
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
      0
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
BEGIN
  RETURN 0;
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
  v_service_fee BIGINT := public.get_drop_service_fee(p_booking_fare_amount);
  v_partner_fee BIGINT := 0;
  v_partner_commission BIGINT := 0;
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
    v_service_fee,
    v_partner_fee
  );

  RETURN QUERY
  SELECT
    GREATEST(COALESCE(p_booking_fare_amount, 0), 0),
    v_service_fee,
    v_partner_fee,
    GREATEST(COALESCE(p_booking_fare_amount, 0), 0) + v_service_fee + v_partner_fee,
    v_partner_commission,
    v_service_fee + v_partner_fee - v_partner_commission;
END;
$$;
