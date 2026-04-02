-- Backend performance hardening for dispatch, estimates, and profile stats.

CREATE INDEX IF NOT EXISTS idx_driver_locations_geog
ON public.driver_locations
USING gist (
  (extensions.ST_SetSRID(extensions.ST_MakePoint(driver_lon, driver_lat), 4326)::extensions.geography)
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_last_updated
ON public.driver_locations (last_updated DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_dispatch_ready
ON public.profiles (id, driver_type, rating)
WHERE role = 'driver'
  AND is_online = true
  AND is_busy = false
  AND is_verified = true
  AND has_paid = true;

CREATE INDEX IF NOT EXISTS idx_vehicles_dispatch_active
ON public.vehicles (category, driver_id)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ride_offers_open_by_driver
ON public.ride_offers (driver_id, offered_at DESC)
WHERE status = 'offered';

CREATE INDEX IF NOT EXISTS idx_ride_offers_open_by_ride
ON public.ride_offers (ride_id, driver_id, expires_at)
WHERE status = 'offered';

CREATE INDEX IF NOT EXISTS idx_ride_offers_expiry_queue
ON public.ride_offers (expires_at)
WHERE status = 'offered';

CREATE INDEX IF NOT EXISTS idx_rides_pending_created_at
ON public.rides (created_at)
WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.get_candidate_drivers(in_ride_id uuid)
RETURNS TABLE(driver_id uuid, distance_meters double precision)
LANGUAGE plpgsql STABLE
SET search_path = public, extensions
AS $$
DECLARE
  v_ride RECORD;
  v_max_dist_m double precision := 15000;
  v_min_rating double precision := 0;
  v_offer_cap int := 5;
  v_offer_cooldown int := 0;
  v_k_candidates int := 5;
  v_offer_ttl int := 45;
  v_location_stale_seconds int := 300;
  v_pickup_geog extensions.geography;
  v_service_type text;
BEGIN
  SELECT * INTO v_ride
  FROM public.rides
  WHERE id = in_ride_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_service_type := CASE WHEN v_ride.is_delivery THEN 'delivery' ELSE 'rides' END;

  SELECT
    COALESCE((value ->> 'max_pickup_distance_m')::double precision, v_max_dist_m),
    COALESCE((value ->> 'min_driver_rating')::double precision, v_min_rating),
    COALESCE((value ->> 'concurrent_offer_cap')::int, v_offer_cap),
    COALESCE((value ->> 'offer_cooldown_seconds')::int, v_offer_cooldown),
    COALESCE(
      (value -> 'k_candidates' ->> v_service_type)::int,
      (value -> 'defaults' ->> 'k_candidates')::int,
      v_k_candidates
    ),
    COALESCE(
      (value ->> 'offer_timeout_seconds')::int,
      (value -> 'defaults' ->> 'offer_ttl_seconds')::int,
      v_offer_ttl
    ),
    COALESCE((value ->> 'driver_location_stale_seconds')::int, v_location_stale_seconds)
  INTO
    v_max_dist_m,
    v_min_rating,
    v_offer_cap,
    v_offer_cooldown,
    v_k_candidates,
    v_offer_ttl,
    v_location_stale_seconds
  FROM public.app_dispatch_configs
  WHERE key = 'defaults'
  LIMIT 1;

  IF NOT FOUND THEN
    v_max_dist_m := 15000;
    v_min_rating := 0;
    v_offer_cap := 5;
    v_offer_cooldown := 0;
    v_k_candidates := 5;
    v_offer_ttl := 45;
    v_location_stale_seconds := 300;
  END IF;

  v_pickup_geog :=
    extensions.ST_SetSRID(
      extensions.ST_MakePoint(v_ride.pickup_lon, v_ride.pickup_lat),
      4326
    )::extensions.geography;

  RETURN QUERY
  SELECT
    p.id AS driver_id,
    extensions.ST_Distance(
      extensions.ST_SetSRID(
        extensions.ST_MakePoint(dl.driver_lon, dl.driver_lat),
        4326
      )::extensions.geography,
      v_pickup_geog
    ) AS distance_meters
  FROM public.driver_locations dl
  JOIN public.profiles p
    ON p.id = dl.driver_id
  JOIN public.vehicles v
    ON v.driver_id = p.id
  WHERE p.role = 'driver'
    AND p.is_online = true
    AND p.is_busy = false
    AND p.is_verified = true
    AND p.has_paid = true
    AND v.is_active = true
    AND (v_min_rating IS NULL OR p.rating >= v_min_rating)
    AND (
      p.driver_type IS NULL OR
      (v_ride.is_delivery = true AND p.driver_type IN ('delivery', 'both')) OR
      (v_ride.is_delivery = false AND p.driver_type IN ('rides', 'both'))
    )
    AND LOWER(v.category::text) = LOWER(v_ride.requested_vehicle_type::text)
    AND dl.driver_lat IS NOT NULL
    AND dl.driver_lon IS NOT NULL
    AND dl.last_updated >= now() - make_interval(secs => v_location_stale_seconds)
    AND extensions.ST_DWithin(
      extensions.ST_SetSRID(
        extensions.ST_MakePoint(dl.driver_lon, dl.driver_lat),
        4326
      )::extensions.geography,
      v_pickup_geog,
      v_max_dist_m
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.ride_offers ro
      WHERE ro.ride_id = in_ride_id
        AND ro.driver_id = p.id
        AND ro.status = 'offered'
        AND COALESCE(
          ro.expires_at,
          ro.offered_at + make_interval(secs => v_offer_ttl)
        ) > now()
    )
    AND (
      v_offer_cap IS NULL OR
      v_offer_cap <= 0 OR
      (
        SELECT COUNT(*)
        FROM public.ride_offers ro
        WHERE ro.driver_id = p.id
          AND ro.status = 'offered'
          AND COALESCE(
            ro.expires_at,
            ro.offered_at + make_interval(secs => v_offer_ttl)
          ) > now()
      ) < v_offer_cap
    )
    AND (
      v_offer_cooldown IS NULL OR
      v_offer_cooldown <= 0 OR
      NOT EXISTS (
        SELECT 1
        FROM public.ride_offers ro
        WHERE ro.driver_id = p.id
          AND ro.offered_at >= now() - make_interval(secs => v_offer_cooldown)
      )
    )
  ORDER BY
    extensions.ST_SetSRID(
      extensions.ST_MakePoint(dl.driver_lon, dl.driver_lat),
      4326
    )::extensions.geography <-> v_pickup_geog
  LIMIT v_k_candidates;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_offers_for_ride(in_ride_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime, extensions
AS $$
DECLARE
  offer_ttl int := 45;
  current_round int := 1;
  ride_record RECORD;
  candidate RECORD;
BEGIN
  SELECT
    COALESCE(
      (value ->> 'offer_timeout_seconds')::int,
      (value -> 'defaults' ->> 'offer_ttl_seconds')::int,
      offer_ttl
    )
  INTO offer_ttl
  FROM public.app_dispatch_configs
  WHERE key = 'defaults'
  LIMIT 1;

  IF NOT FOUND THEN
    offer_ttl := 45;
  END IF;

  SELECT id, status, price
  INTO ride_record
  FROM public.rides
  WHERE id = in_ride_id
  FOR UPDATE;

  IF NOT FOUND OR ride_record.status <> 'pending' THEN
    RETURN;
  END IF;

  SELECT COALESCE(MAX(round), 0) + 1
  INTO current_round
  FROM public.ride_offers
  WHERE ride_id = in_ride_id;

  FOR candidate IN
    SELECT *
    FROM public.get_candidate_drivers(in_ride_id)
  LOOP
    INSERT INTO public.ride_offers (
      ride_id,
      driver_id,
      offered_at,
      status,
      round,
      expires_at,
      updated_at
    )
    VALUES (
      in_ride_id,
      candidate.driver_id,
      now(),
      'offered',
      current_round,
      now() + make_interval(secs => offer_ttl),
      now()
    )
    ON CONFLICT (ride_id, driver_id) DO UPDATE
    SET offered_at = EXCLUDED.offered_at,
        status = EXCLUDED.status,
        round = EXCLUDED.round,
        expires_at = EXCLUDED.expires_at,
        updated_at = EXCLUDED.updated_at;

    INSERT INTO realtime.messages (topic, event, payload, extension)
    VALUES (
      'driver:' || candidate.driver_id::text || ':offers',
      'offer_created',
      jsonb_build_object(
        'ride_id', in_ride_id,
        'price', ride_record.price,
        'round', current_round,
        'dist_km', ROUND((candidate.distance_meters / 1000.0)::numeric, 2)
      ),
      'broadcast'
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_offer_round(in_ride_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  max_rounds int := 3;
  offer_ttl int := 45;
  next_round int := 1;
BEGIN
  SELECT
    COALESCE(
      (value ->> 'max_rounds')::int,
      (value -> 'defaults' ->> 'max_rounds')::int,
      max_rounds
    ),
    COALESCE(
      (value ->> 'offer_timeout_seconds')::int,
      (value -> 'defaults' ->> 'offer_ttl_seconds')::int,
      offer_ttl
    )
  INTO max_rounds, offer_ttl
  FROM public.app_dispatch_configs
  WHERE key = 'defaults'
  LIMIT 1;

  IF NOT FOUND THEN
    max_rounds := 3;
    offer_ttl := 45;
  END IF;

  PERFORM 1
  FROM public.rides
  WHERE id = in_ride_id
  FOR UPDATE;

  IF (SELECT status FROM public.rides WHERE id = in_ride_id) <> 'pending' THEN
    RETURN;
  END IF;

  SELECT COALESCE(MAX(round), 0) + 1
  INTO next_round
  FROM public.ride_offers
  WHERE ride_id = in_ride_id;

  IF next_round > max_rounds THEN
    UPDATE public.rides
    SET status = 'timed_out',
        updated_at = now()
    WHERE id = in_ride_id
      AND status = 'pending';
    RETURN;
  END IF;

  UPDATE public.ride_offers
  SET status = 'expired',
      updated_at = now()
  WHERE ride_id = in_ride_id
    AND status = 'offered'
    AND COALESCE(
      expires_at,
      offered_at + make_interval(secs => offer_ttl)
    ) <= now();

  PERFORM public.issue_offers_for_ride(in_ride_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_ride_queue_management()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  offer_ttl int := 45;
  pending_timeout_minutes int := 15;
  pending_ride RECORD;
BEGIN
  SELECT
    COALESCE(
      (value ->> 'offer_timeout_seconds')::int,
      (value -> 'defaults' ->> 'offer_ttl_seconds')::int,
      offer_ttl
    ),
    COALESCE((value ->> 'pending_timeout_minutes')::int, pending_timeout_minutes)
  INTO offer_ttl, pending_timeout_minutes
  FROM public.app_dispatch_configs
  WHERE key = 'defaults'
  LIMIT 1;

  IF NOT FOUND THEN
    offer_ttl := 45;
    pending_timeout_minutes := 15;
  END IF;

  UPDATE public.ride_offers
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'offered'
    AND COALESCE(
      expires_at,
      offered_at + make_interval(secs => offer_ttl)
    ) <= now();

  UPDATE public.rides
  SET status = 'timed_out',
      updated_at = now()
  WHERE status = 'pending'
    AND created_at < now() - make_interval(mins => pending_timeout_minutes);

  FOR pending_ride IN
    SELECT r.id
    FROM public.rides r
    WHERE r.status = 'pending'
      AND r.created_at >= now() - make_interval(mins => pending_timeout_minutes)
      AND NOT EXISTS (
        SELECT 1
        FROM public.ride_offers ro
        WHERE ro.ride_id = r.id
          AND ro.status = 'offered'
          AND COALESCE(
            ro.expires_at,
            ro.offered_at + make_interval(secs => offer_ttl)
          ) > now()
      )
  LOOP
    PERFORM public.advance_offer_round(pending_ride.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_ride_dispatcher()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime, extensions
AS $$
BEGIN
  IF NEW.status::text <> 'pending' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  PERFORM public.issue_offers_for_ride(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_ride_lifecycle_orchestrator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime, extensions
AS $$
DECLARE
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
  v_hour int := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Africa/Lagos'));
  v_traffic_multiplier numeric := 1.3;
  v_circuity_factor numeric := 1.25;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_delivery = true THEN
      NEW.pickup_code := floor(random() * 9000 + 1000)::text;
      NEW.dropoff_code := floor(random() * 9000 + 1000)::text;
    END IF;

    SELECT base_fare, per_km_rate, min_fare
    INTO svc_base_fare, svc_per_km_rate, svc_min_fare
    FROM public.services
    WHERE LOWER(category::text) = LOWER(NEW.requested_vehicle_type::text)
      AND is_active = true
    LIMIT 1;

    IF svc_base_fare IS NULL OR svc_base_fare = 0 THEN
      svc_base_fare := 500.00;
      svc_per_km_rate := 250.00;
      svc_min_fare := 1000.00;
    END IF;

    IF NEW.pickup_lat IS NOT NULL AND NEW.destination_lat IS NOT NULL THEN
      dlat := radians(NEW.destination_lat - NEW.pickup_lat);
      dlon := radians(NEW.destination_lon - NEW.pickup_lon);
      a := sin(dlat / 2)^2
        + cos(radians(NEW.pickup_lat)) * cos(radians(NEW.destination_lat)) * sin(dlon / 2)^2;
      c := 2 * atan2(sqrt(a), sqrt(1 - a));
      v_calc_dist_km := earth_radius_km * c;
      NEW.distance_km := v_calc_dist_km::numeric(10, 2);
    END IF;

    IF (v_hour BETWEEN 7 AND 9) OR (v_hour BETWEEN 16 AND 19) THEN
      v_traffic_multiplier := 2.2;
    ELSIF (v_hour >= 21 OR v_hour < 6) THEN
      v_traffic_multiplier := 0.9;
    END IF;

    NEW.estimated_dropoff_mins :=
      CEIL((v_calc_dist_km * v_circuity_factor) * (2.2 * v_traffic_multiplier));
    NEW.estimated_pickup_mins :=
      CASE WHEN v_traffic_multiplier > 2 THEN 10 ELSE 6 END;

    computed_price := (svc_base_fare + (svc_per_km_rate * v_calc_dist_km))::numeric;
    computed_price := GREATEST(computed_price, COALESCE(svc_min_fare, 0)::numeric);
    NEW.price := (ROUND(computed_price / 100.0) * 100)::numeric;
    NEW.status := COALESCE(NEW.status, 'pending');
  END IF;

  IF TG_OP = 'UPDATE' AND (OLD.status::text IS DISTINCT FROM NEW.status::text) THEN
    IF NEW.status::text = 'accepted' THEN
      NEW.accepted_at = COALESCE(NEW.accepted_at, now());

      IF NEW.driver_id IS NOT NULL THEN
        UPDATE public.profiles
        SET is_busy = true
        WHERE id = NEW.driver_id;

        INSERT INTO realtime.messages (topic, event, payload, extension)
        VALUES (
          'ride:' || NEW.id::text || ':status',
          'UPDATE',
          jsonb_build_object(
            'new',
            jsonb_build_object(
              'id', NEW.id,
              'status', 'accepted',
              'driver_id', NEW.driver_id
            )
          ),
          'broadcast'
        );
      END IF;
    END IF;

    IF NEW.status::text IN ('completed', 'cancelled', 'timed_out') THEN
      IF NEW.driver_id IS NOT NULL THEN
        UPDATE public.profiles
        SET is_busy = false
        WHERE id = NEW.driver_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_ride_dispatcher_after ON public.rides;
CREATE TRIGGER tr_ride_dispatcher_after
AFTER INSERT OR UPDATE OF status ON public.rides
FOR EACH ROW
WHEN (NEW.status = 'pending'::public.ride_status)
EXECUTE FUNCTION public.handle_ride_dispatcher();

DROP TRIGGER IF EXISTS tr_ride_master_orchestrator ON public.rides;
CREATE TRIGGER tr_ride_master_orchestrator
BEFORE INSERT OR UPDATE OF status ON public.rides
FOR EACH ROW
EXECUTE FUNCTION public.handle_ride_lifecycle_orchestrator();

CREATE OR REPLACE FUNCTION public.get_nearest_drivers(
  p_pickup extensions.geography,
  p_vehicle_category text,
  p_radius_meters integer,
  p_limit integer
)
RETURNS TABLE(driver_id uuid, distance_meters double precision)
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  SELECT
    p.id AS driver_id,
    extensions.ST_Distance(
      extensions.ST_SetSRID(
        extensions.ST_MakePoint(dl.driver_lon, dl.driver_lat),
        4326
      )::extensions.geography,
      p_pickup
    ) AS distance_meters
  FROM public.driver_locations dl
  JOIN public.profiles p
    ON p.id = dl.driver_id
  JOIN public.vehicles v
    ON v.driver_id = p.id
  WHERE p.role = 'driver'
    AND p.is_online = true
    AND p.is_busy = false
    AND p.is_verified = true
    AND p.has_paid = true
    AND v.is_active = true
    AND LOWER(v.category::text) = LOWER(p_vehicle_category)
    AND dl.last_updated >= now() - interval '5 minutes'
    AND dl.driver_lat IS NOT NULL
    AND dl.driver_lon IS NOT NULL
    AND extensions.ST_DWithin(
      extensions.ST_SetSRID(
        extensions.ST_MakePoint(dl.driver_lon, dl.driver_lat),
        4326
      )::extensions.geography,
      p_pickup,
      p_radius_meters
    )
  ORDER BY
    extensions.ST_SetSRID(
      extensions.ST_MakePoint(dl.driver_lon, dl.driver_lat),
      4326
    )::extensions.geography <-> p_pickup
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_nearby_drivers(
  user_lat double precision,
  user_lng double precision,
  radius_meters double precision,
  vehicle_type text DEFAULT NULL::text
)
RETURNS TABLE(
  driver_id uuid,
  full_name text,
  lat double precision,
  lng double precision,
  category text,
  distance double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS driver_id,
    p.full_name,
    dl.driver_lat AS lat,
    dl.driver_lon AS lng,
    v.category::text,
    extensions.ST_Distance(
      extensions.ST_SetSRID(
        extensions.ST_MakePoint(dl.driver_lon, dl.driver_lat),
        4326
      )::extensions.geography,
      extensions.ST_SetSRID(
        extensions.ST_MakePoint(user_lng, user_lat),
        4326
      )::extensions.geography
    ) AS distance
  FROM public.driver_locations dl
  JOIN public.profiles p
    ON dl.driver_id = p.id
  JOIN public.vehicles v
    ON p.id = v.driver_id
  WHERE p.role = 'driver'
    AND p.is_online = true
    AND p.is_busy = false
    AND p.is_verified = true
    AND p.has_paid = true
    AND v.is_active = true
    AND dl.last_updated >= now() - interval '5 minutes'
    AND (
      vehicle_type IS NULL OR
      LOWER(v.category::text) = LOWER(vehicle_type)
    )
    AND extensions.ST_DWithin(
      extensions.ST_SetSRID(
        extensions.ST_MakePoint(dl.driver_lon, dl.driver_lat),
        4326
      )::extensions.geography,
      extensions.ST_SetSRID(
        extensions.ST_MakePoint(user_lng, user_lat),
        4326
      )::extensions.geography,
      radius_meters
    )
  ORDER BY
    extensions.ST_SetSRID(
      extensions.ST_MakePoint(dl.driver_lon, dl.driver_lat),
      4326
    )::extensions.geography <-> extensions.ST_SetSRID(
      extensions.ST_MakePoint(user_lng, user_lat),
      4326
    )::extensions.geography;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ride_estimates(
  pickup_lat double precision,
  pickup_lng double precision,
  dest_lat double precision,
  dest_lng double precision
)
RETURNS TABLE(
  id uuid,
  name text,
  label text,
  description text,
  capacity integer,
  service_type text,
  estimated_fare numeric,
  distance_km double precision,
  eta_minutes integer
)
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_pickup_geog extensions.geography;
  v_dest_geog extensions.geography;
  v_distance_km double precision;
  v_max_dist_m double precision := 15000;
  v_location_stale_seconds int := 300;
BEGIN
  SELECT
    COALESCE((value ->> 'max_pickup_distance_m')::double precision, v_max_dist_m),
    COALESCE((value ->> 'driver_location_stale_seconds')::int, v_location_stale_seconds)
  INTO v_max_dist_m, v_location_stale_seconds
  FROM public.app_dispatch_configs
  WHERE key = 'defaults'
  LIMIT 1;

  IF NOT FOUND THEN
    v_max_dist_m := 15000;
    v_location_stale_seconds := 300;
  END IF;

  v_pickup_geog := extensions.ST_SetSRID(
    extensions.ST_MakePoint(pickup_lng, pickup_lat),
    4326
  )::extensions.geography;

  v_dest_geog := extensions.ST_SetSRID(
    extensions.ST_MakePoint(dest_lng, dest_lat),
    4326
  )::extensions.geography;

  v_distance_km := extensions.ST_Distance(v_pickup_geog, v_dest_geog) / 1000.0;

  RETURN QUERY
  SELECT
    st.id,
    st.name::text,
    st.label,
    st.description,
    st.capacity,
    CASE
      WHEN st.name::text IN ('bike', 'mini_van', 'van_truck') THEN 'delivery'
      ELSE 'rides'
    END::text AS service_type,
    (
      ROUND(
        GREATEST(s.base_fare + (v_distance_km * s.per_km_rate), s.min_fare) / 100.0
      ) * 100
    )::numeric AS estimated_fare,
    v_distance_km::double precision AS distance_km,
    COALESCE((
      SELECT
        CEIL((
          extensions.ST_Distance(
            extensions.ST_SetSRID(
              extensions.ST_MakePoint(dl.driver_lon, dl.driver_lat),
              4326
            )::extensions.geography,
            v_pickup_geog
          ) / 333.0
        ) + 2)::integer
      FROM public.driver_locations dl
      JOIN public.profiles p
        ON dl.driver_id = p.id
      JOIN public.vehicles v
        ON p.id = v.driver_id
      WHERE p.role = 'driver'
        AND p.is_online = true
        AND p.is_busy = false
        AND p.is_verified = true
        AND p.has_paid = true
        AND v.is_active = true
        AND LOWER(v.category::text) = LOWER(st.name::text)
        AND dl.last_updated >= now() - make_interval(secs => v_location_stale_seconds)
        AND extensions.ST_DWithin(
          extensions.ST_SetSRID(
            extensions.ST_MakePoint(dl.driver_lon, dl.driver_lat),
            4326
          )::extensions.geography,
          v_pickup_geog,
          v_max_dist_m
        )
      ORDER BY
        extensions.ST_SetSRID(
          extensions.ST_MakePoint(dl.driver_lon, dl.driver_lat),
          4326
        )::extensions.geography <-> v_pickup_geog
      LIMIT 1
    ), 8) AS eta_minutes
  FROM public.service_types st
  JOIN public.services s
    ON st.name::text = s.category::text
  WHERE st.is_active = true
  ORDER BY st.sort_order ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_stats_on_ride_done()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_distance numeric(10, 2) := COALESCE(NEW.distance_km, 0)::numeric(10, 2);
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  IF NEW.driver_id IS NOT NULL THEN
    UPDATE public.profiles
    SET total_trips = COALESCE(total_trips, 0) + 1,
        total_kilometers = COALESCE(total_kilometers, 0) + v_distance
    WHERE id = NEW.driver_id;
  END IF;

  IF NEW.customer_id IS NOT NULL THEN
    UPDATE public.profiles
    SET total_trips = COALESCE(total_trips, 0) + 1,
        total_kilometers = COALESCE(total_kilometers, 0) + v_distance
    WHERE id = NEW.customer_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_driver_location_by_driver_rpc(
  p_driver_id uuid,
  p_lon double precision,
  p_lat double precision,
  p_heading double precision,
  p_is_online boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid()::uuid;
  v_window_start bigint;
  v_count integer;
  v_now timestamptz := now();
  v_max_requests integer := 60;
  v_window_seconds integer := 60;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'unauthenticated');
  END IF;

  IF p_driver_id IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'forbidden: driver_id mismatch');
  END IF;

  IF p_lat IS NULL OR p_lon IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lon NOT BETWEEN -180 AND 180 THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'invalid coordinates');
  END IF;

  SELECT
    COALESCE((value ->> 'max_requests')::int, v_max_requests),
    COALESCE((value ->> 'window_seconds')::int, v_window_seconds)
  INTO v_max_requests, v_window_seconds
  FROM public.app_configs
  WHERE key = 'rate_limits'
  LIMIT 1;

  IF NOT FOUND THEN
    v_max_requests := 60;
    v_window_seconds := 60;
  END IF;

  v_window_start :=
    floor(extract(epoch FROM v_now) / v_window_seconds)::bigint * v_window_seconds;

  INSERT INTO public.rate_limits AS rl (driver_id, window_start, count, updated_at)
  VALUES (p_driver_id, v_window_start, 1, v_now)
  ON CONFLICT (driver_id, window_start) DO UPDATE
  SET count = rl.count + 1,
      updated_at = EXCLUDED.updated_at
  RETURNING count INTO v_count;

  IF v_count > v_max_requests THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'rate limit exceeded',
      'driver_id', p_driver_id,
      'count', v_count
    );
  END IF;

  INSERT INTO public.driver_locations (driver_id, driver_lon, driver_lat, heading, last_updated)
  VALUES (p_driver_id, p_lon, p_lat, COALESCE(p_heading, 0), v_now)
  ON CONFLICT (driver_id) DO UPDATE
  SET driver_lon = EXCLUDED.driver_lon,
      driver_lat = EXCLUDED.driver_lat,
      heading = EXCLUDED.heading,
      last_updated = EXCLUDED.last_updated;

  UPDATE public.profiles
  SET lifetime_online_minutes = CASE
        WHEN p_is_online = false AND last_online_at IS NOT NULL
          THEN lifetime_online_minutes + (EXTRACT(EPOCH FROM (v_now - last_online_at)) / 60)
        ELSE lifetime_online_minutes
      END,
      total_online_minutes = CASE
        WHEN last_active_date < (v_now AT TIME ZONE 'Africa/Lagos')::date THEN 0
        WHEN p_is_online = false AND last_online_at IS NOT NULL THEN
          CASE
            WHEN last_online_at::date < (v_now AT TIME ZONE 'Africa/Lagos')::date
              THEN EXTRACT(EPOCH FROM (v_now - (v_now AT TIME ZONE 'Africa/Lagos')::date)) / 60
            ELSE total_online_minutes + (EXTRACT(EPOCH FROM (v_now - last_online_at)) / 60)
          END
        ELSE total_online_minutes
      END,
      last_online_at = CASE WHEN p_is_online = true THEN v_now ELSE NULL END,
      last_active_date = (v_now AT TIME ZONE 'Africa/Lagos')::date,
      is_online = p_is_online,
      updated_at = v_now
  WHERE id = p_driver_id
    AND role = 'driver'
    AND is_online IS DISTINCT FROM p_is_online;

  RETURN jsonb_build_object(
    'status', 'ok',
    'driver_id', p_driver_id,
    'is_online', p_is_online,
    'last_updated', v_now
  );
END;
$$;
