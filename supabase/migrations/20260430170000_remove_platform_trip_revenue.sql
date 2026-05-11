UPDATE public.app_configs
SET value = jsonb_set(
  jsonb_set(
    COALESCE(value, '{}'::jsonb),
    '{service_fee_bands}',
    '[{"max_fare":null,"fee":0}]'::jsonb,
    true
  ),
  '{payment_provider_customer_fee_percent}',
  '0'::jsonb,
  true
),
updated_at = now()
WHERE key = 'hybrid_finance_settings';

CREATE OR REPLACE FUNCTION public.get_drop_service_fee(
  p_booking_fare_amount BIGINT
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
  v_booking_fare BIGINT := GREATEST(COALESCE(p_booking_fare_amount, 0), 0);
BEGIN
  RETURN QUERY
  SELECT
    v_booking_fare,
    0::BIGINT,
    0::BIGINT,
    v_booking_fare,
    0::BIGINT,
    0::BIGINT;
END;
$$;
