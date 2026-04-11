DO $$
DECLARE
  v_trip_value JSONB;
BEGIN
  SELECT value
  INTO v_trip_value
  FROM public.app_configs
  WHERE key = 'trip_billing_settings'
  LIMIT 1;

  INSERT INTO public.app_configs (key, description, value)
  VALUES (
    'trip_billing_settings',
    'Trip billing rules for customer-visible wait timers, grace windows, and flat waiting surcharges. Traffic, slow driving, and route delay do not create extra charges.',
    jsonb_build_object(
      'customer_visible_wait_timer_minutes',
      COALESCE((v_trip_value ->> 'customer_visible_wait_timer_minutes')::INT, 7),
      'pickup_wait_grace_minutes',
      COALESCE((v_trip_value ->> 'pickup_wait_grace_minutes')::INT, 10),
      'delivery_wait_charge_grace_minutes',
      COALESCE(
        (v_trip_value ->> 'delivery_wait_charge_grace_minutes')::INT,
        10
      ),
      'wait_fee_interval_minutes',
      COALESCE((v_trip_value ->> 'wait_fee_interval_minutes')::INT, 5),
      'wait_fee_amount',
      COALESCE((v_trip_value ->> 'wait_fee_amount')::BIGINT, 10),
      'delivery_wait_fee_interval_minutes',
      COALESCE(
        (v_trip_value ->> 'delivery_wait_fee_interval_minutes')::INT,
        (v_trip_value ->> 'wait_fee_interval_minutes')::INT,
        5
      ),
      'delivery_wait_fee_amount',
      COALESCE(
        (v_trip_value ->> 'delivery_wait_fee_amount')::BIGINT,
        (v_trip_value ->> 'wait_fee_amount')::BIGINT,
        10
      ),
      'allow_price_reduction',
      COALESCE((v_trip_value ->> 'allow_price_reduction')::BOOLEAN, false),
      'charge_only_when_customer_not_ready',
      COALESCE(
        (v_trip_value ->> 'charge_only_when_customer_not_ready')::BOOLEAN,
        true
      ),
      'charge_for_traffic',
      COALESCE((v_trip_value ->> 'charge_for_traffic')::BOOLEAN, false),
      'charge_for_driver_delay',
      COALESCE((v_trip_value ->> 'charge_for_driver_delay')::BOOLEAN, false),
      'charge_for_route_delay',
      COALESCE((v_trip_value ->> 'charge_for_route_delay')::BOOLEAN, false)
    )
  )
  ON CONFLICT (key) DO UPDATE
  SET
    description = EXCLUDED.description,
    value = EXCLUDED.value,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_default_airport_trip_zones()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_array(
    jsonb_build_object(
      'code', 'LOS_MMA',
      'name', 'Murtala Muhammed International Airport',
      'city', 'Lagos',
      'terminal_label', 'Lagos airport',
      'lat', 6.5774,
      'lon', 3.3212,
      'radius_meters', 2500,
      'pickup_access_fee_amount', 400,
      'pickup_convenience_fee_amount', 500,
      'dropoff_fee_amount', 0,
      'reservation_fee_amount', 1200,
      'reservation_dispatch_lead_minutes', 45,
      'reservation_included_wait_minutes', 30,
      'reservation_min_lead_minutes', 30,
      'reservation_enabled', true,
      'active', true,
      'keywords', jsonb_build_array(
        'murtala muhammed international airport',
        'murtala mohammed international airport',
        'murtala muhammad international airport',
        'mma',
        'mma2',
        'lagos airport'
      )
    ),
    jsonb_build_object(
      'code', 'ABV_NAIA',
      'name', 'Nnamdi Azikiwe International Airport',
      'city', 'Abuja',
      'terminal_label', 'Abuja airport',
      'lat', 9.0068,
      'lon', 7.2632,
      'radius_meters', 2500,
      'pickup_access_fee_amount', 500,
      'pickup_convenience_fee_amount', 700,
      'dropoff_fee_amount', 0,
      'reservation_fee_amount', 1500,
      'reservation_dispatch_lead_minutes', 45,
      'reservation_included_wait_minutes', 35,
      'reservation_min_lead_minutes', 30,
      'reservation_enabled', true,
      'active', true,
      'keywords', jsonb_build_array(
        'nnamdi azikiwe international airport',
        'abuja airport'
      )
    ),
    jsonb_build_object(
      'code', 'PHC_IA',
      'name', 'Port Harcourt International Airport',
      'city', 'Port Harcourt',
      'terminal_label', 'Port Harcourt airport',
      'lat', 5.0155,
      'lon', 6.9496,
      'radius_meters', 2500,
      'pickup_access_fee_amount', 500,
      'pickup_convenience_fee_amount', 800,
      'dropoff_fee_amount', 0,
      'reservation_fee_amount', 1300,
      'reservation_dispatch_lead_minutes', 45,
      'reservation_included_wait_minutes', 35,
      'reservation_min_lead_minutes', 30,
      'reservation_enabled', true,
      'active', true,
      'keywords', jsonb_build_array(
        'port harcourt international airport',
        'port harcourt airport'
      )
    ),
    jsonb_build_object(
      'code', 'KAN_MAKIA',
      'name', 'Mallam Aminu Kano International Airport',
      'city', 'Kano',
      'terminal_label', 'Kano airport',
      'lat', 12.0476,
      'lon', 8.5246,
      'radius_meters', 2500,
      'pickup_access_fee_amount', 0,
      'pickup_convenience_fee_amount', 0,
      'dropoff_fee_amount', 0,
      'reservation_fee_amount', 0,
      'reservation_dispatch_lead_minutes', 45,
      'reservation_included_wait_minutes', 30,
      'reservation_min_lead_minutes', 30,
      'reservation_enabled', false,
      'active', true,
      'keywords', jsonb_build_array(
        'mallam aminu kano international airport',
        'kano airport'
      )
    ),
    jsonb_build_object(
      'code', 'ENU_AIIA',
      'name', 'Akanu Ibiam International Airport',
      'city', 'Enugu',
      'terminal_label', 'Enugu airport',
      'lat', 6.4743,
      'lon', 7.56196,
      'radius_meters', 2500,
      'pickup_access_fee_amount', 0,
      'pickup_convenience_fee_amount', 0,
      'dropoff_fee_amount', 0,
      'reservation_fee_amount', 0,
      'reservation_dispatch_lead_minutes', 45,
      'reservation_included_wait_minutes', 30,
      'reservation_min_lead_minutes', 30,
      'reservation_enabled', false,
      'active', true,
      'keywords', jsonb_build_array(
        'akanu ibiam international airport',
        'enugu airport'
      )
    ),
    jsonb_build_object(
      'code', 'QOW_SMIA',
      'name', 'Sam Mbakwe International Cargo Airport',
      'city', 'Owerri',
      'terminal_label', 'Owerri airport',
      'lat', 5.4271,
      'lon', 7.2060,
      'radius_meters', 2500,
      'pickup_access_fee_amount', 0,
      'pickup_convenience_fee_amount', 0,
      'dropoff_fee_amount', 0,
      'reservation_fee_amount', 0,
      'reservation_dispatch_lead_minutes', 45,
      'reservation_included_wait_minutes', 30,
      'reservation_min_lead_minutes', 30,
      'reservation_enabled', false,
      'active', true,
      'keywords', jsonb_build_array(
        'sam mbakwe international cargo airport',
        'owerri airport'
      )
    )
  );
