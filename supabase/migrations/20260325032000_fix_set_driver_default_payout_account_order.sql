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

  IF EXISTS (
    SELECT 1
    FROM public.driver_payout_accounts
    WHERE id = v_account_id
      AND driver_id = v_driver_id
      AND is_default = true
  ) THEN
    RETURN v_account_id;
  END IF;

  UPDATE public.driver_payout_accounts
  SET is_default = false,
      updated_at = now()
  WHERE driver_id = v_driver_id
    AND is_default = true
    AND id <> v_account_id;

  UPDATE public.driver_payout_accounts
  SET is_default = true,
      updated_at = now()
  WHERE id = v_account_id
    AND driver_id = v_driver_id;

  RETURN v_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_driver_default_payout_account(UUID)
TO authenticated;
