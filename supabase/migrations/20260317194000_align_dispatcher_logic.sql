-- Align dispatch logic with app_dispatch_configs and add missing helper

CREATE OR REPLACE FUNCTION public.get_candidate_drivers(in_ride_id uuid)
RETURNS TABLE(driver_id uuid, distance_meters double precision)
LANGUAGE plpgsql STABLE
SET search_path = public, extensions
AS $$
DECLARE
  v_ride RECORD;
  v_cfg jsonb;
  v_max_dist_m double precision;
  v_min_rating double precision;
  v_offer_cap int;
  v_offer_cooldown int;
  v_k_candidates int;
  v_pickup_geog extensions.geography;
  v_service_type text;
BEGIN
  SELECT * INTO v_ride FROM public.rides WHERE id = in_ride_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_service_type := CASE WHEN v_ride.is_delivery THEN 'delivery' ELSE 'rides' END;

  SELECT
    value,
    COALESCE((value ->> 'max_pickup_distance_m')::double precision, 15000),
    COALESCE((value ->> 'min_driver_rating')::double precision, 0),
    COALESCE((value ->> 'concurrent_offer_cap')::int, 3),
    COALESCE((value ->> 'offer_cooldown_seconds')::int, 0),
    COALESCE(
      (value -> 'k_candidates' ->> v_service_type)::int,
      (value -> 'defaults' ->> 'k_candidates')::int,
      5
    )
  INTO v_cfg, v_max_dist_m, v_min_rating, v_offer_cap, v_offer_cooldown, v_k_candidates
  FROM public.app_dispatch_configs
  WHERE key = 'defaults'
  LIMIT 1;

  v_pickup_geog := ST_SetSRID(ST_MakePoint(v_ride.pickup_lon, v_ride.pickup_lat), 4326)::extensions.geography;

  RETURN QUERY
  SELECT
    p.id AS driver_id,
    ST_Distance(
      ST_SetSRID(ST_MakePoint(dl.driver_lon, dl.driver_lat), 4326)::extensions.geography,
      v_pickup_geog
    ) AS distance_meters
  FROM public.profiles p
  JOIN public.driver_locations dl ON p.id = dl.driver_id
  JOIN public.vehicles v ON v.driver_id = p.id
  WHERE p.role = 'driver'
    AND p.is_online = true
    AND p.is_busy = false
    AND p.is_verified = true
    AND p.has_paid = true
    AND (v_min_rating IS NULL OR p.rating >= v_min_rating)
    AND (
      p.driver_type IS NULL OR
      (v_ride.is_delivery = true AND p.driver_type IN ('delivery','both')) OR
      (v_ride.is_delivery = false AND p.driver_type IN ('rides','both'))
    )
    AND LOWER(v.category::TEXT) = LOWER(v_ride.requested_vehicle_type::TEXT)
    AND dl.driver_lat IS NOT NULL
    AND dl.driver_lon IS NOT NULL
    AND ST_DWithin(
      v_pickup_geog,
      ST_SetSRID(ST_MakePoint(dl.driver_lon, dl.driver_lat), 4326)::extensions.geography,
      v_max_dist_m
    )
    AND (
      v_offer_cap IS NULL OR v_offer_cap <= 0 OR
      (SELECT COUNT(*) FROM public.ride_offers ro
       WHERE ro.driver_id = p.id AND ro.status = 'offered') < v_offer_cap
    )
    AND (
      v_offer_cooldown IS NULL OR v_offer_cooldown <= 0 OR
      NOT EXISTS (
        SELECT 1
        FROM public.ride_offers ro
        WHERE ro.driver_id = p.id
          AND ro.offered_at >= now() - (v_offer_cooldown || ' seconds')::interval
      )
    )
  ORDER BY 2 ASC
  LIMIT v_k_candidates;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_ride_dispatcher()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime, extensions
AS $$
DECLARE
  drv record;
  v_cfg jsonb;
  v_max_dist_m double precision;
  v_min_rating double precision;
  v_offer_cap int;
  v_avg_speed_mps double precision;
  v_pickup_geog extensions.geography;
  v_offer_cooldown int;
  v_k_candidates int;
  v_offer_ttl int;
  v_service_type text;