$$;

INSERT INTO public.app_configs (key, description, value)
VALUES (
  'airport_trip_settings',
  'Airport ride pricing and reservation settings. Airport fees are controlled centrally and drivers must not request extra cash outside the app.',
  jsonb_build_object(
    'enabled', true,
    'reservation_enabled', true,
    'enforce_in_app_price_only', true,
    'default_pickup_access_fee_amount', 0,
    'default_pickup_convenience_fee_amount', 0,
    'default_dropoff_fee_amount', 0,
    'default_reservation_fee_amount', 1200,
    'default_reservation_dispatch_lead_minutes', 45,
    'default_reservation_included_wait_minutes', 30,
    'default_reservation_min_lead_minutes', 30,
    'policy_copy', 'Airport trips must follow the price shown in the app. Drivers must not request extra cash because a trip starts or ends at the airport.',
    'reservation_copy', 'Reserve airport pickup to have dispatch start earlier and include extra waiting time after your reserved pickup time.',
    'zones', public.get_default_airport_trip_zones()
  )
)
ON CONFLICT (key) DO UPDATE
SET
  description = EXCLUDED.description,
  value = jsonb_build_object(
    'enabled',
    COALESCE((public.app_configs.value ->> 'enabled')::BOOLEAN, true),
    'reservation_enabled',
    COALESCE(
      (public.app_configs.value ->> 'reservation_enabled')::BOOLEAN,
      true
    ),
    'enforce_in_app_price_only',
    COALESCE(
      (public.app_configs.value ->> 'enforce_in_app_price_only')::BOOLEAN,
      true
    ),
    'default_pickup_access_fee_amount',
    COALESCE(
      (public.app_configs.value ->> 'default_pickup_access_fee_amount')::BIGINT,
      0
    ),
    'default_pickup_convenience_fee_amount',
    COALESCE(
      (public.app_configs.value ->> 'default_pickup_convenience_fee_amount')::BIGINT,
      0
    ),
    'default_dropoff_fee_amount',
    COALESCE(
      (public.app_configs.value ->> 'default_dropoff_fee_amount')::BIGINT,
      0
    ),
    'default_reservation_fee_amount',
    COALESCE(
      (public.app_configs.value ->> 'default_reservation_fee_amount')::BIGINT,
      1200
    ),
    'default_reservation_dispatch_lead_minutes',
    COALESCE(
      (public.app_configs.value ->> 'default_reservation_dispatch_lead_minutes')::INT,
      45
    ),
    'default_reservation_included_wait_minutes',
    COALESCE(
      (public.app_configs.value ->> 'default_reservation_included_wait_minutes')::INT,
      30
    ),
    'default_reservation_min_lead_minutes',
    COALESCE(
      (public.app_configs.value ->> 'default_reservation_min_lead_minutes')::INT,
      30
    ),
    'policy_copy',
    COALESCE(
      NULLIF(public.app_configs.value ->> 'policy_copy', ''),
      'Airport trips must follow the price shown in the app. Drivers must not request extra cash because a trip starts or ends at the airport.'
    ),
    'reservation_copy',
    COALESCE(
      NULLIF(public.app_configs.value ->> 'reservation_copy', ''),
      'Reserve airport pickup to have dispatch start earlier and include extra waiting time after your reserved pickup time.'
    ),
    'zones',
    public.get_default_airport_trip_zones()
  ),
  updated_at = now();

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS trip_base_fare_amount BIGINT,
  ADD COLUMN IF NOT EXISTS airport_access_fee_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS airport_convenience_fee_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS airport_dropoff_fee_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_reserved_ride BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reservation_type TEXT,
  ADD COLUMN IF NOT EXISTS reservation_source TEXT,
  ADD COLUMN IF NOT EXISTS reservation_pickup_ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reservation_included_wait_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS reservation_fee_amount BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.scheduled_rides
  ADD COLUMN IF NOT EXISTS trip_base_fare_amount BIGINT,
  ADD COLUMN IF NOT EXISTS is_airport_trip BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS airport_pickup_zone_code TEXT,
  ADD COLUMN IF NOT EXISTS airport_pickup_zone_name TEXT,
  ADD COLUMN IF NOT EXISTS airport_dropoff_zone_code TEXT,
  ADD COLUMN IF NOT EXISTS airport_dropoff_zone_name TEXT,
  ADD COLUMN IF NOT EXISTS airport_surcharge_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS airport_access_fee_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS airport_convenience_fee_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS airport_dropoff_fee_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_reserved_ride BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reservation_type TEXT,
  ADD COLUMN IF NOT EXISTS reservation_source TEXT,
  ADD COLUMN IF NOT EXISTS reservation_pickup_ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reservation_included_wait_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS reservation_fee_amount BIGINT NOT NULL DEFAULT 0;

UPDATE public.rides
SET
  trip_base_fare_amount = COALESCE(
    trip_base_fare_amount,
    GREATEST(
      COALESCE(quoted_price_amount, price, 0)
      - COALESCE(airport_surcharge_amount, 0)
      - COALESCE(reservation_fee_amount, 0),
      0
    )
  ),
  airport_access_fee_amount = COALESCE(airport_access_fee_amount, 0),
  airport_convenience_fee_amount = COALESCE(airport_convenience_fee_amount, 0),
  airport_dropoff_fee_amount = COALESCE(airport_dropoff_fee_amount, 0),
  reservation_fee_amount = COALESCE(reservation_fee_amount, 0),
  is_reserved_ride = COALESCE(is_reserved_ride, false)
WHERE
  trip_base_fare_amount IS NULL
  OR airport_access_fee_amount IS NULL
  OR airport_convenience_fee_amount IS NULL
  OR airport_dropoff_fee_amount IS NULL
  OR reservation_fee_amount IS NULL
  OR is_reserved_ride IS NULL;

UPDATE public.scheduled_rides
SET
  trip_base_fare_amount = COALESCE(
    trip_base_fare_amount,
    GREATEST(
      COALESCE(quoted_price, 0)
      - COALESCE(airport_surcharge_amount, 0)
      - COALESCE(reservation_fee_amount, 0),
      0
    )
  ),
  airport_surcharge_amount = COALESCE(airport_surcharge_amount, 0),
  airport_access_fee_amount = COALESCE(airport_access_fee_amount, 0),
  airport_convenience_fee_amount = COALESCE(airport_convenience_fee_amount, 0),
  airport_dropoff_fee_amount = COALESCE(airport_dropoff_fee_amount, 0),
  reservation_fee_amount = COALESCE(reservation_fee_amount, 0),
  is_airport_trip = COALESCE(is_airport_trip, false),
  is_reserved_ride = COALESCE(is_reserved_ride, false)
WHERE
  trip_base_fare_amount IS NULL
  OR airport_surcharge_amount IS NULL
  OR airport_access_fee_amount IS NULL
  OR airport_convenience_fee_amount IS NULL
  OR airport_dropoff_fee_amount IS NULL
  OR reservation_fee_amount IS NULL
  OR is_airport_trip IS NULL
  OR is_reserved_ride IS NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_rides_reserved_airport
  ON public.scheduled_rides (is_reserved_ride, is_airport_trip, scheduled_for DESC);

