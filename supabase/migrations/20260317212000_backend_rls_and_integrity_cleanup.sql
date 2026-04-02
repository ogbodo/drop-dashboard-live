-- Repair missing ride metadata, align RLS with actual app writes, and prune dead SQL paths.

ALTER TABLE public.rides
ADD COLUMN IF NOT EXISTS cancelled_by text;

ALTER TABLE public.rides
DROP CONSTRAINT IF EXISTS rides_cancelled_by_check;

ALTER TABLE public.rides
ADD CONSTRAINT rides_cancelled_by_check
CHECK (cancelled_by IS NULL OR cancelled_by IN ('customer', 'driver', 'system'));

COMMENT ON COLUMN public.rides.cancelled_by IS
'Tracks who cancelled the ride: customer, driver, or system.';

CREATE OR REPLACE FUNCTION public.set_ride_cancelled_by_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'timed_out'::public.ride_status AND NEW.cancelled_by IS NULL THEN
    NEW.cancelled_by := 'system';
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled'::public.ride_status
     AND COALESCE(OLD.status::text, '') <> 'cancelled' THEN
    IF NEW.cancelled_by IS NULL THEN
      IF auth.uid() = OLD.customer_id THEN
        NEW.cancelled_by := 'customer';
      ELSIF auth.uid() = OLD.driver_id THEN
        NEW.cancelled_by := 'driver';
      ELSE
        NEW.cancelled_by := 'system';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_ride_cancelled_by ON public.rides;
CREATE TRIGGER tr_set_ride_cancelled_by
BEFORE UPDATE OF status, cancelled_by ON public.rides
FOR EACH ROW
EXECUTE FUNCTION public.set_ride_cancelled_by_trigger();

UPDATE public.rides r
SET cancelled_by = resolved.cancelled_by
FROM (
  SELECT
    r0.id,
    COALESCE(
      (
        SELECT CASE lower(l.role)
          WHEN 'customer' THEN 'customer'
          WHEN 'driver' THEN 'driver'
          ELSE NULL
        END
        FROM public.ride_cancellation_logs l
        WHERE l.ride_id = r0.id
        ORDER BY l.created_at DESC
        LIMIT 1
      ),
      CASE
        WHEN r0.status = 'timed_out'::public.ride_status THEN 'system'
        ELSE NULL
      END
    ) AS cancelled_by
  FROM public.rides r0
  WHERE r0.cancelled_by IS NULL
    AND r0.status IN ('cancelled'::public.ride_status, 'timed_out'::public.ride_status)
) AS resolved
WHERE r.id = resolved.id
  AND resolved.cancelled_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_profile_system_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = OLD.id THEN
    IF NEW.has_paid IS DISTINCT FROM OLD.has_paid THEN
      RAISE EXCEPTION 'has_paid can only be updated by the system';
    END IF;

    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
      RAISE EXCEPTION 'is_verified can only be updated by the system';
    END IF;

    IF NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at THEN
      RAISE EXCEPTION 'subscription_expires_at can only be updated by the system';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_protect_profile_system_fields ON public.profiles;
CREATE TRIGGER tr_protect_profile_system_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_system_fields();

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update restricted profile" ON public.profiles;
DROP POLICY IF EXISTS "System can update payment status" ON public.profiles;

CREATE POLICY profiles_user_can_select_self
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY profiles_user_can_update_self
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Customers can view own rides" ON public.rides;
DROP POLICY IF EXISTS "Customers can view their own rides" ON public.rides;
DROP POLICY IF EXISTS "Realtime Access" ON public.rides;
DROP POLICY IF EXISTS "Users can see own rides" ON public.rides;
DROP POLICY IF EXISTS "Users can view own rides" ON public.rides;
DROP POLICY IF EXISTS customers_select_own_rides ON public.rides;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.rides;
DROP POLICY IF EXISTS drivers_can_read_rides_by_offer_or_assignment ON public.rides;
DROP POLICY IF EXISTS rides_driver_can_select ON public.rides;
DROP POLICY IF EXISTS drivers_update_ride_when_offered ON public.rides;
DROP POLICY IF EXISTS rides_driver_can_update ON public.rides;

CREATE POLICY rides_customer_can_select_self
ON public.rides
FOR SELECT
TO authenticated
USING (auth.uid() = customer_id);

CREATE POLICY rides_driver_can_select_related
ON public.rides
FOR SELECT
TO authenticated
USING (
  driver_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.ride_offers ro
    WHERE ro.ride_id = rides.id
      AND ro.driver_id = auth.uid()
  )
);

CREATE POLICY rides_driver_can_accept_from_offer
ON public.rides
FOR UPDATE
TO authenticated
USING (
  status = 'pending'::public.ride_status
  AND EXISTS (
    SELECT 1
    FROM public.ride_offers ro
    WHERE ro.ride_id = rides.id
      AND ro.driver_id = auth.uid()
      AND ro.status = 'offered'
      AND (ro.expires_at IS NULL OR ro.expires_at > now())
  )
)
WITH CHECK (
  driver_id = auth.uid()
  AND status = 'accepted'::public.ride_status
);

CREATE POLICY rides_driver_can_update_assigned
ON public.rides
FOR UPDATE
TO authenticated
USING (
  driver_id = auth.uid()
  AND status IN (
    'accepted'::public.ride_status,
    'arrived'::public.ride_status,
    'cancelled'::public.ride_status
  )
)
WITH CHECK (
  driver_id = auth.uid()
  AND status IN (
    'accepted'::public.ride_status,
    'arrived'::public.ride_status,
    'cancelled'::public.ride_status
  )
);

CREATE POLICY rides_customer_can_cancel_pending_or_tag_cancelled
ON public.rides
FOR UPDATE
TO authenticated
USING (
  customer_id = auth.uid()
  AND status IN (
    'pending'::public.ride_status,
    'cancelled'::public.ride_status
  )
)
WITH CHECK (
  customer_id = auth.uid()
  AND status = 'cancelled'::public.ride_status
);

DROP POLICY IF EXISTS drivers_can_read_ride_offers_their_own ON public.ride_offers;
DROP POLICY IF EXISTS offers_driver_can_select ON public.ride_offers;
DROP POLICY IF EXISTS drivers_update_own_ride_offers ON public.ride_offers;
DROP POLICY IF EXISTS offers_driver_can_update ON public.ride_offers;

CREATE POLICY ride_offers_driver_can_select_self
ON public.ride_offers
FOR SELECT
TO authenticated
USING (driver_id = auth.uid());

CREATE POLICY ride_offers_driver_can_update_self
ON public.ride_offers
FOR UPDATE
TO authenticated
USING (driver_id = auth.uid())
WITH CHECK (driver_id = auth.uid());

DROP TRIGGER IF EXISTS tr_generate_ride_codes ON public.rides;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'generate_ride_codes'
      AND NOT t.tgisinternal
  ) THEN
    DROP FUNCTION IF EXISTS public.generate_ride_codes();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'handle_ride_pre_insert'
      AND NOT t.tgisinternal
  ) THEN
    DROP FUNCTION IF EXISTS public.handle_ride_pre_insert();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_calculate_ride_price'
      AND NOT t.tgisinternal
  ) THEN
    DROP FUNCTION IF EXISTS public.fn_calculate_ride_price();
  END IF;
END;
$$;
