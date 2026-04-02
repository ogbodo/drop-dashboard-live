-- 1. Ensure the sort_order column exists for the UI sequence
ALTER TABLE public.service_types 
ADD COLUMN
IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 2. Set the official Drop sorting (Bikes first, then Luxury)
UPDATE public.service_types SET sort_order = 1 WHERE name = 'bike';
UPDATE public.service_types SET sort_order = 2 WHERE name = 'car';
UPDATE public.service_types SET sort_order = 3 WHERE name = 'drop_plus';
UPDATE public.service_types SET sort_order = 4 WHERE name = 'drop_family';
UPDATE public.service_types SET sort_order = 5 WHERE name = 'shuttle';
UPDATE public.service_types SET sort_order = 6 WHERE name = 'van_truck';

-- 3. Create the Price Estimate Function (The "Price Picker" Engine)
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
  estimated_price NUMERIC,
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
    -- Math: Base + (Dist * Rate), rounded to nearest ₦100
    ROUND(GREATEST(s.base_fare + (v_distance_km * s.per_km_rate), s.min_fare) / 100.0) * 100 as estimated_price,
    v_distance_km as distance_km
FROM
    public.service_types st
    JOIN
    public.services s ON st.name = s.category
WHERE 
      st.is_active = true
ORDER BY st.sort_order ASC;
END;
$$;