CREATE OR REPLACE FUNCTION public.get_trip_billing_settings()
RETURNS JSONB
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
  WHERE key = 'trip_billing_settings'
  LIMIT 1;

  RETURN jsonb_build_object(
    'customer_visible_wait_timer_minutes',
    COALESCE((v_value ->> 'customer_visible_wait_timer_minutes')::INT, 7),
    'pickup_wait_grace_minutes',
    COALESCE((v_value ->> 'pickup_wait_grace_minutes')::INT, 10),
    'delivery_wait_charge_grace_minutes',
    COALESCE(
      (v_value ->> 'delivery_wait_charge_grace_minutes')::INT,
      10
    ),
    'wait_fee_interval_minutes',
    COALESCE((v_value ->> 'wait_fee_interval_minutes')::INT, 5),
    'wait_fee_amount',
    COALESCE((v_value ->> 'wait_fee_amount')::BIGINT, 10),
    'delivery_wait_fee_interval_minutes',
    COALESCE(
      (v_value ->> 'delivery_wait_fee_interval_minutes')::INT,
      (v_value ->> 'wait_fee_interval_minutes')::INT,
      5
    ),
    'delivery_wait_fee_amount',
    COALESCE(
      (v_value ->> 'delivery_wait_fee_amount')::BIGINT,
      (v_value ->> 'wait_fee_amount')::BIGINT,
      10
    ),
    'allow_price_reduction',
    COALESCE((v_value ->> 'allow_price_reduction')::BOOLEAN, false),
    'charge_only_when_customer_not_ready',
    COALESCE((v_value ->> 'charge_only_when_customer_not_ready')::BOOLEAN, true),
    'charge_for_traffic',
    COALESCE((v_value ->> 'charge_for_traffic')::BOOLEAN, false),
    'charge_for_driver_delay',
    COALESCE((v_value ->> 'charge_for_driver_delay')::BOOLEAN, false),
    'charge_for_route_delay',
    COALESCE((v_value ->> 'charge_for_route_delay')::BOOLEAN, false)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_airport_trip_settings()
RETURNS JSONB
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
  WHERE key = 'airport_trip_settings'
  LIMIT 1;

  RETURN jsonb_build_object(
    'enabled',
    COALESCE((v_value ->> 'enabled')::BOOLEAN, true),
    'reservation_enabled',
    COALESCE((v_value ->> 'reservation_enabled')::BOOLEAN, true),
    'enforce_in_app_price_only',
    COALESCE((v_value ->> 'enforce_in_app_price_only')::BOOLEAN, true),
    'default_pickup_access_fee_amount',
    COALESCE((v_value ->> 'default_pickup_access_fee_amount')::BIGINT, 0),
    'default_pickup_convenience_fee_amount',
    COALESCE((v_value ->> 'default_pickup_convenience_fee_amount')::BIGINT, 0),
    'default_dropoff_fee_amount',
    COALESCE((v_value ->> 'default_dropoff_fee_amount')::BIGINT, 0),
    'default_reservation_fee_amount',
    COALESCE((v_value ->> 'default_reservation_fee_amount')::BIGINT, 1200),
    'default_reservation_dispatch_lead_minutes',
    COALESCE((v_value ->> 'default_reservation_dispatch_lead_minutes')::INT, 45),
    'default_reservation_included_wait_minutes',
    COALESCE((v_value ->> 'default_reservation_included_wait_minutes')::INT, 30),
    'default_reservation_min_lead_minutes',
    COALESCE((v_value ->> 'default_reservation_min_lead_minutes')::INT, 30),
    'policy_copy',
    COALESCE(
      NULLIF(v_value ->> 'policy_copy', ''),
      'Airport trips must follow the price shown in the app. Drivers must not request extra cash because a trip starts or ends at the airport.'
    ),
    'reservation_copy',
    COALESCE(
      NULLIF(v_value ->> 'reservation_copy', ''),
      'Reserve airport pickup to have dispatch start earlier and include extra waiting time after your reserved pickup time.'
    ),
    'zones',
    COALESCE(v_value -> 'zones', public.get_default_airport_trip_zones())
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
      RETURN v_zone || jsonb_build_object('matched_by', 'coordinates');
    END IF;

    IF v_normalized_address <> '' THEN
      FOR v_keyword IN
        SELECT LOWER(value)
        FROM jsonb_array_elements_text(COALESCE(v_zone -> 'keywords', '[]'::JSONB))
      LOOP
        IF v_keyword <> '' AND POSITION(v_keyword IN v_normalized_address) > 0 THEN
          RETURN v_zone || jsonb_build_object('matched_by', 'address_keyword');
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
  v_pickup_access_fee BIGINT := 0;
  v_pickup_convenience_fee BIGINT := 0;
  v_dropoff_fee BIGINT := 0;
  v_reservation_fee BIGINT := 0;
  v_reservation_dispatch_lead_minutes INTEGER := 45;
  v_reservation_included_wait_minutes INTEGER := 30;
  v_reservation_min_lead_minutes INTEGER := 30;
  v_reservation_enabled BOOLEAN := false;
BEGIN
  v_settings := public.get_airport_trip_settings();
  v_pickup_zone := public.find_airport_zone(p_pickup_lon, p_pickup_lat, p_pickup_address);
  v_dropoff_zone := public.find_airport_zone(
    p_destination_lon,
    p_destination_lat,
    p_destination_address
  );

  IF v_pickup_zone IS NOT NULL THEN
    v_pickup_access_fee := COALESCE(
      (v_pickup_zone ->> 'pickup_access_fee_amount')::BIGINT,
      (v_pickup_zone ->> 'pickup_fee_amount')::BIGINT,
      (v_settings ->> 'default_pickup_access_fee_amount')::BIGINT,
      0
    );
    v_pickup_convenience_fee := COALESCE(
      (v_pickup_zone ->> 'pickup_convenience_fee_amount')::BIGINT,
      0
    );
    v_reservation_enabled := COALESCE(
      (v_pickup_zone ->> 'reservation_enabled')::BOOLEAN,
      (v_settings ->> 'reservation_enabled')::BOOLEAN,
      true
    );
    v_reservation_fee := CASE
      WHEN v_reservation_enabled THEN
        COALESCE(
          (v_pickup_zone ->> 'reservation_fee_amount')::BIGINT,
          (v_settings ->> 'default_reservation_fee_amount')::BIGINT,
          0
        )
      ELSE 0
    END;
    v_reservation_dispatch_lead_minutes := COALESCE(
      (v_pickup_zone ->> 'reservation_dispatch_lead_minutes')::INT,
      (v_settings ->> 'default_reservation_dispatch_lead_minutes')::INT,
      45
    );
    v_reservation_included_wait_minutes := COALESCE(
      (v_pickup_zone ->> 'reservation_included_wait_minutes')::INT,
      (v_settings ->> 'default_reservation_included_wait_minutes')::INT,
      30
    );
    v_reservation_min_lead_minutes := COALESCE(
      (v_pickup_zone ->> 'reservation_min_lead_minutes')::INT,
      (v_settings ->> 'default_reservation_min_lead_minutes')::INT,
      30
    );
  END IF;

  IF v_dropoff_zone IS NOT NULL THEN
    v_dropoff_fee := COALESCE(
      (v_dropoff_zone ->> 'dropoff_fee_amount')::BIGINT,
      (v_settings ->> 'default_dropoff_fee_amount')::BIGINT,
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
    'airport_access_fee_amount',
    GREATEST(v_pickup_access_fee, 0),
    'airport_convenience_fee_amount',
    GREATEST(v_pickup_convenience_fee, 0),
    'airport_dropoff_fee_amount',
    GREATEST(v_dropoff_fee, 0),
    'airport_surcharge_amount',
    GREATEST(v_pickup_access_fee, 0)
      + GREATEST(v_pickup_convenience_fee, 0)
      + GREATEST(v_dropoff_fee, 0),
    'reservation_enabled',
    v_reservation_enabled,
    'reservation_fee_amount',
    GREATEST(v_reservation_fee, 0),
    'reservation_dispatch_lead_minutes',
    GREATEST(v_reservation_dispatch_lead_minutes, 5),
    'reservation_included_wait_minutes',
    GREATEST(v_reservation_included_wait_minutes, 0),
    'reservation_min_lead_minutes',
    GREATEST(v_reservation_min_lead_minutes, 5),
    'reservation_total_extra_amount',
    GREATEST(v_pickup_access_fee, 0)
      + GREATEST(v_pickup_convenience_fee, 0)
      + GREATEST(v_dropoff_fee, 0)
      + GREATEST(v_reservation_fee, 0),
    'enforce_in_app_price_only',
    COALESCE((v_settings ->> 'enforce_in_app_price_only')::BOOLEAN, true),
    'policy_copy',
    COALESCE(
      NULLIF(v_settings ->> 'policy_copy', ''),
      'Airport trips must follow the price shown in the app. Drivers must not request extra cash because a trip starts or ends at the airport.'
    ),
    'reservation_copy',
    COALESCE(
      NULLIF(v_settings ->> 'reservation_copy', ''),
      'Reserve airport pickup to have dispatch start earlier and include extra waiting time after your reserved pickup time.'
    )
  );
END;
$$;

DROP FUNCTION IF EXISTS public.create_ride_v2(
  uuid,
  double precision,
  double precision,
  double precision,
  double precision,
  text,
  text,
  boolean,
  public.vehicle_category,
  uuid,
  jsonb,
  numeric,
  numeric,
  integer,
  integer,
  text,
  timestamptz,
  numeric,
  numeric,
  text,
  text,
  uuid
);

CREATE OR REPLACE FUNCTION public.create_ride_v2(
  in_customer_id uuid,
  in_pickup_lon double precision,
  in_pickup_lat double precision,
  in_destination_lon double precision,
  in_destination_lat double precision,
  in_pickup_address text,
  in_destination_address text,
  in_is_delivery boolean,
  in_requested_vehicle public.vehicle_category,
  in_service_type_id uuid,
  in_delivery_item_info jsonb,
  in_price numeric DEFAULT NULL,
  in_distance_km numeric DEFAULT NULL,
  in_estimated_pickup_mins integer DEFAULT NULL,
  in_estimated_dropoff_mins integer DEFAULT NULL,
  in_eta_source text DEFAULT NULL,
  in_eta_last_calculated_at timestamptz DEFAULT NULL,
  in_route_distance_km numeric DEFAULT NULL,
  in_driver_pickup_distance_km numeric DEFAULT NULL,
  in_routing_provider text DEFAULT NULL,
  in_routing_preference text DEFAULT NULL,
  in_client_request_id uuid DEFAULT NULL,
  in_is_reserved_ride boolean DEFAULT false,
  in_reservation_type text DEFAULT NULL,
  in_reservation_source text DEFAULT NULL,
  in_reservation_pickup_ready_at timestamptz DEFAULT NULL,
  in_reservation_included_wait_minutes integer DEFAULT NULL,
  in_reservation_fee_amount bigint DEFAULT 0,
  in_airport_access_fee_amount bigint DEFAULT 0,
  in_airport_convenience_fee_amount bigint DEFAULT 0,
  in_airport_dropoff_fee_amount bigint DEFAULT 0,
  in_airport_surcharge_amount bigint DEFAULT 0,
  in_trip_base_fare_amount bigint DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  customer_id uuid,
  driver_id uuid,
  pickup_code text,
  dropoff_code text,
  price numeric,
  quoted_price_amount bigint,
  trip_base_fare_amount bigint,
  airport_surcharge_amount bigint,
  airport_access_fee_amount bigint,
  airport_convenience_fee_amount bigint,
  airport_dropoff_fee_amount bigint,
  reservation_fee_amount bigint,
  is_reserved_ride boolean,
  reservation_type text,
  reservation_source text,
  reservation_pickup_ready_at timestamptz,
  reservation_included_wait_minutes integer,
  status text,
  is_delivery boolean,
  is_airport_trip boolean,
  airport_pickup_zone_code text,
  airport_pickup_zone_name text,
  airport_dropoff_zone_code text,
  airport_dropoff_zone_name text,
  pickup_address text,
  pickup_lat double precision,
  pickup_lon double precision,
  destination_address text,
  destination_lat double precision,
  destination_lon double precision,
  requested_vehicle_type text,
  service_type_id uuid,
  delivery_item_info jsonb,
  estimated_pickup_mins integer,
  estimated_dropoff_mins integer,
  distance_km numeric,
  route_distance_km numeric,
  driver_pickup_distance_km numeric,
  eta_source text,
  eta_last_calculated_at timestamptz,
  routing_provider text,
  routing_preference text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF in_client_request_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      rides.id,
      rides.customer_id,
      rides.driver_id,
      rides.pickup_code,
      rides.dropoff_code,
      rides.price::numeric,
      rides.quoted_price_amount,
      rides.trip_base_fare_amount,
      rides.airport_surcharge_amount,
      rides.airport_access_fee_amount,
      rides.airport_convenience_fee_amount,
      rides.airport_dropoff_fee_amount,
      rides.reservation_fee_amount,
      rides.is_reserved_ride,
      rides.reservation_type,
      rides.reservation_source,
      rides.reservation_pickup_ready_at,
      rides.reservation_included_wait_minutes,
      rides.status::text,
      rides.is_delivery,
      rides.is_airport_trip,
      rides.airport_pickup_zone_code,
      rides.airport_pickup_zone_name,
      rides.airport_dropoff_zone_code,
      rides.airport_dropoff_zone_name,
      rides.pickup_address,
      rides.pickup_lat,
      rides.pickup_lon,
      rides.destination_address,
      rides.destination_lat,
      rides.destination_lon,
      rides.requested_vehicle_type::text,
      rides.service_type_id,
      rides.delivery_item_info,
      rides.estimated_pickup_mins,
      rides.estimated_dropoff_mins,
      rides.distance_km,
      rides.route_distance_km,
      rides.driver_pickup_distance_km,
      rides.eta_source,
      rides.eta_last_calculated_at,
      rides.routing_provider,
      rides.routing_preference,
      rides.created_at
    FROM public.rides
    WHERE rides.customer_id = in_customer_id
      AND rides.client_request_id = in_client_request_id
    LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  PERFORM public.assert_customer_has_no_unpaid_completed_trip(in_customer_id);
  PERFORM public.assert_customer_has_no_pending_rating_trip(in_customer_id);
  PERFORM public.assert_valid_booking_locations(
    in_pickup_lon,
    in_pickup_lat,
    in_destination_lon,
    in_destination_lat,
    in_pickup_address,
    in_destination_address
  );

  RETURN QUERY
  INSERT INTO public.rides (
    pickup_lon,
    pickup_lat,
    destination_lon,
    destination_lat,
    pickup_address,
    destination_address,
    is_delivery,
    customer_id,
    requested_vehicle_type,
    service_type_id,
    delivery_item_info,
    price,
    quoted_price_amount,
    trip_base_fare_amount,
    distance_km,
    estimated_pickup_mins,
    estimated_dropoff_mins,
    eta_source,
    eta_last_calculated_at,
    route_distance_km,
    driver_pickup_distance_km,
    routing_provider,
    routing_preference,
    client_request_id,
    airport_access_fee_amount,
    airport_convenience_fee_amount,
    airport_dropoff_fee_amount,
    airport_surcharge_amount,
    is_reserved_ride,
    reservation_type,
    reservation_source,
    reservation_pickup_ready_at,
    reservation_included_wait_minutes,
    reservation_fee_amount,
    status
  )
  VALUES (
    in_pickup_lon,
    in_pickup_lat,
    in_destination_lon,
    in_destination_lat,
    in_pickup_address,
    in_destination_address,
    COALESCE(in_is_delivery, false),
    in_customer_id,
    in_requested_vehicle,
    in_service_type_id,
    in_delivery_item_info,
    in_price,
    COALESCE(in_price::bigint, NULL),
    COALESCE(
      in_trip_base_fare_amount,
      CASE
        WHEN in_price IS NULL THEN NULL
        ELSE GREATEST(
          ROUND(in_price)::BIGINT
          - GREATEST(COALESCE(in_airport_surcharge_amount, 0), 0)
          - GREATEST(COALESCE(in_reservation_fee_amount, 0), 0),
          0
        )
      END
    ),
    in_distance_km,
    in_estimated_pickup_mins,
    in_estimated_dropoff_mins,
    in_eta_source,
    in_eta_last_calculated_at,
    in_route_distance_km,
    in_driver_pickup_distance_km,
    in_routing_provider,
    in_routing_preference,
    in_client_request_id,
    GREATEST(COALESCE(in_airport_access_fee_amount, 0), 0),
    GREATEST(COALESCE(in_airport_convenience_fee_amount, 0), 0),
    GREATEST(COALESCE(in_airport_dropoff_fee_amount, 0), 0),
    GREATEST(COALESCE(in_airport_surcharge_amount, 0), 0),
    COALESCE(in_is_reserved_ride, false),
    NULLIF(BTRIM(COALESCE(in_reservation_type, '')), ''),
    NULLIF(BTRIM(COALESCE(in_reservation_source, '')), ''),
    in_reservation_pickup_ready_at,
    in_reservation_included_wait_minutes,
    GREATEST(COALESCE(in_reservation_fee_amount, 0), 0),
    'pending'
  )
  RETURNING
    rides.id,
    rides.customer_id,
    rides.driver_id,
    rides.pickup_code,
    rides.dropoff_code,
    rides.price::numeric,
    rides.quoted_price_amount,
    rides.trip_base_fare_amount,
    rides.airport_surcharge_amount,
    rides.airport_access_fee_amount,
    rides.airport_convenience_fee_amount,
    rides.airport_dropoff_fee_amount,
    rides.reservation_fee_amount,
    rides.is_reserved_ride,
    rides.reservation_type,
    rides.reservation_source,
    rides.reservation_pickup_ready_at,
    rides.reservation_included_wait_minutes,
    rides.status::text,
    rides.is_delivery,
    rides.is_airport_trip,
    rides.airport_pickup_zone_code,
    rides.airport_pickup_zone_name,
    rides.airport_dropoff_zone_code,
    rides.airport_dropoff_zone_name,
    rides.pickup_address,
    rides.pickup_lat,
    rides.pickup_lon,
    rides.destination_address,
    rides.destination_lat,
    rides.destination_lon,
    rides.requested_vehicle_type::text,
    rides.service_type_id,
    rides.delivery_item_info,
    rides.estimated_pickup_mins,
    rides.estimated_dropoff_mins,
    rides.distance_km,
    rides.route_distance_km,
    rides.driver_pickup_distance_km,
    rides.eta_source,
    rides.eta_last_calculated_at,
    rides.routing_provider,
    rides.routing_preference,
    rides.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_ride_v2(
  uuid,
  double precision,
  double precision,
  double precision,
  double precision,
  text,
  text,
  boolean,
  public.vehicle_category,
  uuid,
  jsonb,
  numeric,
  numeric,
  integer,
  integer,
  text,
  timestamptz,
  numeric,
  numeric,
  text,
  text,
  uuid,
  boolean,
  text,
  text,
  timestamptz,
  integer,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint
) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.create_scheduled_ride(
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
  numeric,
  integer,
  integer,
  numeric,
  text,
  timestamptz,
  text,
  text,
  uuid
);

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
  in_quoted_distance_km numeric DEFAULT NULL,
  in_quoted_estimated_pickup_mins integer DEFAULT NULL,
  in_quoted_estimated_dropoff_mins integer DEFAULT NULL,
  in_quoted_driver_pickup_distance_km numeric DEFAULT NULL,
  in_quoted_eta_source text DEFAULT NULL,
  in_quoted_eta_last_calculated_at timestamptz DEFAULT NULL,
  in_quoted_routing_provider text DEFAULT NULL,
  in_quoted_routing_preference text DEFAULT NULL,
  in_client_request_id uuid DEFAULT NULL
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
  trip_base_fare_amount bigint,
  quoted_distance_km numeric,
  quoted_estimated_pickup_mins integer,
  quoted_estimated_dropoff_mins integer,
  quoted_driver_pickup_distance_km numeric,
  quoted_eta_source text,
  quoted_eta_last_calculated_at timestamptz,
  quoted_routing_provider text,
  quoted_routing_preference text,
  is_airport_trip boolean,
  airport_pickup_zone_code text,
  airport_pickup_zone_name text,
  airport_dropoff_zone_code text,
  airport_dropoff_zone_name text,
  airport_surcharge_amount bigint,
  airport_access_fee_amount bigint,
  airport_convenience_fee_amount bigint,
  airport_dropoff_fee_amount bigint,
  is_reserved_ride boolean,
  reservation_type text,
  reservation_source text,
  reservation_pickup_ready_at timestamptz,
  reservation_included_wait_minutes integer,
  reservation_fee_amount bigint,
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
  v_billing_settings JSONB;
  v_airport_context JSONB;
  v_is_airport_trip BOOLEAN := false;
  v_is_reserved_ride BOOLEAN := true;
  v_reservation_type TEXT;
  v_reservation_source TEXT;
  v_reservation_pickup_ready_at timestamptz;
  v_reservation_included_wait_minutes INTEGER := 10;
  v_reservation_fee_amount BIGINT := 0;
  v_airport_surcharge_amount BIGINT := 0;
  v_airport_access_fee_amount BIGINT := 0;
  v_airport_convenience_fee_amount BIGINT := 0;
  v_airport_dropoff_fee_amount BIGINT := 0;
  v_dispatch_lead_minutes INTEGER := 15;
  v_trip_base_fare_amount BIGINT := 0;
  v_quoted_price BIGINT := 0;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> in_customer_id THEN
    RAISE EXCEPTION 'You can only schedule rides for your own account.';
  END IF;

  IF in_client_request_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
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
      scheduled_rides.trip_base_fare_amount,
      scheduled_rides.quoted_distance_km,
      scheduled_rides.quoted_estimated_pickup_mins,
      scheduled_rides.quoted_estimated_dropoff_mins,
      scheduled_rides.quoted_driver_pickup_distance_km,
      scheduled_rides.quoted_eta_source,
      scheduled_rides.quoted_eta_last_calculated_at,
      scheduled_rides.quoted_routing_provider,
      scheduled_rides.quoted_routing_preference,
      scheduled_rides.is_airport_trip,
      scheduled_rides.airport_pickup_zone_code,
      scheduled_rides.airport_pickup_zone_name,
      scheduled_rides.airport_dropoff_zone_code,
      scheduled_rides.airport_dropoff_zone_name,
      scheduled_rides.airport_surcharge_amount,
      scheduled_rides.airport_access_fee_amount,
      scheduled_rides.airport_convenience_fee_amount,
      scheduled_rides.airport_dropoff_fee_amount,
      scheduled_rides.is_reserved_ride,
      scheduled_rides.reservation_type,
      scheduled_rides.reservation_source,
      scheduled_rides.reservation_pickup_ready_at,
      scheduled_rides.reservation_included_wait_minutes,
      scheduled_rides.reservation_fee_amount,
      scheduled_rides.spawned_ride_id,
      scheduled_rides.created_at,
      scheduled_rides.updated_at
    FROM public.scheduled_rides
    WHERE scheduled_rides.customer_id = in_customer_id
      AND scheduled_rides.client_request_id = in_client_request_id
    LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
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

  PERFORM public.assert_customer_has_no_unpaid_completed_trip(in_customer_id);
  PERFORM public.assert_customer_has_no_pending_rating_trip(in_customer_id);
  PERFORM public.assert_valid_booking_locations(
    in_pickup_lon,
    in_pickup_lat,
    in_destination_lon,
    in_destination_lat,
    in_pickup_address,
    in_destination_address
  );

  v_billing_settings := public.get_trip_billing_settings();
  v_airport_context := public.get_airport_trip_context(
    in_pickup_lon,
    in_pickup_lat,
    in_destination_lon,
    in_destination_lat,
    in_pickup_address,
    in_destination_address
  );
  v_is_airport_trip := COALESCE((v_airport_context ->> 'is_airport_trip')::BOOLEAN, false);
  v_reservation_type := CASE
    WHEN COALESCE((v_airport_context ->> 'pickup_is_airport')::BOOLEAN, false)
      AND COALESCE((v_airport_context ->> 'reservation_enabled')::BOOLEAN, false)
      THEN 'airport_pickup'
    ELSE 'scheduled_ride'
  END;
  v_reservation_source := CASE
    WHEN v_reservation_type = 'airport_pickup' THEN 'airport_reserve'
    ELSE 'scheduled_ride'
  END;
  v_reservation_pickup_ready_at := in_scheduled_for;
  v_reservation_included_wait_minutes := CASE
    WHEN v_reservation_type = 'airport_pickup'
      THEN COALESCE(
        (v_airport_context ->> 'reservation_included_wait_minutes')::INT,
        (v_billing_settings ->> 'pickup_wait_grace_minutes')::INT,
        10
      )
    ELSE COALESCE((v_billing_settings ->> 'pickup_wait_grace_minutes')::INT, 10)
  END;
  v_reservation_fee_amount := CASE
    WHEN v_reservation_type = 'airport_pickup'
      THEN COALESCE((v_airport_context ->> 'reservation_fee_amount')::BIGINT, 0)
    ELSE 0
  END;
  v_airport_surcharge_amount := CASE
    WHEN COALESCE(in_requested_vehicle::text, '') IN ('bike', 'mini_van', 'van_truck')
      THEN 0
    ELSE COALESCE((v_airport_context ->> 'airport_surcharge_amount')::BIGINT, 0)
  END;
  v_airport_access_fee_amount := COALESCE(
    (v_airport_context ->> 'airport_access_fee_amount')::BIGINT,
    0
  );
  v_airport_convenience_fee_amount := COALESCE(
    (v_airport_context ->> 'airport_convenience_fee_amount')::BIGINT,
    0
  );
  v_airport_dropoff_fee_amount := COALESCE(
    (v_airport_context ->> 'airport_dropoff_fee_amount')::BIGINT,
    0
  );
  v_dispatch_lead_minutes := CASE
    WHEN v_reservation_type = 'airport_pickup'
      THEN GREATEST(
        COALESCE(
          (v_airport_context ->> 'reservation_dispatch_lead_minutes')::INT,
          in_dispatch_lead_minutes,
          45
        ),
        5
      )
    ELSE GREATEST(COALESCE(in_dispatch_lead_minutes, 15), 5)
  END;
  v_quoted_price := GREATEST(
    COALESCE(ROUND(in_quoted_price)::BIGINT, 0)
    + GREATEST(v_reservation_fee_amount, 0),
    0
  );
  v_trip_base_fare_amount := GREATEST(
    COALESCE(ROUND(in_quoted_price)::BIGINT, 0)
    - GREATEST(v_airport_surcharge_amount, 0),
    0
  );

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
    trip_base_fare_amount,
    quoted_distance_km,
    quoted_estimated_pickup_mins,
    quoted_estimated_dropoff_mins,
    quoted_driver_pickup_distance_km,
    quoted_eta_source,
    quoted_eta_last_calculated_at,
    quoted_routing_provider,
    quoted_routing_preference,
    client_request_id,
    is_airport_trip,
    airport_pickup_zone_code,
    airport_pickup_zone_name,
    airport_dropoff_zone_code,
    airport_dropoff_zone_name,
    airport_surcharge_amount,
    airport_access_fee_amount,
    airport_convenience_fee_amount,
    airport_dropoff_fee_amount,
    is_reserved_ride,
    reservation_type,
    reservation_source,
    reservation_pickup_ready_at,
    reservation_included_wait_minutes,
    reservation_fee_amount,
    status
  )
  VALUES (
    in_customer_id,
    in_pickup_address,
    in_destination_address,
    in_pickup_lat,
    in_pickup_lon,
    in_destination_lat,
    in_destination_lon,
    in_requested_vehicle,
    in_service_type_id,
    in_scheduled_for,
    v_dispatch_lead_minutes,
    v_quoted_price,
    v_trip_base_fare_amount,
    in_quoted_distance_km,
    in_quoted_estimated_pickup_mins,
    in_quoted_estimated_dropoff_mins,
    in_quoted_driver_pickup_distance_km,
    in_quoted_eta_source,
    in_quoted_eta_last_calculated_at,
    in_quoted_routing_provider,
    in_quoted_routing_preference,
    in_client_request_id,
    v_is_airport_trip,
    NULLIF(v_airport_context #>> '{pickup_zone,code}', ''),
    NULLIF(v_airport_context #>> '{pickup_zone,name}', ''),
    NULLIF(v_airport_context #>> '{dropoff_zone,code}', ''),
    NULLIF(v_airport_context #>> '{dropoff_zone,name}', ''),
    GREATEST(v_airport_surcharge_amount, 0),
    GREATEST(v_airport_access_fee_amount, 0),
    GREATEST(v_airport_convenience_fee_amount, 0),
    GREATEST(v_airport_dropoff_fee_amount, 0),
    v_is_reserved_ride,
    v_reservation_type,
    v_reservation_source,
    v_reservation_pickup_ready_at,
    v_reservation_included_wait_minutes,
    GREATEST(v_reservation_fee_amount, 0),
    'scheduled'
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
    scheduled_rides.trip_base_fare_amount,
    scheduled_rides.quoted_distance_km,
    scheduled_rides.quoted_estimated_pickup_mins,
    scheduled_rides.quoted_estimated_dropoff_mins,
    scheduled_rides.quoted_driver_pickup_distance_km,
    scheduled_rides.quoted_eta_source,
    scheduled_rides.quoted_eta_last_calculated_at,
    scheduled_rides.quoted_routing_provider,
    scheduled_rides.quoted_routing_preference,
    scheduled_rides.is_airport_trip,
    scheduled_rides.airport_pickup_zone_code,
    scheduled_rides.airport_pickup_zone_name,
    scheduled_rides.airport_dropoff_zone_code,
    scheduled_rides.airport_dropoff_zone_name,
    scheduled_rides.airport_surcharge_amount,
    scheduled_rides.airport_access_fee_amount,
    scheduled_rides.airport_convenience_fee_amount,
    scheduled_rides.airport_dropoff_fee_amount,
    scheduled_rides.is_reserved_ride,
    scheduled_rides.reservation_type,
    scheduled_rides.reservation_source,
    scheduled_rides.reservation_pickup_ready_at,
    scheduled_rides.reservation_included_wait_minutes,
    scheduled_rides.reservation_fee_amount,
    scheduled_rides.spawned_ride_id,
    scheduled_rides.created_at,
    scheduled_rides.updated_at;
END;
$$;

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
  numeric,
  integer,
  integer,
  numeric,
  text,
  timestamptz,
  text,
  text,
  uuid
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.finalize_ride_billing(
  p_ride_id UUID
)
RETURNS TABLE (
  ride_id UUID,
  quoted_price_amount BIGINT,
  final_price_amount BIGINT,
  actual_trip_seconds INTEGER,
  pickup_wait_seconds INTEGER,
  billable_waiting_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride RECORD;
  v_settings JSONB;
  v_pickup_wait_grace_minutes INTEGER := 10;
  v_delivery_wait_charge_grace_minutes INTEGER := 10;
  v_wait_fee_interval_minutes INTEGER := 5;
  v_wait_fee_amount BIGINT := 10;
  v_quoted_price BIGINT := 0;
  v_actual_trip_seconds INTEGER := 0;
  v_pickup_wait_seconds INTEGER := 0;
  v_dropoff_wait_seconds INTEGER := 0;
  v_billable_waiting_seconds INTEGER := 0;
  v_final_price BIGINT := 0;
  v_wait_charge_amount BIGINT := 0;
  v_pickup_billable_wait_seconds INTEGER := 0;
  v_dropoff_billable_wait_seconds INTEGER := 0;
  v_wait_fee_block_count INTEGER := 0;
  v_pickup_wait_reference_at timestamptz;
  v_pickup_charge_grace_minutes INTEGER := 10;
BEGIN
  SELECT *
  INTO v_ride
  FROM public.rides
  WHERE id = p_ride_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ride % not found for billing finalization', p_ride_id;
  END IF;

  v_settings := public.get_trip_billing_settings();
  v_pickup_wait_grace_minutes := COALESCE(
    (v_settings ->> 'pickup_wait_grace_minutes')::INT,
    10
  );
  v_delivery_wait_charge_grace_minutes := COALESCE(
    (v_settings ->> 'delivery_wait_charge_grace_minutes')::INT,
    10
  );
  v_wait_fee_interval_minutes := COALESCE(
    (v_settings ->> 'wait_fee_interval_minutes')::INT,
    5
  );
  v_wait_fee_amount := COALESCE(
    (v_settings ->> 'wait_fee_amount')::BIGINT,
    10
  );

  v_quoted_price := GREATEST(
    COALESCE(v_ride.quoted_price_amount, v_ride.price, 0),
    0
  );

  IF v_ride.started_at IS NOT NULL AND v_ride.completed_at IS NOT NULL THEN
    v_actual_trip_seconds := GREATEST(
      EXTRACT(EPOCH FROM (v_ride.completed_at - v_ride.started_at))::INT,
      0
    );
  END IF;

  v_pickup_wait_reference_at := CASE
    WHEN COALESCE(v_ride.is_reserved_ride, false)
      AND v_ride.reservation_pickup_ready_at IS NOT NULL
      AND v_ride.arrived_at IS NOT NULL
      AND v_ride.reservation_pickup_ready_at > v_ride.arrived_at
      THEN v_ride.reservation_pickup_ready_at
    ELSE v_ride.arrived_at
  END;

  IF v_pickup_wait_reference_at IS NOT NULL
     AND v_ride.started_at IS NOT NULL
     AND v_ride.started_at > v_pickup_wait_reference_at THEN
    v_pickup_wait_seconds := GREATEST(
      EXTRACT(EPOCH FROM (v_ride.started_at - v_pickup_wait_reference_at))::INT,
      0
    );
  END IF;

  IF v_ride.dropoff_arrived_at IS NOT NULL
     AND v_ride.completed_at IS NOT NULL
     AND v_ride.completed_at > v_ride.dropoff_arrived_at THEN
    v_dropoff_wait_seconds := GREATEST(
      EXTRACT(EPOCH FROM (v_ride.completed_at - v_ride.dropoff_arrived_at))::INT,
      0
    );
  END IF;

  IF COALESCE(v_ride.is_delivery, false) THEN
    v_pickup_billable_wait_seconds := GREATEST(
      v_pickup_wait_seconds -
        (GREATEST(v_delivery_wait_charge_grace_minutes, 0) * 60),
      0
    );
    v_dropoff_billable_wait_seconds := GREATEST(
      v_dropoff_wait_seconds -
        (GREATEST(v_delivery_wait_charge_grace_minutes, 0) * 60),
      0
    );
    v_billable_waiting_seconds :=
      v_pickup_billable_wait_seconds + v_dropoff_billable_wait_seconds;
  ELSE
    v_pickup_charge_grace_minutes := CASE
      WHEN COALESCE(v_ride.is_reserved_ride, false)
        THEN GREATEST(
          COALESCE(v_ride.reservation_included_wait_minutes, v_pickup_wait_grace_minutes),
          0
        )
      ELSE GREATEST(v_pickup_wait_grace_minutes, 0)
    END;

    v_billable_waiting_seconds := GREATEST(
      v_pickup_wait_seconds - (v_pickup_charge_grace_minutes * 60),
      0
    );
  END IF;

  IF
    v_billable_waiting_seconds > 0
    AND GREATEST(v_wait_fee_interval_minutes, 0) > 0
    AND GREATEST(v_wait_fee_amount, 0) > 0
  THEN
    v_wait_fee_block_count := CEIL(
      v_billable_waiting_seconds
      / (GREATEST(v_wait_fee_interval_minutes, 1) * 60.0)
    )::INT;
    v_wait_charge_amount :=
      GREATEST(v_wait_fee_block_count, 0) * GREATEST(v_wait_fee_amount, 0);
  END IF;

  v_final_price := GREATEST(v_quoted_price + v_wait_charge_amount, 0);

  UPDATE public.rides AS r
  SET
    quoted_price_amount = COALESCE(r.quoted_price_amount, v_quoted_price),
    trip_base_fare_amount = COALESCE(
      r.trip_base_fare_amount,
      GREATEST(
        v_quoted_price
        - COALESCE(r.airport_surcharge_amount, 0)
        - COALESCE(r.reservation_fee_amount, 0),
        0
      )
    ),
    quoted_estimated_pickup_mins = COALESCE(
      r.quoted_estimated_pickup_mins,
      r.estimated_pickup_mins
    ),
    quoted_estimated_dropoff_mins = COALESCE(
      r.quoted_estimated_dropoff_mins,
      r.estimated_dropoff_mins
    ),
    price = v_final_price,
    actual_trip_seconds = v_actual_trip_seconds,
    pickup_wait_seconds = v_pickup_wait_seconds,
    billable_waiting_seconds = v_billable_waiting_seconds,
    dropoff_wait_seconds = v_dropoff_wait_seconds,
    delivery_wait_charge_amount = v_wait_charge_amount,
    finalized_price_at = CASE
      WHEN r.status = 'completed'::public.ride_status THEN now()
      ELSE r.finalized_price_at
    END,
    updated_at = now()
  WHERE r.id = p_ride_id;

  RETURN QUERY
  SELECT
    p_ride_id,
    v_quoted_price,
    v_final_price,
    v_actual_trip_seconds,
    v_pickup_wait_seconds,
    v_billable_waiting_seconds;
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
    NEW.airport_access_fee_amount := CASE
      WHEN COALESCE(NEW.is_delivery, false) THEN 0
      ELSE COALESCE(
        NULLIF(NEW.airport_access_fee_amount, 0),
        (v_airport_context ->> 'airport_access_fee_amount')::BIGINT,
        0
      )
    END;
    NEW.airport_convenience_fee_amount := CASE
      WHEN COALESCE(NEW.is_delivery, false) THEN 0
      ELSE COALESCE(
        NULLIF(NEW.airport_convenience_fee_amount, 0),
        (v_airport_context ->> 'airport_convenience_fee_amount')::BIGINT,
        0
      )
    END;
    NEW.airport_dropoff_fee_amount := CASE
      WHEN COALESCE(NEW.is_delivery, false) THEN 0
      ELSE COALESCE(
        NULLIF(NEW.airport_dropoff_fee_amount, 0),
        (v_airport_context ->> 'airport_dropoff_fee_amount')::BIGINT,
        0
      )
    END;
    NEW.airport_surcharge_amount := CASE
      WHEN COALESCE(NEW.is_delivery, false) THEN 0
      WHEN COALESCE(NEW.airport_surcharge_amount, 0) > 0
        THEN GREATEST(NEW.airport_surcharge_amount, 0)
      ELSE GREATEST(v_airport_surcharge_amount, 0)
    END;

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

    NEW.trip_base_fare_amount := COALESCE(
      NEW.trip_base_fare_amount,
      GREATEST(
        ROUND(COALESCE(NEW.price, 0))::BIGINT
        - GREATEST(COALESCE(NEW.airport_surcharge_amount, 0), 0)
        - GREATEST(COALESCE(NEW.reservation_fee_amount, 0), 0),
        0
      )
    );
    NEW.quoted_price_amount := COALESCE(
      NEW.quoted_price_amount,
      ROUND(COALESCE(NEW.price, 0))::BIGINT
    );
    NEW.reservation_fee_amount := GREATEST(COALESCE(NEW.reservation_fee_amount, 0), 0);
    NEW.reservation_source := NULLIF(BTRIM(COALESCE(NEW.reservation_source, '')), '');
    NEW.reservation_type := NULLIF(BTRIM(COALESCE(NEW.reservation_type, '')), '');

    IF COALESCE(NEW.is_reserved_ride, false)
       AND NEW.reservation_pickup_ready_at IS NULL THEN
      NEW.reservation_pickup_ready_at := now();
    END IF;

    NEW.eta_last_calculated_at := COALESCE(NEW.eta_last_calculated_at, now());
    NEW.status := COALESCE(NEW.status, 'pending');
  END IF;

  RETURN NEW;
END;
$$;

WITH airport_context AS (
  SELECT
    sr.id,
    public.get_airport_trip_context(
      sr.pickup_lon,
      sr.pickup_lat,
      sr.destination_lon,
      sr.destination_lat,
      sr.pickup_address,
      sr.destination_address
    ) AS context
  FROM public.scheduled_rides sr
)
UPDATE public.scheduled_rides AS sr
SET
  is_airport_trip = COALESCE((airport_context.context ->> 'is_airport_trip')::BOOLEAN, false),
  airport_pickup_zone_code = NULLIF(airport_context.context #>> '{pickup_zone,code}', ''),
  airport_pickup_zone_name = NULLIF(airport_context.context #>> '{pickup_zone,name}', ''),
  airport_dropoff_zone_code = NULLIF(airport_context.context #>> '{dropoff_zone,code}', ''),
  airport_dropoff_zone_name = NULLIF(airport_context.context #>> '{dropoff_zone,name}', ''),
  airport_access_fee_amount = COALESCE(
    (airport_context.context ->> 'airport_access_fee_amount')::BIGINT,
    0
  ),
  airport_convenience_fee_amount = COALESCE(
    (airport_context.context ->> 'airport_convenience_fee_amount')::BIGINT,
    0
  ),
  airport_dropoff_fee_amount = COALESCE(
    (airport_context.context ->> 'airport_dropoff_fee_amount')::BIGINT,
    0
  ),
  airport_surcharge_amount = COALESCE(
    (airport_context.context ->> 'airport_surcharge_amount')::BIGINT,
    0
  ),
  is_reserved_ride = true,
  reservation_type = COALESCE(
    reservation_type,
    CASE
      WHEN COALESCE((airport_context.context ->> 'pickup_is_airport')::BOOLEAN, false)
        AND COALESCE((airport_context.context ->> 'reservation_enabled')::BOOLEAN, false)
        THEN 'airport_pickup'
      ELSE 'scheduled_ride'
    END
  ),
  reservation_source = COALESCE(reservation_source, 'scheduled_ride'),
  reservation_pickup_ready_at = COALESCE(reservation_pickup_ready_at, scheduled_for),
  reservation_included_wait_minutes = COALESCE(
    reservation_included_wait_minutes,
    CASE
      WHEN COALESCE((airport_context.context ->> 'pickup_is_airport')::BOOLEAN, false)
        AND COALESCE((airport_context.context ->> 'reservation_enabled')::BOOLEAN, false)
        THEN COALESCE((airport_context.context ->> 'reservation_included_wait_minutes')::INT, 30)
      ELSE COALESCE((public.get_trip_billing_settings() ->> 'pickup_wait_grace_minutes')::INT, 10)
    END
  ),
  reservation_fee_amount = COALESCE(
    reservation_fee_amount,
    CASE
      WHEN COALESCE((airport_context.context ->> 'pickup_is_airport')::BOOLEAN, false)
        AND COALESCE((airport_context.context ->> 'reservation_enabled')::BOOLEAN, false)
        THEN COALESCE((airport_context.context ->> 'reservation_fee_amount')::BIGINT, 0)
      ELSE 0
    END
  ),
  trip_base_fare_amount = COALESCE(
    trip_base_fare_amount,
    GREATEST(
      COALESCE(ROUND(quoted_price)::BIGINT, 0)
      - COALESCE((airport_context.context ->> 'airport_surcharge_amount')::BIGINT, 0)
      - COALESCE(
        CASE
          WHEN COALESCE((airport_context.context ->> 'pickup_is_airport')::BOOLEAN, false)
            AND COALESCE((airport_context.context ->> 'reservation_enabled')::BOOLEAN, false)
            THEN (airport_context.context ->> 'reservation_fee_amount')::BIGINT
          ELSE 0
        END,
        0
      ),
      0
    )
  )
FROM airport_context
WHERE airport_context.id = sr.id;
