-- 1. Table structure cleanup
ALTER TABLE public.service_types 
ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 4,
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS vehicle_category public.vehicle_category;

-- 2. Data Sync
DELETE FROM public.service_types WHERE name = 'shuttle';

INSERT INTO public.service_types (name, label, description, capacity, sort_order) VALUES
('car', 'Drop XL', 'Safe and affordable everyday rides', 4, 1),
('drop_plus', 'Drop Plus', 'Premium vehicles like BMW X6 or M7 series', 4, 2),
('drop_family', 'Drop Family', 'Large vehicles for groups and families', 6, 3),
('bus', 'Drop Bus', 'Airport transfers and group pickups', 10, 4),
('bike', 'Drop Delivery Bike', 'Fast urban transit for one passenger', 1, 5),
('mini_van', 'Drop Delivery Mini Van', 'Small cargo and quick deliveries', 2, 6),
('van_truck', 'Drop Delivery Van/Truck', 'Cargo and heavy-duty delivery services', 2, 7)
ON CONFLICT (name) DO UPDATE SET 
  label = EXCLUDED.label, 
  description = EXCLUDED.description,
  capacity = EXCLUDED.capacity,
  sort_order = EXCLUDED.sort_order;

-- 3. Automation & Sync
UPDATE public.profiles p
SET 
  vehicle_category = v.category,
  driver_type = (CASE 
    WHEN v.category IN ('bike', 'mini_van', 'van_truck') THEN 'delivery'::driver_service_type
    ELSE 'rides'::driver_service_type
  END)
FROM public.vehicles v
WHERE p.id = v.driver_id;

CREATE OR REPLACE FUNCTION public.sync_driver_fleet_info()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.profiles
    SET 
      vehicle_category = NEW.category,
      driver_type = (CASE 
        WHEN NEW.category IN ('bike', 'mini_van', 'van_truck') THEN 'delivery'::driver_service_type
        ELSE 'rides'::driver_service_type
      END)
    WHERE id = NEW.driver_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_sync_driver_fleet ON public.vehicles;
CREATE TRIGGER tr_sync_driver_fleet
AFTER INSERT OR UPDATE OF category ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.sync_driver_fleet_info();

-- 4. Function Update
DROP FUNCTION IF EXISTS public.get_ride_estimates(double precision, double precision, double precision, double precision);

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
  capacity INTEGER,       
  service_type TEXT, 
  estimated_price NUMERIC,
  distance_km FLOAT,
  estimated_pickup_mins INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_distance_km FLOAT;
    v_pickup_geog extensions.geography;
BEGIN
    v_pickup_geog := st_setsrid(st_makepoint(pickup_lng, pickup_lat), 4326)::geography;
    v_distance_km := ST_Distance(v_pickup_geog, st_setsrid(st_makepoint(dest_lng, dest_lat), 4326)::geography) / 1000.0;

    RETURN QUERY
    SELECT 
      st.id, st.name, st.label, st.description, st.capacity,
      CASE 
        WHEN st.name IN ('bike', 'mini_van', 'van_truck') THEN 'delivery'
        ELSE 'rides'
      END as service_type,
      (ROUND(GREATEST(s.base_fare + (v_distance_km * s.per_km_rate), s.min_fare) / 100.0) * 100)::NUMERIC,
      v_distance_km::FLOAT,
      COALESCE((
        SELECT CEIL((ST_Distance(dl.current_location, v_pickup_geog) / 333.0) + 2)::INTEGER
        FROM public.driver_locations dl
        JOIN public.profiles p ON dl.driver_id = p.id
        JOIN public.vehicles v ON p.id = v.driver_id
        WHERE p.is_online = true AND p.is_verified = true AND v.category = st.name
        ORDER BY dl.current_location <-> v_pickup_geog LIMIT 1
      ), 8)
    FROM public.service_types st
    JOIN public.services s ON st.name = s.category
    WHERE st.is_active = true
    ORDER BY st.sort_order ASC;
END;
$$;
