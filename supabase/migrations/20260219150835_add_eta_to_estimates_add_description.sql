-- 1. Drop the old version to avoid "signature mismatch" errors
DROP FUNCTION IF EXISTS public.get_ride_estimates(double precision, double precision, double precision, double precision);

-- 2. Create the "Smart" version with ETA for all categories
CREATE OR REPLACE FUNCTION public.get_ride_estimates(
  pickup_lat FLOAT, 
  pickup_lng FLOAT, 
  dest_lat FLOAT, 
  dest_lng FLOAT
)
RETURNS TABLE (
  service_id UUID,
  category public.vehicle_category,
  display_name TEXT,
  description TEXT,
  estimated_price NUMERIC, -- Fixed: Matches numeric cast below
  distance_km FLOAT,
  estimated_pickup_mins INTEGER -- NEW: Minutes to arrival
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_distance_km FLOAT;
    v_pickup_geog extensions.geography;
BEGIN
    -- Create geography point for the customer's pickup
    v_pickup_geog := st_setsrid(st_makepoint(pickup_lng, pickup_lat), 4326)::geography;

    -- Calculate trip distance in KM
    v_distance_km := ST_Distance(
      v_pickup_geog,
      st_setsrid(st_makepoint(dest_lng, dest_lat), 4326)::geography
    ) / 1000.0;

    RETURN QUERY
    SELECT 
      st.id as service_id,
      st.name as category,
      st.label as display_name,
       st.description, 
      -- The ₦100 Rounding + Type Cast Fix
      (ROUND(GREATEST(s.base_fare + (v_distance_km * s.per_km_rate), s.min_fare) / 100.0) * 100)::NUMERIC as estimated_price,
      v_distance_km::FLOAT as distance_km,
      -- THE LIVE ETA LOGIC:
      -- Scans for the closest online/verified driver specifically for THIS category
      -- Uses 20km/h average speed + 2 min 'Nigeria Traffic' buffer
      COALESCE(
        (SELECT 
          CEIL((ST_Distance(dl.current_location, v_pickup_geog) / 333.0) + 2)::INTEGER
         FROM public.driver_locations dl
         JOIN public.profiles p ON dl.driver_id = p.id
         JOIN public.vehicles v ON p.id = v.driver_id
         WHERE p.is_online = true 
           AND p.is_verified = true 
           AND v.category = st.name
         ORDER BY dl.current_location <-> v_pickup_geog
         LIMIT 1
        ), 8) as estimated_pickup_mins -- Default to 8 mins if no driver found
    FROM 
      public.service_types st
    JOIN 
      public.services s ON st.name = s.category
    WHERE 
      st.is_active = true
    ORDER BY st.sort_order ASC;
END;
$$;
