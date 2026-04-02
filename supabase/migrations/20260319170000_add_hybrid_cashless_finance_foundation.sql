-- Hybrid cashless marketplace foundation:
-- customer pays Drop first, Drop settles drivers, and partner commissions
-- are funded from the trip-level fee pool instead of subscription revenue.

CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'paused')),
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  default_partner_fee_amount BIGINT NOT NULL DEFAULT 0 CHECK (default_partner_fee_amount >= 0),
  default_commission_type TEXT NOT NULL DEFAULT 'flat' CHECK (
    default_commission_type IN ('flat', 'percentage_of_service_fee', 'percentage_of_partner_fee')
  ),
  default_commission_value NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (default_commission_value >= 0),
  payout_schedule TEXT NOT NULL DEFAULT 'monthly' CHECK (payout_schedule IN ('manual', 'weekly', 'biweekly', 'monthly')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'finance', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, auth_user_id)
);

CREATE TABLE IF NOT EXISTS public.partner_referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_customer_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attribution_source TEXT NOT NULL DEFAULT 'referral_code',
  source_code TEXT,
  attributed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE (partner_id, customer_id)
);

CREATE TABLE IF NOT EXISTS public.ride_partner_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL UNIQUE REFERENCES public.rides(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_code TEXT,
  attribution_source TEXT NOT NULL DEFAULT 'referral_code',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL UNIQUE REFERENCES public.rides(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'NGN',
  payment_method TEXT NOT NULL DEFAULT 'transfer' CHECK (payment_method IN ('transfer', 'card', 'wallet', 'manual')),
  provider TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'paystack', 'flutterwave', 'internal')),
  provider_reference TEXT,
  provider_fee_amount BIGINT NOT NULL DEFAULT 0 CHECK (provider_fee_amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'reversed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ride_financials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL UNIQUE REFERENCES public.rides(id) ON DELETE CASCADE,
  booking_fare_amount BIGINT NOT NULL DEFAULT 0 CHECK (booking_fare_amount >= 0),
  service_fee_amount BIGINT NOT NULL DEFAULT 0 CHECK (service_fee_amount >= 0),
  partner_fee_amount BIGINT NOT NULL DEFAULT 0 CHECK (partner_fee_amount >= 0),
  customer_total_amount BIGINT NOT NULL DEFAULT 0 CHECK (customer_total_amount >= 0),
  processor_fee_amount BIGINT NOT NULL DEFAULT 0 CHECK (processor_fee_amount >= 0),
  payout_fee_amount BIGINT NOT NULL DEFAULT 0 CHECK (payout_fee_amount >= 0),
  partner_commission_amount BIGINT NOT NULL DEFAULT 0 CHECK (partner_commission_amount >= 0),
  driver_gross_amount BIGINT NOT NULL DEFAULT 0 CHECK (driver_gross_amount >= 0),
  driver_net_payout_amount BIGINT NOT NULL DEFAULT 0 CHECK (driver_net_payout_amount >= 0),
  drop_net_margin_amount BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NGN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.driver_wallets (
  driver_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  available_balance BIGINT NOT NULL DEFAULT 0,
  pending_balance BIGINT NOT NULL DEFAULT 0,
  auto_withdraw_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_withdraw_minimum_amount BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.driver_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES public.rides(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'adjustment')),
  amount BIGINT NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('pending', 'posted', 'failed', 'reversed')),
  reference TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.driver_payout_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT,
  provider TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'paystack', 'flutterwave', 'internal')),
  recipient_reference TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_id, bank_code, account_number)
);