BEGIN
  IF NEW.status::TEXT <> 'pending' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status::TEXT = 'pending' AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
      RETURN NEW;
    END IF;
  END IF;

  v_pickup_geog := ST_SetSRID(ST_MakePoint(NEW.pickup_lon, NEW.pickup_lat), 4326)::extensions.geography;
  v_service_type := CASE WHEN NEW.is_delivery THEN 'delivery' ELSE 'rides' END;

  SELECT value,
         COALESCE((value ->> 'max_pickup_distance_m')::double precision, 15000),
         COALESCE((value ->> 'min_driver_rating')::double precision, 0),
         COALESCE((value ->> 'concurrent_offer_cap')::int, 3),
         COALESCE((value ->> 'avg_speed_mps')::double precision, 10),
         COALESCE((value ->> 'offer_cooldown_seconds')::int, 0),
         COALESCE(
           (value -> 'k_candidates' ->> v_service_type)::int,
           (value -> 'defaults' ->> 'k_candidates')::int,
           5
         ),
         COALESCE((value ->> 'offer_timeout_seconds')::int,
                  (value -> 'defaults' ->> 'offer_ttl_seconds')::int,
                  30)
  INTO v_cfg, v_max_dist_m, v_min_rating, v_offer_cap, v_avg_speed_mps, v_offer_cooldown, v_k_candidates, v_offer_ttl
  FROM public.app_dispatch_configs WHERE key = 'defaults' LIMIT 1;

  FOR drv IN
    SELECT
      p.id AS driver_id,
      ST_Distance(
        ST_SetSRID(ST_MakePoint(dl.driver_lon, dl.driver_lat), 4326)::extensions.geography,
        v_pickup_geog
      ) as dist_m
    FROM public.profiles p
    JOIN public.driver_locations dl ON p.id = dl.driver_id
    JOIN public.vehicles v ON v.driver_id = p.id
    WHERE p.role = 'driver'
      AND p.is_online = true
      AND p.is_busy = false
      AND p.is_verified = true
      AND p.has_paid = true
      AND (v_min_rating IS NULL OR p.rating >= v_min_rating)
      AND (
        p.driver_type IS NULL OR
        (NEW.is_delivery = true AND p.driver_type IN ('delivery','both')) OR
        (NEW.is_delivery = false AND p.driver_type IN ('rides','both'))
      )
      AND LOWER(v.category::TEXT) = LOWER(NEW.requested_vehicle_type::TEXT)
      AND dl.driver_lat IS NOT NULL
      AND dl.driver_lon IS NOT NULL
      AND ST_DWithin(
        v_pickup_geog,
        ST_SetSRID(ST_MakePoint(dl.driver_lon, dl.driver_lat), 4326)::extensions.geography,
        v_max_dist_m
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.ride_offers ro
        WHERE ro.ride_id = NEW.id
          AND ro.driver_id = p.id
          AND ro.status = 'offered'
      )
      AND (
        v_offer_cap IS NULL OR v_offer_cap <= 0 OR
        (SELECT COUNT(*) FROM public.ride_offers ro
         WHERE ro.driver_id = p.id AND ro.status = 'offered') < v_offer_cap
      )
      AND (
        v_offer_cooldown IS NULL OR v_offer_cooldown <= 0 OR
        NOT EXISTS (
          SELECT 1
          FROM public.ride_offers ro
          WHERE ro.driver_id = p.id
            AND ro.offered_at >= now() - (v_offer_cooldown || ' seconds')::interval
        )
      )
    ORDER BY 2 ASC
    LIMIT v_k_candidates
  LOOP
    INSERT INTO public.ride_offers (ride_id, driver_id, offered_at, status, round, expires_at)
    VALUES (
      NEW.id,
      drv.driver_id,
      now(),
      'offered',
      1,
      now() + (v_offer_ttl * interval '1 second')
    );

    INSERT INTO realtime.messages (topic, event, payload, extension)
    VALUES ('driver:' || drv.driver_id::text || ':offers', 'offer_created',
            jsonb_build_object(
              'ride_id', NEW.id,
              'price', NEW.price,
              'dist_km', ROUND((drv.dist_m / 1000.0)::numeric, 2)
            ), 'broadcast');
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_ride_dispatcher_after ON public.rides;
CREATE TRIGGER tr_ride_dispatcher_after
AFTER INSERT OR UPDATE OF status, updated_at ON public.rides
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION public.handle_ride_dispatcher();

