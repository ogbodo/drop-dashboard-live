CREATE OR REPLACE FUNCTION public.save_driver_payout_account(
  p_bank_name TEXT,
  p_bank_code TEXT,
  p_account_number TEXT,
  p_account_name TEXT DEFAULT NULL,
  p_provider TEXT DEFAULT 'manual',
  p_recipient_reference TEXT DEFAULT NULL,
  p_make_default BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id UUID := auth.uid();
  v_account_id UUID;
  v_should_be_default BOOLEAN;
BEGIN
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_bank_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Bank name is required';
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_bank_code, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Bank code is required';
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_account_number, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Account number is required';
  END IF;

  v_should_be_default := COALESCE(p_make_default, false)
    OR NOT EXISTS (
      SELECT 1
      FROM public.driver_payout_accounts
      WHERE driver_id = v_driver_id
    );

  IF v_should_be_default THEN
    UPDATE public.driver_payout_accounts
    SET is_default = false,
        updated_at = now()
    WHERE driver_id = v_driver_id;
  END IF;

  INSERT INTO public.driver_payout_accounts (
    driver_id,
    bank_name,
    bank_code,
    account_number,
    account_name,
    provider,
    recipient_reference,
    is_default
  )
  VALUES (
    v_driver_id,
    BTRIM(p_bank_name),
    BTRIM(p_bank_code),
    BTRIM(p_account_number),
    NULLIF(BTRIM(COALESCE(p_account_name, '')), ''),
    LOWER(COALESCE(p_provider, 'manual')),
    NULLIF(BTRIM(COALESCE(p_recipient_reference, '')), ''),
    v_should_be_default
  )
  ON CONFLICT (driver_id, bank_code, account_number)
  DO UPDATE SET
    bank_name = EXCLUDED.bank_name,
    account_name = COALESCE(EXCLUDED.account_name, public.driver_payout_accounts.account_name),
    provider = EXCLUDED.provider,
    recipient_reference = COALESCE(EXCLUDED.recipient_reference, public.driver_payout_accounts.recipient_reference),
    is_default = CASE
      WHEN v_should_be_default THEN true
      ELSE public.driver_payout_accounts.is_default
    END,
    updated_at = now()
  RETURNING id INTO v_account_id;

  IF v_should_be_default THEN
    UPDATE public.driver_payout_accounts
    SET is_default = false,
        updated_at = now()
    WHERE driver_id = v_driver_id
      AND id <> v_account_id
      AND is_default = true;
  END IF;

  RETURN v_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_driver_default_payout_account(
  p_payout_account_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id UUID := auth.uid();
  v_account_id UUID;
BEGIN
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  IF p_payout_account_id IS NULL THEN
    RAISE EXCEPTION 'Payout account is required';
  END IF;

  SELECT id
  INTO v_account_id
  FROM public.driver_payout_accounts
  WHERE id = p_payout_account_id
    AND driver_id = v_driver_id;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Payout account was not found';
  END IF;

  UPDATE public.driver_payout_accounts
  SET is_default = (id = v_account_id),
      updated_at = now()
  WHERE driver_id = v_driver_id;

  RETURN v_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_driver_payout_account(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_driver_default_payout_account(UUID)
TO authenticated;
