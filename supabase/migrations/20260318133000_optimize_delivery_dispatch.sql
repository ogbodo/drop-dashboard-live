CREATE INDEX IF NOT EXISTS idx_vehicles_delivery_dispatch_active
ON public.vehicles (driver_id, category)
WHERE is_active = true
  AND category IN ('bike', 'mini_van', 'van_truck');

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
  v_requested_vehicle_type text;
BEGIN
  SELECT * INTO v_ride
  FROM public.rides
  WHERE id = in_ride_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_service_type := CASE WHEN v_ride.is_delivery THEN 'delivery' ELSE 'rides' END;
  v_requested_vehicle_type := LOWER(COALESCE(v_ride.requested_vehicle_type::text, ''));

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
  WITH eligible_candidates AS (
    SELECT
      p.id AS driver_id,
      extensions.ST_Distance(
        extensions.ST_SetSRID(
          extensions.ST_MakePoint(dl.driver_lon, dl.driver_lat),
          4326
        )::extensions.geography,
        v_pickup_geog
      ) AS distance_meters,
      CASE
        WHEN LOWER(v.category::text) = v_requested_vehicle_type THEN 0
        WHEN v_ride.is_delivery = true
          AND LOWER(v.category::text) IN ('bike', 'mini_van', 'van_truck')
        THEN 1
        ELSE 2
      END AS category_rank
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
      AND (
        (v_ride.is_delivery = false AND LOWER(v.category::text) = v_requested_vehicle_type)
        OR
        (
          v_ride.is_delivery = true
          AND (
            LOWER(v.category::text) = v_requested_vehicle_type
            OR LOWER(v.category::text) IN ('bike', 'mini_van', 'van_truck')
          )
        )
      )
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
  )
  SELECT
    eligible_candidates.driver_id,
    eligible_candidates.distance_meters
  FROM eligible_candidates
  ORDER BY eligible_candidates.category_rank, eligible_candidates.distance_meters
  LIMIT v_k_candidates;
END;
$$;