CREATE OR REPLACE FUNCTION public.issue_offers_for_ride(in_ride_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  offer_ttl int;
  candidates RECORD;
  current_round int := 1;
BEGIN
  SELECT
    COALESCE((value ->> 'offer_timeout_seconds')::int,
             (value -> 'defaults' ->> 'offer_ttl_seconds')::int,
             30)
  INTO offer_ttl
  FROM public.app_dispatch_configs
  WHERE key = 'defaults';

  -- Lock ride
  PERFORM 1 FROM public.rides WHERE id = in_ride_id FOR UPDATE;

  -- only issue if pending
  IF (SELECT status FROM public.rides WHERE id = in_ride_id) <> 'pending' THEN
    RETURN;
  END IF;

  -- get top candidates using existing function
  FOR candidates IN SELECT * FROM public.get_candidate_drivers(in_ride_id) LOOP
    INSERT INTO public.ride_offers(ride_id, driver_id, offered_at, status, round, expires_at)
    VALUES (
      in_ride_id,
      candidates.driver_id,
      now(),
      'offered',
      current_round,
      now() + (offer_ttl * interval '1 second')
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_ride_queue_management()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  offer_ttl int := 30;
BEGIN
  SELECT
    COALESCE((value ->> 'offer_timeout_seconds')::int,
             (value -> 'defaults' ->> 'offer_ttl_seconds')::int,
             30)
  INTO offer_ttl
  FROM public.app_dispatch_configs
  WHERE key = 'defaults';

  -- 1. TIMEOUT: Close old pending rides (>15 mins)
  UPDATE public.rides SET status = 'timed_out'
  WHERE status = 'pending' AND created_at < (now() - interval '15 minutes');

  -- 2. EXPIRE: Expire ignored offers
  UPDATE public.ride_offers SET status = 'expired'
  WHERE status = 'offered' AND offered_at < (now() - (offer_ttl || ' seconds')::interval);

  -- 3. RE-DISPATCH: Poke active pending rides to expand radius
  UPDATE public.rides SET updated_at = now()
  WHERE status = 'pending' AND created_at >= (now() - interval '15 minutes');
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_ride_lifecycle_orchestrator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime, extensions
AS $$
DECLARE
  -- Pricing & Distance Variables
  svc_base_fare numeric := 0;
  svc_per_km_rate numeric := 0;
  svc_min_fare numeric := 0;
  earth_radius_km CONSTANT double precision := 6371;
  dlat double precision;
  dlon double precision;
  a double precision;
  c double precision;
  v_calc_dist_km double precision := 0;
  computed_price numeric := 0;

  -- PH Traffic Variables
  v_hour int := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Africa/Lagos'));
  v_traffic_multiplier numeric := 1.3;
  v_circuity_factor numeric := 1.25;

  -- Control Variables
  v_broadcast_done boolean := false;
BEGIN
  ----------------------------------------------------------------------
  -- 1. PRE-INSERT LOGIC (Pricing & Distance)
  ----------------------------------------------------------------------
  IF TG_OP = 'INSERT' THEN
    -- Delivery Codes
    IF NEW.is_delivery = true THEN
        NEW.pickup_code := floor(random() * 9000 + 1000)::text;
        NEW.dropoff_code := floor(random() * 9000 + 1000)::text;
    END IF;

    -- Fetch Service Pricing
    SELECT base_fare, per_km_rate, min_fare INTO svc_base_fare, svc_per_km_rate, svc_min_fare
    FROM public.services
    WHERE LOWER(category::TEXT) = LOWER(NEW.requested_vehicle_type::TEXT)
    AND is_active = true LIMIT 1;

    -- Fallback Pricing
    IF svc_base_fare IS NULL OR svc_base_fare = 0 THEN
      svc_base_fare := 500.00; svc_per_km_rate := 250.00; svc_min_fare := 1000.00;
    END IF;

    -- Distance Calculation
    IF NEW.pickup_lat IS NOT NULL AND NEW.destination_lat IS NOT NULL THEN
      dlat := radians(NEW.destination_lat - NEW.pickup_lat);
      dlon := radians(NEW.destination_lon - NEW.pickup_lon);
      a := sin(dlat/2)^2 + cos(radians(NEW.pickup_lat)) * cos(radians(NEW.destination_lat)) * sin(dlon/2)^2;
      c := 2 * atan2(sqrt(a), sqrt(1-a));
      v_calc_dist_km := earth_radius_km * c;
      NEW.distance_km := v_calc_dist_km::numeric(10,2);
    END IF;

    -- Traffic Multiplier
    IF (v_hour BETWEEN 7 AND 9) OR (v_hour BETWEEN 16 AND 19) THEN
        v_traffic_multiplier := 2.2;
    ELSIF (v_hour >= 21 OR v_hour < 6) THEN
        v_traffic_multiplier := 0.9;
    END IF;

    NEW.estimated_dropoff_mins := CEIL((v_calc_dist_km * v_circuity_factor) * (2.2 * v_traffic_multiplier));
    NEW.estimated_pickup_mins := CASE WHEN v_traffic_multiplier > 2 THEN 10 ELSE 6 END;

    -- Price Calculation
    computed_price := (svc_base_fare + (svc_per_km_rate * v_calc_dist_km))::numeric;
    computed_price := GREATEST(computed_price, COALESCE(svc_min_fare, 0)::numeric);
    NEW.price := (ROUND(computed_price / 100.0) * 100)::numeric;
    NEW.status := COALESCE(NEW.status, 'pending');
  END IF;

  ----------------------------------------------------------------------
  -- 2. UPDATE LOGIC (Status Transitions)
  ----------------------------------------------------------------------
  IF TG_OP = 'UPDATE' AND (OLD.status::TEXT IS DISTINCT FROM NEW.status::TEXT) THEN

    -- A. Acceptance
    IF (NEW.status::TEXT = 'accepted') THEN
      NEW.accepted_at = COALESCE(NEW.accepted_at, now());
      IF NEW.driver_id IS NOT NULL THEN
        UPDATE public.profiles SET is_busy = true WHERE id = NEW.driver_id;
        -- Broadcast details to Customer
        INSERT INTO realtime.messages (topic, event, payload, extension)
        VALUES ('ride:' || NEW.id::text || ':status', 'UPDATE', jsonb_build_object('new', jsonb_build_object('id', NEW.id, 'status', 'accepted', 'driver_id', NEW.driver_id)), 'broadcast');
      END IF;
    END IF;

    -- B. Handle Completion/Cancellation
    IF (NEW.status::TEXT IN ('completed', 'cancelled', 'timed_out')) THEN
      IF NEW.driver_id IS NOT NULL THEN
        UPDATE public.profiles SET is_busy = false WHERE id = NEW.driver_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
