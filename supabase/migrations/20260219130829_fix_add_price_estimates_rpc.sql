-- 1. Ensure the sort_order column exists
ALTER TABLE public.service_types 
ADD COLUMN
IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 2. Update the function with the Type Cast fix (::NUMERIC)
CREATE OR REPLACE FUNCTION public.get_ride_estimates
(
  pickup_lat FLOAT, 
  pickup_lng FLOAT, 
  dest_lat FLOAT, 
  dest_lng FLOAT
)
RETURNS TABLE
(
  service_id UUID,
  category public.vehicle_category,
  display_name TEXT,
  estimated_price NUMERIC, -- The expected type
  distance_km FLOAT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_distance_km FLOAT;
BEGIN
    -- Calculate distance in KM using PostGIS
    v_distance_km := ST_Distance
(
      st_setsrid
(st_makepoint
(pickup_lng, pickup_lat), 4326)::geography,
      st_setsrid
(st_makepoint
(dest_lng, dest_lat), 4326)::geography
    ) / 1000.0;

RETURN QUERY
SELECT
    st.id as service_id,
      st.name as category,
      st.label as display_name, 
      -- THE FIX: Cast the result to ::NUMERIC to match the RETURN TABLE definition
      (ROUND(GREATEST(s.base_fare + (v_distance_km * s.per_km_rate), s.min_fare) / 100.0) * 100)::NUMERIC as estimated_price,
    v_distance_km::FLOAT as distance_km
FROM
    public.service_types st
    JOIN
    public.services s ON st.name = s.category
WHERE 
      st.is_active = true
ORDER BY st.sort_order ASC;
END;
$$;
