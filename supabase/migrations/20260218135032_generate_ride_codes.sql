-- 1. Add new snake_case values to the Enum
-- Note: 'car', 'bike', 'van_truck' already exist from master
ALTER TYPE public.vehicle_category ADD VALUE IF NOT EXISTS 'drop_plus';
ALTER TYPE public.vehicle_category ADD VALUE IF NOT EXISTS 'drop_family';
ALTER TYPE public.vehicle_category ADD VALUE IF NOT EXISTS 'shuttle';

-- 2. Add preference column to Rides
ALTER TABLE public.rides 
ADD COLUMN IF NOT EXISTS requested_vehicle_type public.vehicle_category DEFAULT 'car';

-- 3. The Auto-Code Trigger (Security)
CREATE OR REPLACE FUNCTION public.generate_ride_codes()
RETURNS TRIGGER AS $$
BEGIN
  NEW.pickup_code := floor(random() * 9000 + 1000)::text;
  NEW.dropoff_code := floor(random() * 9000 + 1000)::text;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_generate_ride_codes ON public.rides;
CREATE TRIGGER tr_generate_ride_codes
  BEFORE INSERT ON public.rides
  FOR EACH ROW EXECUTE PROCEDURE public.generate_ride_codes();