CREATE TABLE IF NOT EXISTS public.driver_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payout_account_id UUID REFERENCES public.driver_payout_accounts(id) ON DELETE SET NULL,
  wallet_transaction_id UUID NOT NULL UNIQUE REFERENCES public.driver_wallet_transactions(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES public.rides(id) ON DELETE SET NULL,
  amount BIGINT NOT NULL CHECK (amount >= 0),
  provider TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'paystack', 'flutterwave', 'internal')),
  provider_reference TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'paid', 'failed', 'reversed')),
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.partner_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL UNIQUE REFERENCES public.rides(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  commission_type TEXT NOT NULL DEFAULT 'flat' CHECK (
    commission_type IN ('flat', 'percentage_of_service_fee', 'percentage_of_partner_fee')
  ),
  commission_value NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (commission_value >= 0),
  commission_amount BIGINT NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'reversed')),
  hold_until TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  gross_commission_amount BIGINT NOT NULL DEFAULT 0 CHECK (gross_commission_amount >= 0),
  adjustment_amount BIGINT NOT NULL DEFAULT 0,
  net_payout_amount BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  reference TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rides
  ALTER COLUMN "paymentMode" SET DEFAULT 'Transfer';

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attribution_source TEXT,
  ADD COLUMN IF NOT EXISTS source_code TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    payment_status IN ('pending', 'paid', 'failed', 'refunded', 'reversed')
  ),
  ADD COLUMN IF NOT EXISTS customer_payment_id UUID REFERENCES public.customer_payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settlement_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    settlement_status IN ('pending', 'wallet_credited', 'payout_queued', 'paid', 'failed', 'reversed')
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_wallet_tx_unique_ride_credit
ON public.driver_wallet_transactions (ride_id, driver_id, reference)
WHERE ride_id IS NOT NULL AND reference = 'ride-completion-credit';

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_payout_accounts_one_default
ON public.driver_payout_accounts (driver_id)
WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_customer_payments_customer_status
ON public.customer_payments (customer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ride_financials_created_at
ON public.ride_financials (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_wallet_transactions_driver_created
ON public.driver_wallet_transactions (driver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_payouts_driver_status
ON public.driver_payouts (driver_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_commissions_partner_status
ON public.partner_commissions (partner_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rides_partner_payment_status
ON public.rides (partner_id, payment_status, settlement_status, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_drop_service_fee(
  p_booking_fare_amount BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF COALESCE(p_booking_fare_amount, 0) <= 0 THEN
    RETURN 0;
  ELSIF p_booking_fare_amount < 5000 THEN
    RETURN 100;
  ELSIF p_booking_fare_amount < 10000 THEN
    RETURN 150;
  ELSIF p_booking_fare_amount < 20000 THEN
    RETURN 250;
  END IF;

  RETURN 350;
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
BEGIN
  IF p_driver_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.driver_wallets (driver_id)
  VALUES (p_driver_id)
  ON CONFLICT (driver_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_partner_commission_amount(
  p_partner_id UUID,
  p_service_fee_amount BIGINT,
  p_partner_fee_amount BIGINT DEFAULT 0
)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_commission_type TEXT;
  v_commission_value NUMERIC(10, 2);
  v_base_amount BIGINT := 0;
  v_amount BIGINT := 0;
BEGIN
  IF p_partner_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT default_commission_type, default_commission_value
  INTO v_commission_type, v_commission_value
  FROM public.partners
  WHERE id = p_partner_id
    AND status = 'active';

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_commission_type = 'flat' THEN
    v_amount := ROUND(COALESCE(v_commission_value, 0))::BIGINT;
    RETURN GREATEST(v_amount, 0);
  END IF;

  IF v_commission_type = 'percentage_of_partner_fee' THEN
    v_base_amount := GREATEST(COALESCE(p_partner_fee_amount, 0), 0);
  ELSE
    v_base_amount := GREATEST(COALESCE(p_service_fee_amount, 0), 0);
  END IF;

  v_amount := ROUND(v_base_amount * (COALESCE(v_commission_value, 0) / 100.0))::BIGINT;
  RETURN LEAST(GREATEST(v_amount, 0), v_base_amount);
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

CREATE OR REPLACE FUNCTION public.refresh_driver_wallet_balances(
  p_driver_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available BIGINT := 0;
  v_pending BIGINT := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_driver_id THEN
    RAISE EXCEPTION 'You can only queue payouts for your own wallet';
  END IF;

  PERFORM public.ensure_driver_wallet(p_driver_id);

  SELECT
    COALESCE(SUM(
      CASE
        WHEN status = 'posted' AND type = 'credit' THEN amount
        WHEN status = 'posted' AND type = 'debit' THEN -amount
        ELSE 0
      END
    ), 0),
    COALESCE(SUM(
      CASE
        WHEN status = 'pending' AND type = 'credit' THEN amount
        WHEN status = 'pending' AND type = 'debit' THEN -amount
        ELSE 0
      END
    ), 0)
  INTO v_available, v_pending
  FROM public.driver_wallet_transactions
  WHERE driver_id = p_driver_id;

  UPDATE public.driver_wallets
  SET
    available_balance = v_available,
    pending_balance = v_pending,
    updated_at = now()
  WHERE driver_id = p_driver_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_driver_wallet_transaction_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_driver_wallet_balances(COALESCE(NEW.driver_id, OLD.driver_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_customer_payment(
  p_ride_id UUID,
  p_amount BIGINT,
  p_provider TEXT DEFAULT 'manual',
  p_provider_reference TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'transfer',
  p_provider_fee_amount BIGINT DEFAULT 0,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id UUID;
  v_customer_id UUID;
BEGIN
  SELECT customer_id
  INTO v_customer_id
  FROM public.rides
  WHERE id = p_ride_id;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Ride % not found or missing customer', p_ride_id;
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> v_customer_id THEN
    RAISE EXCEPTION 'Only the ride customer can record this payment';
  END IF;

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
    p_ride_id,
    v_customer_id,
    GREATEST(COALESCE(p_amount, 0), 0),
    LOWER(COALESCE(p_payment_method, 'transfer')),
    LOWER(COALESCE(p_provider, 'manual')),
    p_provider_reference,
    GREATEST(COALESCE(p_provider_fee_amount, 0), 0),
    'paid',
    COALESCE(p_metadata, '{}'::jsonb),
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
    metadata = EXCLUDED.metadata,
    paid_at = COALESCE(public.customer_payments.paid_at, now())
  RETURNING id INTO v_payment_id;

  UPDATE public.rides
  SET
    payment_status = 'paid',
    customer_payment_id = v_payment_id,
    "paymentMode" = 'Transfer',
    updated_at = (now() AT TIME ZONE 'utc')
  WHERE id = p_ride_id;

  RETURN v_payment_id;
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
      now() + interval '7 days',
      now()
    FROM public.partners p
    WHERE p.id = NEW.partner_id
    ON CONFLICT (ride_id) DO UPDATE
    SET
      partner_id = EXCLUDED.partner_id,
      commission_type = EXCLUDED.commission_type,
      commission_value = EXCLUDED.commission_value,
      commission_amount = EXCLUDED.commission_amount,
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
  v_payout_account_id UUID;
  v_provider TEXT := LOWER(COALESCE(p_provider, 'manual'));
  v_wallet_transaction_id UUID;
  v_payout_id UUID;
BEGIN
  PERFORM public.ensure_driver_wallet(p_driver_id);

  SELECT available_balance
  INTO v_available_balance
  FROM public.driver_wallets
  WHERE driver_id = p_driver_id
  FOR UPDATE;

  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Payout amount must be greater than zero';
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

CREATE OR REPLACE FUNCTION public.request_driver_withdrawal(
  p_amount BIGINT,
  p_payout_account_id UUID DEFAULT NULL
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
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_driver_payout(
  p_payout_id UUID,
  p_status TEXT DEFAULT 'paid',
  p_provider_reference TEXT DEFAULT NULL,
  p_payout_fee_amount BIGINT DEFAULT 0,
  p_failure_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout RECORD;
  v_wallet_status TEXT := 'posted';
  v_ride_id UUID;
BEGIN
  SELECT *
  INTO v_payout
  FROM public.driver_payouts
  WHERE id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver payout % not found', p_payout_id;
  END IF;

  IF p_status NOT IN ('paid', 'failed', 'reversed') THEN
    RAISE EXCEPTION 'Unsupported payout status %', p_status;
  END IF;

  IF p_status = 'paid' THEN
    v_wallet_status := 'posted';
  ELSIF p_status = 'failed' THEN
    v_wallet_status := 'failed';
  ELSE
    v_wallet_status := 'reversed';
  END IF;

  UPDATE public.driver_payouts
  SET
    status = p_status,
    provider_reference = COALESCE(p_provider_reference, provider_reference),
    failure_reason = p_failure_reason,
    completed_at = now()
  WHERE id = p_payout_id;

  UPDATE public.driver_wallet_transactions
  SET status = v_wallet_status
  WHERE id = v_payout.wallet_transaction_id;

  v_ride_id := v_payout.ride_id;

  IF v_ride_id IS NOT NULL THEN
    IF p_status = 'paid' THEN
      UPDATE public.rides
      SET settlement_status = 'paid'
      WHERE id = v_ride_id;

      UPDATE public.ride_financials
      SET
        payout_fee_amount = payout_fee_amount + GREATEST(COALESCE(p_payout_fee_amount, 0), 0),
        drop_net_margin_amount = drop_net_margin_amount - GREATEST(COALESCE(p_payout_fee_amount, 0), 0),
        updated_at = now()
      WHERE ride_id = v_ride_id;
    ELSIF p_status = 'failed' THEN
      UPDATE public.rides
      SET settlement_status = 'failed'
      WHERE id = v_ride_id;
    ELSE
      UPDATE public.rides
      SET settlement_status = 'reversed'
      WHERE id = v_ride_id;
    END IF;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS tr_driver_wallet_transactions_refresh ON public.driver_wallet_transactions;
CREATE TRIGGER tr_driver_wallet_transactions_refresh
AFTER INSERT OR UPDATE OR DELETE ON public.driver_wallet_transactions
FOR EACH ROW
EXECUTE FUNCTION public.handle_driver_wallet_transaction_change();

DROP TRIGGER IF EXISTS tr_handle_completed_ride_financials ON public.rides;
CREATE TRIGGER tr_handle_completed_ride_financials
AFTER INSERT OR UPDATE OF status, payment_status ON public.rides
FOR EACH ROW
EXECUTE FUNCTION public.handle_completed_ride_financials();

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_customer_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_partner_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_payout_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_payments_customer_can_select
ON public.customer_payments
FOR SELECT
TO authenticated
USING (customer_id = auth.uid());

CREATE POLICY ride_financials_users_can_select_own
ON public.ride_financials
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.rides r
    WHERE r.id = ride_id
      AND (r.customer_id = auth.uid() OR r.driver_id = auth.uid())
  )
);

CREATE POLICY driver_wallets_driver_can_select
ON public.driver_wallets
FOR SELECT
TO authenticated
USING (driver_id = auth.uid());

CREATE POLICY driver_wallet_transactions_driver_can_select
ON public.driver_wallet_transactions
FOR SELECT
TO authenticated
USING (driver_id = auth.uid());

CREATE POLICY driver_payout_accounts_driver_can_manage
ON public.driver_payout_accounts
FOR ALL
TO authenticated
USING (driver_id = auth.uid())
WITH CHECK (driver_id = auth.uid());

CREATE POLICY driver_payouts_driver_can_select
ON public.driver_payouts
FOR SELECT
TO authenticated
USING (driver_id = auth.uid());
