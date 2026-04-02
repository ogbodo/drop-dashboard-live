DO $$
BEGIN
  CREATE TYPE public.scheduled_ride_status AS ENUM (
    'scheduled',
    'dispatching',
    'completed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.scheduled_rides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  spawned_ride_id uuid REFERENCES public.rides(id) ON DELETE SET NULL,
  status public.scheduled_ride_status NOT NULL DEFAULT 'scheduled',
  pickup_address text NOT NULL,
  destination_address text NOT NULL,
  pickup_lat double precision NOT NULL,
  pickup_lon double precision NOT NULL,
  destination_lat double precision NOT NULL,
  destination_lon double precision NOT NULL,
  requested_vehicle_type public.vehicle_category NOT NULL DEFAULT 'car',
  service_type_id uuid REFERENCES public.service_types(id),
  scheduled_for timestamptz NOT NULL,
  dispatch_lead_minutes integer NOT NULL DEFAULT 15,
  quoted_price numeric(10, 2),
  quoted_distance_km numeric(10, 2),
  dispatch_attempts integer NOT NULL DEFAULT 0,
  last_dispatch_error text,
  dispatched_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

ALTER TABLE public.scheduled_rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_rides REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_rides_customer_status_time
  ON public.scheduled_rides (customer_id, status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_scheduled_rides_due_dispatch
  ON public.scheduled_rides (status, scheduled_for)
  WHERE status = 'scheduled';

CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_rides_spawned_ride
  ON public.scheduled_rides (spawned_ride_id)
  WHERE spawned_ride_id IS NOT NULL;

DROP POLICY IF EXISTS scheduled_rides_select_own ON public.scheduled_rides;
CREATE POLICY scheduled_rides_select_own
  ON public.scheduled_rides
  FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid());

GRANT SELECT ON public.scheduled_rides TO authenticated;

CREATE OR REPLACE FUNCTION public.set_scheduled_rides_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now() AT TIME ZONE 'utc';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_scheduled_rides_updated_at ON public.scheduled_rides;
CREATE TRIGGER trg_set_scheduled_rides_updated_at
BEFORE UPDATE ON public.scheduled_rides
FOR EACH ROW
EXECUTE FUNCTION public.set_scheduled_rides_updated_at();

CREATE OR REPLACE FUNCTION public.create_scheduled_ride(
  in_customer_id uuid,
  in_pickup_lon double precision,
  in_pickup_lat double precision,
  in_destination_lon double precision,
  in_destination_lat double precision,
  in_pickup_address text,
  in_destination_address text,
  in_requested_vehicle public.vehicle_category,
  in_service_type_id uuid,
  in_scheduled_for timestamptz,
  in_dispatch_lead_minutes integer DEFAULT 15,
  in_quoted_price numeric DEFAULT NULL,
  in_quoted_distance_km numeric DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  customer_id uuid,
  status text,
  pickup_address text,
  destination_address text,
  pickup_lat double precision,
  pickup_lon double precision,
  destination_lat double precision,
  destination_lon double precision,
  requested_vehicle_type text,
  service_type_id uuid,
  scheduled_for timestamptz,
  dispatch_lead_minutes integer,
  quoted_price numeric,
  quoted_distance_km numeric,
  spawned_ride_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_scheduled_for timestamptz := now() + interval '30 minutes';
  v_max_scheduled_for timestamptz := now() + interval '7 days';
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> in_customer_id THEN
    RAISE EXCEPTION 'You can only schedule rides for your own account.';
  END IF;

  IF in_scheduled_for IS NULL THEN
    RAISE EXCEPTION 'Please choose when you want this ride.';
  END IF;

  IF in_scheduled_for < v_min_scheduled_for THEN
    RAISE EXCEPTION 'Scheduled rides must be at least 30 minutes ahead.';
  END IF;

  IF in_scheduled_for > v_max_scheduled_for THEN
    RAISE EXCEPTION 'Scheduled rides can only be booked up to 7 days ahead.';
  END IF;

  RETURN QUERY
  INSERT INTO public.scheduled_rides (
    customer_id,
    pickup_address,
    destination_address,
    pickup_lat,
    pickup_lon,
    destination_lat,
    destination_lon,
    requested_vehicle_type,
    service_type_id,
    scheduled_for,
    dispatch_lead_minutes,
    quoted_price,
    quoted_distance_km
  )
  VALUES (
    in_customer_id,
    in_pickup_address,
    in_destination_address,
    in_pickup_lat,
    in_pickup_lon,
    in_destination_lat,
    in_destination_lon,
    COALESCE(in_requested_vehicle, 'car'::public.vehicle_category),
    in_service_type_id,
    in_scheduled_for,
    GREATEST(COALESCE(in_dispatch_lead_minutes, 15), 5),
    in_quoted_price,
    in_quoted_distance_km
  )
  RETURNING
    scheduled_rides.id,
    scheduled_rides.customer_id,
    scheduled_rides.status::text,
    scheduled_rides.pickup_address,
    scheduled_rides.destination_address,
    scheduled_rides.pickup_lat,
    scheduled_rides.pickup_lon,
    scheduled_rides.destination_lat,
    scheduled_rides.destination_lon,
    scheduled_rides.requested_vehicle_type::text,
    scheduled_rides.service_type_id,
    scheduled_rides.scheduled_for,
    scheduled_rides.dispatch_lead_minutes,
    scheduled_rides.quoted_price,
    scheduled_rides.quoted_distance_km,
    scheduled_rides.spawned_ride_id,
    scheduled_rides.created_at,
    scheduled_rides.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_next_scheduled_ride(p_customer_id uuid)
RETURNS SETOF public.scheduled_rides
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sr.*
  FROM public.scheduled_rides sr
  WHERE sr.customer_id = p_customer_id
    AND auth.uid() = p_customer_id
    AND sr.status = 'scheduled'
    AND sr.scheduled_for > now()
  ORDER BY sr.scheduled_for ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.cancel_scheduled_ride(p_scheduled_ride_id uuid)
RETURNS TABLE(
  id uuid,
  status text,
  cancelled_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.scheduled_rides sr
  SET
    status = 'cancelled',
    cancelled_at = now(),
    updated_at = now() AT TIME ZONE 'utc'
  WHERE sr.id = p_scheduled_ride_id
    AND sr.customer_id = auth.uid()
    AND sr.status = 'scheduled'
  RETURNING
    sr.id,
    sr.status::text,
    sr.cancelled_at,
    sr.updated_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This scheduled ride can no longer be cancelled here.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_due_scheduled_rides()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scheduled_ride public.scheduled_rides%ROWTYPE;
  v_created_ride RECORD;
  v_dispatched_count integer := 0;
BEGIN
  FOR v_scheduled_ride IN
    SELECT sr.*
    FROM public.scheduled_rides sr
    WHERE sr.status = 'scheduled'
      AND sr.spawned_ride_id IS NULL
      AND sr.scheduled_for <= now() + make_interval(mins => sr.dispatch_lead_minutes)
    ORDER BY sr.scheduled_for ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      UPDATE public.scheduled_rides
      SET
        status = 'dispatching',
        dispatched_at = now(),
        dispatch_attempts = dispatch_attempts + 1,
        last_dispatch_error = NULL,
        updated_at = now() AT TIME ZONE 'utc'
      WHERE id = v_scheduled_ride.id
        AND status = 'scheduled';

      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      SELECT *
      INTO v_created_ride
      FROM public.create_ride(
        v_scheduled_ride.customer_id,
        v_scheduled_ride.pickup_lon,
        v_scheduled_ride.pickup_lat,
        v_scheduled_ride.destination_lon,
        v_scheduled_ride.destination_lat,
        v_scheduled_ride.pickup_address,
        v_scheduled_ride.destination_address,
        false,
        v_scheduled_ride.requested_vehicle_type,
        v_scheduled_ride.service_type_id,
        NULL
      )
      LIMIT 1;

      UPDATE public.scheduled_rides
      SET
        spawned_ride_id = v_created_ride.id,
        updated_at = now() AT TIME ZONE 'utc'
      WHERE id = v_scheduled_ride.id;

      v_dispatched_count := v_dispatched_count + 1;
    EXCEPTION
      WHEN OTHERS THEN
        UPDATE public.scheduled_rides
        SET
          status = 'scheduled',
          last_dispatch_error = SQLERRM,
          updated_at = now() AT TIME ZONE 'utc'
        WHERE id = v_scheduled_ride.id;
    END;
  END LOOP;

  RETURN v_dispatched_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_scheduled_ride_from_ride()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.scheduled_rides
  SET
    status = CASE
      WHEN NEW.status = 'completed' THEN 'completed'::public.scheduled_ride_status
      WHEN NEW.status = 'cancelled' THEN 'cancelled'::public.scheduled_ride_status
      ELSE 'dispatching'::public.scheduled_ride_status
    END,
    updated_at = now() AT TIME ZONE 'utc'
  WHERE spawned_ride_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_scheduled_ride_from_ride ON public.rides;
CREATE TRIGGER trg_sync_scheduled_ride_from_ride
AFTER INSERT OR UPDATE OF status ON public.rides
FOR EACH ROW
EXECUTE FUNCTION public.sync_scheduled_ride_from_ride();

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_rides;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'dispatch-scheduled-rides'
  ) THEN
    PERFORM cron.schedule(
      'dispatch-scheduled-rides',
      '* * * * *',
      'SELECT public.dispatch_due_scheduled_rides();'
    );
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.create_scheduled_ride(
  uuid,
  double precision,
  double precision,
  double precision,
  double precision,
  text,
  text,
  public.vehicle_category,
  uuid,
  timestamptz,
  integer,
  numeric,
  numeric
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_next_scheduled_ride(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_scheduled_ride(uuid) TO authenticated;
