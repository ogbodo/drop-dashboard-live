ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS route_distance_km numeric(10, 2),
  ADD COLUMN IF NOT EXISTS driver_pickup_distance_km numeric(10, 2),
  ADD COLUMN IF NOT EXISTS eta_source text,
  ADD COLUMN IF NOT EXISTS eta_last_calculated_at timestamptz,
  ADD COLUMN IF NOT EXISTS routing_provider text,
  ADD COLUMN IF NOT EXISTS routing_preference text;

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
  in_routing_preference text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  customer_id uuid,
  driver_id uuid,
  pickup_code text,
  dropoff_code text,
  price numeric,
  status text,
  is_delivery boolean,
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
    distance_km,
    estimated_pickup_mins,
    estimated_dropoff_mins,
    eta_source,
    eta_last_calculated_at,
    route_distance_km,
    driver_pickup_distance_km,
    routing_provider,
    routing_preference,
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
    in_distance_km,
    in_estimated_pickup_mins,
    in_estimated_dropoff_mins,
    in_eta_source,
    in_eta_last_calculated_at,
    in_route_distance_km,
    in_driver_pickup_distance_km,
    in_routing_provider,
    in_routing_preference,
    'pending'
  )
  RETURNING
    rides.id,
    rides.customer_id,
    rides.driver_id,
    rides.pickup_code,
    rides.dropoff_code,
    rides.price::numeric,
    rides.status::text,
    rides.is_delivery,
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
  text
) TO authenticated;
