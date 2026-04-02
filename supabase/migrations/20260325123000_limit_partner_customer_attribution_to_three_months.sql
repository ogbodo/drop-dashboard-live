INSERT INTO public.app_configs (key, description, value)
VALUES (
  'hybrid_finance_settings',
  'Hybrid cashless marketplace settings for service fees, withdrawals, partner settlement, and customer attribution windows.',
  jsonb_build_object(
    'partner_customer_attribution_months', 3
  )
)
ON CONFLICT (key) DO UPDATE
SET
  value = COALESCE(public.app_configs.value, '{}'::jsonb) || jsonb_build_object(
    'partner_customer_attribution_months',
    COALESCE(
      NULLIF(public.app_configs.value ->> 'partner_customer_attribution_months', '')::INT,
      3
    )
  ),
  updated_at = now();

CREATE OR REPLACE FUNCTION public.get_partner_customer_attribution_months()
RETURNS INT
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

  RETURN GREATEST(
    COALESCE(
      NULLIF(v_value ->> 'partner_customer_attribution_months', '')::INT,
      3
    ),
    0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_partner_customer_link_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.attributed_at IS NULL THEN
    NEW.attributed_at := now();
  END IF;

  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NEW.attributed_at +
      make_interval(months => public.get_partner_customer_attribution_months());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_partner_customer_links_apply_expiry
ON public.partner_customer_links;

CREATE TRIGGER tr_partner_customer_links_apply_expiry
BEFORE INSERT OR UPDATE OF attributed_at, expires_at
ON public.partner_customer_links
FOR EACH ROW
EXECUTE FUNCTION public.apply_partner_customer_link_expiry();

UPDATE public.partner_customer_links
SET expires_at = attributed_at +
  make_interval(months => public.get_partner_customer_attribution_months())
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_partner_customer_links_customer_active_window
ON public.partner_customer_links (customer_id, expires_at DESC, attributed_at DESC);

CREATE OR REPLACE FUNCTION public.get_active_partner_customer_link(
  p_customer_id UUID,
  p_as_of TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  partner_id UUID,
  attribution_source TEXT,
  source_code TEXT,
  attributed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pcl.partner_id,
    pcl.attribution_source,
    pcl.source_code,
    pcl.attributed_at,
    pcl.expires_at
  FROM public.partner_customer_links pcl
  JOIN public.partners p
    ON p.id = pcl.partner_id
  WHERE pcl.customer_id = p_customer_id
    AND pcl.attributed_at <= COALESCE(p_as_of, now())
    AND (
      pcl.expires_at IS NULL
      OR pcl.expires_at > COALESCE(p_as_of, now())
    )
    AND p.status = 'active'
  ORDER BY pcl.attributed_at DESC, pcl.id DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_partner_attribution_to_ride()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link RECORD;
  v_effective_created_at TIMESTAMPTZ := COALESCE(NEW.created_at, now());
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.partner_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_link
  FROM public.get_active_partner_customer_link(NEW.customer_id, v_effective_created_at);

  IF v_link.partner_id IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.partner_id := v_link.partner_id;
  NEW.attribution_source := COALESCE(v_link.attribution_source, NEW.attribution_source);
  NEW.source_code := COALESCE(v_link.source_code, NEW.source_code);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_rides_apply_partner_attribution
ON public.rides;

CREATE TRIGGER tr_rides_apply_partner_attribution
BEFORE INSERT
ON public.rides
FOR EACH ROW
EXECUTE FUNCTION public.apply_partner_attribution_to_ride();

CREATE OR REPLACE FUNCTION public.sync_ride_partner_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.partner_id IS NULL THEN
    DELETE FROM public.ride_partner_attributions
    WHERE ride_id = NEW.id;

    RETURN NEW;
  END IF;

  INSERT INTO public.ride_partner_attributions (
    ride_id,
    partner_id,
    customer_id,
    source_code,
    attribution_source
  )
  VALUES (
    NEW.id,
    NEW.partner_id,
    NEW.customer_id,
    NEW.source_code,
    COALESCE(NEW.attribution_source, 'referral_code')
  )
  ON CONFLICT (ride_id) DO UPDATE
  SET
    partner_id = EXCLUDED.partner_id,
    customer_id = EXCLUDED.customer_id,
    source_code = EXCLUDED.source_code,
    attribution_source = EXCLUDED.attribution_source;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_rides_sync_partner_attribution
ON public.rides;

CREATE TRIGGER tr_rides_sync_partner_attribution
AFTER INSERT OR UPDATE OF partner_id, source_code, attribution_source
ON public.rides
FOR EACH ROW
EXECUTE FUNCTION public.sync_ride_partner_attribution();
