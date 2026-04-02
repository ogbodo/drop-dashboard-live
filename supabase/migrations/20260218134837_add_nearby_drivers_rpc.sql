CREATE OR REPLACE FUNCTION public.get_nearby_drivers
(
  user_lat FLOAT, 
  user_lng FLOAT, 
  radius_meters FLOAT,
  vehicle_type TEXT DEFAULT NULL
)
RETURNS TABLE
(
  driver_id UUID,
  full_name TEXT,
  lat FLOAT,
  lng FLOAT,
  category TEXT,
  distance FLOAT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as driver_id,
    p.full_name,
    st_y(dl.current_location::geometry) as lat,
    st_x(dl.current_location::geometry) as lng,
    v.category::text,
    st_distance(
          dl.current_location,
          st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography
        ) as distance
  FROM
    public.driver_locations dl
    JOIN public.profiles p ON dl.driver_id = p.id
    JOIN public.vehicles v ON p.id = v.driver_id
  WHERE 
        p.is_online = true
    AND p.is_verified = true
    AND p.has_paid = true -- <--- THE REVENUE GATE: No pay, no show!
    AND (vehicle_type IS NULL OR v.category::text = vehicle_type)
    AND st_dwithin(
          dl.current_location,
          st_setsrid(st_makepoint(user_lng, user_lat), 4326)
  ::geography,
          radius_meters
        )
    ORDER BY distance ASC;
END;
$$;
