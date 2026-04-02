CREATE OR REPLACE FUNCTION public.assert_valid_booking_locations(
  in_pickup_lon double precision,
  in_pickup_lat double precision,
  in_destination_lon double precision,
  in_destination_lat double precision,
  in_pickup_address text,
  in_destination_address text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NULLIF(BTRIM(COALESCE(in_pickup_address, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Pickup address is required.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NULLIF(BTRIM(COALESCE(in_destination_address, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Destination address is required.'
      USING ERRCODE = 'P0001';
  END IF;

  IF in_pickup_lat IS NULL OR in_pickup_lon IS NULL THEN
    RAISE EXCEPTION 'Pickup coordinates are required.'
      USING ERRCODE = 'P0001';
  END IF;

  IF in_destination_lat IS NULL OR in_destination_lon IS NULL THEN
    RAISE EXCEPTION 'Destination coordinates are required.'
      USING ERRCODE = 'P0001';
  END IF;

  IF in_pickup_lat < -90 OR in_pickup_lat > 90 THEN
    RAISE EXCEPTION 'Pickup latitude is invalid.'
      USING ERRCODE = 'P0001';
  END IF;

  IF in_destination_lat < -90 OR in_destination_lat > 90 THEN
    RAISE EXCEPTION 'Destination latitude is invalid.'
      USING ERRCODE = 'P0001';
  END IF;

  IF in_pickup_lon < -180 OR in_pickup_lon > 180 THEN
    RAISE EXCEPTION 'Pickup longitude is invalid.'
      USING ERRCODE = 'P0001';
  END IF;

  IF in_destination_lon < -180 OR in_destination_lon > 180 THEN
    RAISE EXCEPTION 'Destination longitude is invalid.'
      USING ERRCODE = 'P0001';
  END IF;

  IF ABS(in_pickup_lat) < 0.000001 AND ABS(in_pickup_lon) < 0.000001 THEN
    RAISE EXCEPTION 'Pickup coordinates must be a real map location.'
      USING ERRCODE = 'P0001';
  END IF;

  IF ABS(in_destination_lat) < 0.000001 AND ABS(in_destination_lon) < 0.000001 THEN
    RAISE EXCEPTION 'Destination coordinates must be a real map location.'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_valid_booking_locations(
  double precision,
  double precision,
  double precision,
  double precision,
  text,
  text
)
TO authenticated, service_role;

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
  in_client_request_id uuid DEFAULT NULL
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
  IF in_client_request_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
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
    in_client_request_id,
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
  quoted_distance_km numeric,
  quoted_estimated_pickup_mins integer,
  quoted_estimated_dropoff_mins integer,
  quoted_driver_pickup_distance_km numeric,
  quoted_eta_source text,
  quoted_eta_last_calculated_at timestamptz,
  quoted_routing_provider text,
  quoted_routing_preference text,
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
      scheduled_rides.quoted_distance_km,
      scheduled_rides.quoted_estimated_pickup_mins,
      scheduled_rides.quoted_estimated_dropoff_mins,
      scheduled_rides.quoted_driver_pickup_distance_km,
      scheduled_rides.quoted_eta_source,
      scheduled_rides.quoted_eta_last_calculated_at,
      scheduled_rides.quoted_routing_provider,
      scheduled_rides.quoted_routing_preference,
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
  PERFORM public.assert_valid_booking_locations(
    in_pickup_lon,
    in_pickup_lat,
    in_destination_lon,
    in_destination_lat,
    in_pickup_address,
    in_destination_address
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
    quoted_distance_km,
    quoted_estimated_pickup_mins,
    quoted_estimated_dropoff_mins,
    quoted_driver_pickup_distance_km,
    quoted_eta_source,
    quoted_eta_last_calculated_at,
    quoted_routing_provider,
    quoted_routing_preference,
    client_request_id,
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
    COALESCE(in_dispatch_lead_minutes, 15),
    in_quoted_price,
    in_quoted_distance_km,
    in_quoted_estimated_pickup_mins,
    in_quoted_estimated_dropoff_mins,
    in_quoted_driver_pickup_distance_km,
    in_quoted_eta_source,
    in_quoted_eta_last_calculated_at,
    in_quoted_routing_provider,
    in_quoted_routing_preference,
    in_client_request_id,
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
    scheduled_rides.quoted_distance_km,
    scheduled_rides.quoted_estimated_pickup_mins,
    scheduled_rides.quoted_estimated_dropoff_mins,
    scheduled_rides.quoted_driver_pickup_distance_km,
    scheduled_rides.quoted_eta_source,
    scheduled_rides.quoted_eta_last_calculated_at,
    scheduled_rides.quoted_routing_provider,
    scheduled_rides.quoted_routing_preference,
    scheduled_rides.spawned_ride_id,
    scheduled_rides.created_at,
    scheduled_rides.updated_at;
END;
$$;
