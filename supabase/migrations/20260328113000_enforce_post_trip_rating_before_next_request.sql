CREATE OR REPLACE FUNCTION public.assert_customer_has_no_pending_rating_trip(
  p_customer_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_rating_ride_id uuid;
BEGIN
  SELECT r.id
  INTO v_pending_rating_ride_id
  FROM public.rides r
  WHERE r.customer_id = p_customer_id
    AND r.status = 'completed'
    AND COALESCE(r.payment_status, 'pending') = 'paid'
    AND NOT EXISTS (
      SELECT 1
      FROM public.reviews rv
      WHERE rv.ride_id = r.id
        AND rv.reviewer_id = p_customer_id
    )
  ORDER BY COALESCE(r.completed_at, r.created_at) DESC
  LIMIT 1;

  IF v_pending_rating_ride_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Please rate your last trip before booking another ride or delivery.'
      USING ERRCODE = 'P0001',
            DETAIL = 'ride_id=' || v_pending_rating_ride_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_customer_has_no_pending_rating_trip(uuid)
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

CREATE OR REPLACE FUNCTION public.accept_ride(
  p_ride_id uuid,
  p_driver_id uuid
)
RETURNS TABLE(
  ride_id uuid,
  status text,
  driver_id uuid,
  success boolean,
  message text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_id uuid;
  v_pending_rating_ride_id uuid;
BEGIN
  IF p_ride_id IS NULL OR p_driver_id IS NULL THEN
    RETURN QUERY
    SELECT NULL::uuid, NULL::text, NULL::uuid, FALSE, 'ride_id and driver_id must be provided'::text;
    RETURN;
  END IF;

  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR v_caller_id <> p_driver_id THEN
    RETURN QUERY
    SELECT NULL::uuid, NULL::text, NULL::uuid, FALSE, 'forbidden: caller must be the driver'::text;
    RETURN;
  END IF;

  SELECT r.id
  INTO v_pending_rating_ride_id
  FROM public.rides r
  WHERE r.driver_id = p_driver_id
    AND r.status = 'completed'
    AND COALESCE(r.payment_status, 'pending') = 'paid'
    AND NOT EXISTS (
      SELECT 1
      FROM public.reviews rv
      WHERE rv.ride_id = r.id
        AND rv.reviewer_id = p_driver_id
    )
  ORDER BY COALESCE(r.completed_at, r.created_at) DESC
  LIMIT 1;

  IF v_pending_rating_ride_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      v_pending_rating_ride_id,
      'completed'::text,
      p_driver_id,
      FALSE,
      'Please rate your last completed trip before accepting another request.'::text;
    RETURN;
  END IF;

  UPDATE public.rides r
  SET
    status = 'accepted',
    driver_id = p_driver_id,
    updated_at = now()
  WHERE r.id = p_ride_id
    AND r.status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.ride_offers ro
      WHERE ro.ride_id = p_ride_id
        AND ro.driver_id = p_driver_id
        AND ro.status = 'offered'
        AND (ro.expires_at IS NULL OR ro.expires_at > now())
    );

  IF FOUND THEN
    UPDATE public.ride_offers ro
    SET
      status = CASE WHEN ro.driver_id = p_driver_id THEN 'accepted' ELSE 'unavailable' END,
      updated_at = now()
    WHERE ro.ride_id = p_ride_id;

    RETURN QUERY
    SELECT r.id, r.status::text, r.driver_id, TRUE, 'Ride accepted successfully'::text
    FROM public.rides r
    WHERE r.id = p_ride_id;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.rides r WHERE r.id = p_ride_id) THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::uuid, FALSE, 'ride not found'::text;
  ELSIF EXISTS (
    SELECT 1
    FROM public.rides r
    WHERE r.id = p_ride_id
      AND r.status <> 'pending'
  ) THEN
    RETURN QUERY
    SELECT r.id, r.status::text, r.driver_id, FALSE, 'ride already taken or cancelled'::text
    FROM public.rides r
    WHERE r.id = p_ride_id;
  ELSE
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::uuid, FALSE, 'offer expired or invalid'::text;
  END IF;
END;
$$;

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
    AND NOT EXISTS (
      SELECT 1
      FROM public.rides r
      WHERE r.driver_id = p.id
        AND r.status = 'completed'
        AND COALESCE(r.payment_status, 'pending') = 'paid'
        AND NOT EXISTS (
          SELECT 1
          FROM public.reviews rv
          WHERE rv.ride_id = r.id
            AND rv.reviewer_id = p.id
        )
    )
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
