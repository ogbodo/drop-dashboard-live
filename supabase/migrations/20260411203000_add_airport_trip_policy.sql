INSERT INTO public.app_configs (key, description, value)
VALUES (
  'airport_trip_settings',
  'Airport ride policy settings. Airport trips follow in-app pricing, with any airport fee controlled centrally instead of by drivers.',
  jsonb_build_object(
    'enabled',
    true,
    'enforce_in_app_price_only',
    true,
    'default_pickup_fee_amount',
    0,
    'default_dropoff_fee_amount',
    0,
    'policy_copy',
    'Airport trips must follow the price shown in the app. Drivers must not request extra cash because a trip starts or ends at the airport.',
    'zones',
    jsonb_build_array(
      jsonb_build_object(
        'code',
        'LOS_MMA',
        'name',
        'Murtala Muhammed International Airport',
        'city',
        'Lagos',
        'lat',
        6.5774,
        'lon',
        3.3212,
        'radius_meters',
        2500,
        'pickup_fee_amount',
        0,
        'dropoff_fee_amount',
        0,
        'active',
        true,
        'keywords',
        jsonb_build_array(
          'murtala muhammed international airport',
          'murtala mohammed international airport',
          'murtala muhammad international airport',
          'mma',
          'lagos airport'
        )
      ),
      jsonb_build_object(
        'code',
        'ABV_NAIA',
        'name',
        'Nnamdi Azikiwe International Airport',
        'city',
        'Abuja',
        'lat',
        9.0068,
        'lon',
        7.2632,
        'radius_meters',
        2500,
        'pickup_fee_amount',
        0,
        'dropoff_fee_amount',
        0,
        'active',
        true,
        'keywords',
        jsonb_build_array(
          'nnamdi azikiwe international airport',
          'abuja airport'
        )
      ),
      jsonb_build_object(
        'code',
        'PHC_IA',
        'name',
        'Port Harcourt International Airport',
        'city',
        'Port Harcourt',
        'lat',
        5.0155,
        'lon',
        6.9496,
        'radius_meters',
        2500,
        'pickup_fee_amount',
        0,
        'dropoff_fee_amount',
        0,
        'active',
        true,
        'keywords',
        jsonb_build_array(
          'port harcourt international airport',
          'port harcourt airport'
        )
      ),
      jsonb_build_object(
        'code',
        'KAN_MAKIA',
        'name',
        'Mallam Aminu Kano International Airport',
        'city',
        'Kano',
        'lat',
        12.0476,
        'lon',
        8.5246,
        'radius_meters',
        2500,
        'pickup_fee_amount',
        0,
        'dropoff_fee_amount',
        0,
        'active',
        true,
        'keywords',
        jsonb_build_array(
          'mallam aminu kano international airport',
          'kano airport'
        )
      ),
      jsonb_build_object(
        'code',
        'ENU_AIIA',
        'name',
        'Akanu Ibiam International Airport',
        'city',
        'Enugu',
        'lat',
        6.4743,
        'lon',
        7.56196,
        'radius_meters',
        2500,
        'pickup_fee_amount',
        0,
        'dropoff_fee_amount',
        0,
        'active',
        true,
        'keywords',
        jsonb_build_array(
          'akanu ibiam international airport',
          'enugu airport'
        )
      ),
      jsonb_build_object(
        'code',
        'QOW_SMIA',
        'name',
        'Sam Mbakwe International Cargo Airport',
        'city',
        'Owerri',
        'lat',
        5.4271,
        'lon',
        7.2060,
        'radius_meters',
        2500,
        'pickup_fee_amount',
        0,
        'dropoff_fee_amount',
        0,
        'active',
        true,
        'keywords',
        jsonb_build_array(
          'sam mbakwe international cargo airport',
          'owerri airport'
        )
      )
    )
  )
)
ON CONFLICT (key) DO UPDATE
SET
  description = EXCLUDED.description,
  value = jsonb_build_object(
    'enabled',
    COALESCE(
      (public.app_configs.value ->> 'enabled')::BOOLEAN,
      (EXCLUDED.value ->> 'enabled')::BOOLEAN,
      true
    ),
    'enforce_in_app_price_only',
    COALESCE(
      (public.app_configs.value ->> 'enforce_in_app_price_only')::BOOLEAN,
      (EXCLUDED.value ->> 'enforce_in_app_price_only')::BOOLEAN,
      true
    ),
    'default_pickup_fee_amount',
    COALESCE(
      (public.app_configs.value ->> 'default_pickup_fee_amount')::BIGINT,
      (EXCLUDED.value ->> 'default_pickup_fee_amount')::BIGINT,
      0
    ),
    'default_dropoff_fee_amount',
    COALESCE(
      (public.app_configs.value ->> 'default_dropoff_fee_amount')::BIGINT,
      (EXCLUDED.value ->> 'default_dropoff_fee_amount')::BIGINT,
      0
    ),
    'policy_copy',
    COALESCE(
      NULLIF(public.app_configs.value ->> 'policy_copy', ''),
      NULLIF(EXCLUDED.value ->> 'policy_copy', ''),
      'Airport trips must follow the price shown in the app. Drivers must not request extra cash because a trip starts or ends at the airport.'
    ),
    'zones',
    COALESCE(public.app_configs.value -> 'zones', EXCLUDED.value -> 'zones')
  ),
  updated_at = now();

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS is_airport_trip BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS airport_pickup_zone_code TEXT,
  ADD COLUMN IF NOT EXISTS airport_pickup_zone_name TEXT,
  ADD COLUMN IF NOT EXISTS airport_dropoff_zone_code TEXT,
  ADD COLUMN IF NOT EXISTS airport_dropoff_zone_name TEXT,
  ADD COLUMN IF NOT EXISTS airport_surcharge_amount BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS rides_airport_trip_idx
  ON public.rides (is_airport_trip, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_airport_trip_settings()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_value JSONB;
  v_default_zones JSONB := jsonb_build_array(
    jsonb_build_object(
      'code',
      'LOS_MMA',
      'name',
      'Murtala Muhammed International Airport',
      'city',
      'Lagos',
      'lat',
      6.5774,
      'lon',
      3.3212,
      'radius_meters',
      2500,
      'pickup_fee_amount',
      0,
      'dropoff_fee_amount',
      0,
      'active',
      true,
      'keywords',
      jsonb_build_array(
        'murtala muhammed international airport',
        'murtala mohammed international airport',
        'murtala muhammad international airport',
        'mma',
        'lagos airport'
      )
    ),
    jsonb_build_object(
      'code',
      'ABV_NAIA',
      'name',
      'Nnamdi Azikiwe International Airport',
      'city',
      'Abuja',
      'lat',
      9.0068,
      'lon',
      7.2632,
      'radius_meters',
      2500,
      'pickup_fee_amount',
      0,
      'dropoff_fee_amount',
      0,
      'active',
      true,
      'keywords',
      jsonb_build_array(
        'nnamdi azikiwe international airport',
        'abuja airport'
      )
    ),
    jsonb_build_object(
      'code',
      'PHC_IA',
      'name',
      'Port Harcourt International Airport',
      'city',
      'Port Harcourt',
      'lat',
      5.0155,
      'lon',
      6.9496,
      'radius_meters',
      2500,
      'pickup_fee_amount',
      0,
      'dropoff_fee_amount',
      0,
      'active',
      true,
      'keywords',
      jsonb_build_array(
        'port harcourt international airport',
        'port harcourt airport'
      )
    ),
    jsonb_build_object(
      'code',
      'KAN_MAKIA',
      'name',
      'Mallam Aminu Kano International Airport',
      'city',
      'Kano',
      'lat',
      12.0476,
      'lon',
      8.5246,
      'radius_meters',
      2500,
      'pickup_fee_amount',
      0,
      'dropoff_fee_amount',
      0,
      'active',
      true,
      'keywords',
      jsonb_build_array(
        'mallam aminu kano international airport',
        'kano airport'
      )
    ),
    jsonb_build_object(
      'code',
      'ENU_AIIA',
      'name',
      'Akanu Ibiam International Airport',
      'city',
      'Enugu',
      'lat',
      6.4743,
      'lon',
      7.56196,
      'radius_meters',
      2500,
      'pickup_fee_amount',
      0,
      'dropoff_fee_amount',
      0,
      'active',
      true,
      'keywords',
      jsonb_build_array(
        'akanu ibiam international airport',
        'enugu airport'
      )
    ),
    jsonb_build_object(
      'code',
      'QOW_SMIA',
      'name',
      'Sam Mbakwe International Cargo Airport',
      'city',
      'Owerri',
      'lat',
      5.4271,
      'lon',
      7.2060,
      'radius_meters',
      2500,
      'pickup_fee_amount',
      0,
      'dropoff_fee_amount',
      0,
      'active',
      true,
      'keywords',
      jsonb_build_array(
        'sam mbakwe international cargo airport',
        'owerri airport'
      )
    )
  );
BEGIN
  SELECT value
  INTO v_value
  FROM public.app_configs
  WHERE key = 'airport_trip_settings'
  LIMIT 1;

  RETURN jsonb_build_object(
    'enabled',
    COALESCE((v_value ->> 'enabled')::BOOLEAN, true),
    'enforce_in_app_price_only',
    COALESCE((v_value ->> 'enforce_in_app_price_only')::BOOLEAN, true),
    'default_pickup_fee_amount',
    COALESCE((v_value ->> 'default_pickup_fee_amount')::BIGINT, 0),
    'default_dropoff_fee_amount',
    COALESCE((v_value ->> 'default_dropoff_fee_amount')::BIGINT, 0),
    'policy_copy',
    COALESCE(
      NULLIF(v_value ->> 'policy_copy', ''),
      'Airport trips must follow the price shown in the app. Drivers must not request extra cash because a trip starts or ends at the airport.'
    ),
    'zones',
    COALESCE(v_value -> 'zones', v_default_zones)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.find_airport_zone(
  p_lon DOUBLE PRECISION,
  p_lat DOUBLE PRECISION,
  p_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions
AS $$
DECLARE
  v_settings JSONB;
  v_zone JSONB;
  v_zones JSONB;
  v_keyword TEXT;
  v_normalized_address TEXT := LOWER(BTRIM(COALESCE(p_address, '')));
  v_zone_lon DOUBLE PRECISION;
  v_zone_lat DOUBLE PRECISION;
  v_radius_meters DOUBLE PRECISION;
BEGIN
  v_settings := public.get_airport_trip_settings();

  IF COALESCE((v_settings ->> 'enabled')::BOOLEAN, true) IS FALSE THEN
    RETURN NULL;
  END IF;

  v_zones := COALESCE(v_settings -> 'zones', '[]'::JSONB);

  FOR v_zone IN
    SELECT value
    FROM jsonb_array_elements(v_zones)
  LOOP
    IF COALESCE((v_zone ->> 'active')::BOOLEAN, true) IS FALSE THEN
      CONTINUE;
    END IF;

    v_zone_lon := NULLIF(v_zone ->> 'lon', '')::DOUBLE PRECISION;
    v_zone_lat := NULLIF(v_zone ->> 'lat', '')::DOUBLE PRECISION;
    v_radius_meters := GREATEST(
      COALESCE(NULLIF(v_zone ->> 'radius_meters', '')::DOUBLE PRECISION, 2500),
      250
    );

    IF
      p_lon IS NOT NULL
      AND p_lat IS NOT NULL
      AND v_zone_lon IS NOT NULL
      AND v_zone_lat IS NOT NULL
      AND extensions.ST_DWithin(
        extensions.ST_SetSRID(extensions.ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography,
        extensions.ST_SetSRID(extensions.ST_MakePoint(v_zone_lon, v_zone_lat), 4326)::extensions.geography,
        v_radius_meters
      )
    THEN
      RETURN jsonb_build_object(
        'code',
        v_zone ->> 'code',
        'name',
        v_zone ->> 'name',
        'city',
        v_zone ->> 'city',
        'matched_by',
        'coordinates',
        'pickup_fee_amount',
        COALESCE((v_zone ->> 'pickup_fee_amount')::BIGINT, 0),
        'dropoff_fee_amount',
        COALESCE((v_zone ->> 'dropoff_fee_amount')::BIGINT, 0)
      );
    END IF;

    IF v_normalized_address <> '' THEN
      FOR v_keyword IN
        SELECT LOWER(value)
        FROM jsonb_array_elements_text(COALESCE(v_zone -> 'keywords', '[]'::JSONB))
      LOOP
        IF v_keyword <> '' AND POSITION(v_keyword IN v_normalized_address) > 0 THEN
          RETURN jsonb_build_object(
            'code',
            v_zone ->> 'code',
            'name',
            v_zone ->> 'name',
            'city',
            v_zone ->> 'city',
            'matched_by',
            'address_keyword',
            'pickup_fee_amount',
            COALESCE((v_zone ->> 'pickup_fee_amount')::BIGINT, 0),
            'dropoff_fee_amount',
            COALESCE((v_zone ->> 'dropoff_fee_amount')::BIGINT, 0)
          );
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_airport_trip_context(
  p_pickup_lon DOUBLE PRECISION,
  p_pickup_lat DOUBLE PRECISION,
  p_destination_lon DOUBLE PRECISION,
  p_destination_lat DOUBLE PRECISION,
  p_pickup_address TEXT DEFAULT NULL,
  p_destination_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_settings JSONB;
  v_pickup_zone JSONB;
  v_dropoff_zone JSONB;
  v_pickup_fee BIGINT := 0;
  v_dropoff_fee BIGINT := 0;
  v_default_pickup_fee BIGINT := 0;
  v_default_dropoff_fee BIGINT := 0;
BEGIN
  v_settings := public.get_airport_trip_settings();
  v_pickup_zone := public.find_airport_zone(p_pickup_lon, p_pickup_lat, p_pickup_address);
  v_dropoff_zone := public.find_airport_zone(
    p_destination_lon,
    p_destination_lat,
    p_destination_address
  );
  v_default_pickup_fee := COALESCE(
    (v_settings ->> 'default_pickup_fee_amount')::BIGINT,
    0
  );
  v_default_dropoff_fee := COALESCE(
    (v_settings ->> 'default_dropoff_fee_amount')::BIGINT,
    0
  );

  IF v_pickup_zone IS NOT NULL THEN
    v_pickup_fee := COALESCE(
      (v_pickup_zone ->> 'pickup_fee_amount')::BIGINT,
      v_default_pickup_fee,
      0
    );
  END IF;

  IF v_dropoff_zone IS NOT NULL THEN
    v_dropoff_fee := COALESCE(
      (v_dropoff_zone ->> 'dropoff_fee_amount')::BIGINT,
      v_default_dropoff_fee,
      0
    );
  END IF;

  RETURN jsonb_build_object(
    'is_airport_trip',
    (v_pickup_zone IS NOT NULL OR v_dropoff_zone IS NOT NULL),
    'pickup_is_airport',
    (v_pickup_zone IS NOT NULL),
    'dropoff_is_airport',
    (v_dropoff_zone IS NOT NULL),
    'pickup_zone',
    v_pickup_zone,
    'dropoff_zone',
    v_dropoff_zone,
    'airport_surcharge_amount',
    GREATEST(v_pickup_fee, 0) + GREATEST(v_dropoff_fee, 0),
    'enforce_in_app_price_only',
    COALESCE((v_settings ->> 'enforce_in_app_price_only')::BOOLEAN, true),
    'policy_copy',
    COALESCE(
      NULLIF(v_settings ->> 'policy_copy', ''),
      'Airport trips must follow the price shown in the app. Drivers must not request extra cash because a trip starts or ends at the airport.'
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_airport_trip_settings()
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.find_airport_zone(
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  TEXT
)
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_airport_trip_context(
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  TEXT,
  TEXT
)
TO authenticated, service_role;

WITH airport_context AS (
  SELECT
    rides.id,
    rides.is_delivery,
    public.get_airport_trip_context(
      rides.pickup_lon,
      rides.pickup_lat,
      rides.destination_lon,
      rides.destination_lat,
      rides.pickup_address,
      rides.destination_address
    ) AS context
  FROM public.rides
)
UPDATE public.rides AS rides
SET
  is_airport_trip = COALESCE((airport_context.context ->> 'is_airport_trip')::BOOLEAN, false),
  airport_pickup_zone_code = NULLIF(airport_context.context #>> '{pickup_zone,code}', ''),
  airport_pickup_zone_name = NULLIF(airport_context.context #>> '{pickup_zone,name}', ''),
  airport_dropoff_zone_code = NULLIF(airport_context.context #>> '{dropoff_zone,code}', ''),
  airport_dropoff_zone_name = NULLIF(airport_context.context #>> '{dropoff_zone,name}', ''),
  airport_surcharge_amount = CASE
    WHEN COALESCE(airport_context.is_delivery, false) THEN 0
    ELSE COALESCE((airport_context.context ->> 'airport_surcharge_amount')::BIGINT, 0)
  END
FROM airport_context
WHERE airport_context.id = rides.id;

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
  v_pricing_distance_km double precision := 0;
  computed_price numeric := 0;
  v_hour int := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Africa/Lagos'));
  v_traffic_multiplier numeric := 1.3;
  v_circuity_factor numeric := 1.25;
  v_airport_context jsonb := '{}'::jsonb;
  v_airport_surcharge_amount bigint := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_delivery = true THEN
      NEW.pickup_code := floor(random() * 9000 + 1000)::text;
      NEW.dropoff_code := floor(random() * 9000 + 1000)::text;
    END IF;

    v_airport_context := public.get_airport_trip_context(
      NEW.pickup_lon,
      NEW.pickup_lat,
      NEW.destination_lon,
      NEW.destination_lat,
      NEW.pickup_address,
      NEW.destination_address
    );

    NEW.is_airport_trip := COALESCE(
      (v_airport_context ->> 'is_airport_trip')::BOOLEAN,
      false
    );
    NEW.airport_pickup_zone_code := NULLIF(v_airport_context #>> '{pickup_zone,code}', '');
    NEW.airport_pickup_zone_name := NULLIF(v_airport_context #>> '{pickup_zone,name}', '');
    NEW.airport_dropoff_zone_code := NULLIF(v_airport_context #>> '{dropoff_zone,code}', '');
    NEW.airport_dropoff_zone_name := NULLIF(v_airport_context #>> '{dropoff_zone,name}', '');
    v_airport_surcharge_amount := CASE
      WHEN COALESCE(NEW.is_delivery, false) THEN 0
      ELSE COALESCE((v_airport_context ->> 'airport_surcharge_amount')::BIGINT, 0)
    END;
    NEW.airport_surcharge_amount := GREATEST(v_airport_surcharge_amount, 0);

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
      IF NEW.route_distance_km IS NULL AND COALESCE(NEW.distance_km, 0) = 0 THEN
        NEW.distance_km := v_calc_dist_km::numeric(10, 2);
      END IF;
    END IF;

    IF NEW.route_distance_km IS NOT NULL AND COALESCE(NEW.distance_km, 0) = 0 THEN
      NEW.distance_km := NEW.route_distance_km;
    END IF;

    IF (v_hour BETWEEN 7 AND 9) OR (v_hour BETWEEN 16 AND 19) THEN
      v_traffic_multiplier := 2.2;
    ELSIF (v_hour >= 21 OR v_hour < 6) THEN
      v_traffic_multiplier := 0.9;
    END IF;

    IF NEW.estimated_dropoff_mins IS NULL THEN
      NEW.estimated_dropoff_mins :=
        CEIL(
          (COALESCE(NEW.distance_km::double precision, v_calc_dist_km) * v_circuity_factor)
          * (2.2 * v_traffic_multiplier)
        );
      NEW.eta_source := COALESCE(NEW.eta_source, 'heuristic_fallback');
    END IF;

    IF NEW.estimated_pickup_mins IS NULL THEN
      NEW.estimated_pickup_mins :=
        CASE WHEN v_traffic_multiplier > 2 THEN 10 ELSE 6 END;
      NEW.eta_source := COALESCE(NEW.eta_source, 'heuristic_fallback');
    END IF;

    v_pricing_distance_km := COALESCE(
      NEW.route_distance_km::double precision,
      NEW.distance_km::double precision,
      v_calc_dist_km,
      0
    );

    IF NEW.price IS NULL OR NEW.price = 0 THEN
      computed_price := (svc_base_fare + (svc_per_km_rate * v_pricing_distance_km))::numeric;
      computed_price := GREATEST(computed_price, COALESCE(svc_min_fare, 0)::numeric);
      NEW.price := (ROUND(computed_price / 100.0) * 100)::numeric;

      IF GREATEST(v_airport_surcharge_amount, 0) > 0 THEN
        NEW.price := COALESCE(NEW.price, 0) + GREATEST(v_airport_surcharge_amount, 0);
      END IF;
    END IF;

    NEW.eta_last_calculated_at := COALESCE(NEW.eta_last_calculated_at, now());
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
