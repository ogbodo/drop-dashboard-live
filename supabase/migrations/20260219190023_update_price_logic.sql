-- 1. Sync the Services Table (Pricing Source)
-- We removed the 'description' column as per your manual dashboard change
DELETE FROM public.services WHERE category = 'shuttle';

INSERT INTO public.services (category, base_fare, per_km_rate, min_fare) VALUES
('car', 500.00, 250.00, 1000.00),
('drop_plus', 1000.00, 450.00, 2500.00),
('drop_family', 800.00, 350.00, 2000.00),
('bus', 2000.00, 600.00, 4500.00),
('bike', 200.00, 100.00, 400.00),
('mini_van', 1200.00, 400.00, 3000.00),
('van_truck', 2500.00, 800.00, 6000.00)
ON CONFLICT (category) DO UPDATE SET 
  base_fare = EXCLUDED.base_fare, 
  per_km_rate = EXCLUDED.per_km_rate,
  min_fare = EXCLUDED.min_fare;

-- 2. Update the Secure Pricing Trigger
-- Includes ₦100 rounding and trip verification codes
CREATE OR REPLACE FUNCTION public.secure_ride_pricing()
RETURNS TRIGGER AS $$
DECLARE
    v_base_fare NUMERIC;
    v_km_rate NUMERIC;
    v_min_fare NUMERIC;
    v_distance_km FLOAT;
    v_raw_price NUMERIC;
BEGIN
    -- Fetch official rates
    SELECT base_fare, per_km_rate, min_fare 
    INTO v_base_fare, v_km_rate, v_min_fare
    FROM public.services 
    WHERE category = NEW.requested_vehicle_type;

    -- Calculate distance (PostGIS ST_Distance returns meters)
    v_distance_km := ST_Distance(NEW.pickup_location, NEW.destination_location) / 1000.0;

    -- Calculate Raw Price and Apply ₦100 Rounding
    v_raw_price := GREATEST(v_base_fare + (v_distance_km * v_km_rate), v_min_fare);
    NEW.price := (ROUND(v_raw_price / 100.0) * 100)::NUMERIC;

    -- Generate verification codes
    NEW.pickup_code := floor(random() * 9000 + 1000)::text;
    NEW.dropoff_code := floor(random() * 9000 + 1000)::text;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Re-attach the trigger
DROP TRIGGER IF EXISTS tr_secure_ride_pricing ON public.rides;
CREATE TRIGGER tr_secure_ride_pricing
  BEFORE INSERT ON public.rides
  FOR EACH ROW EXECUTE PROCEDURE public.secure_ride_pricing();

-- 4. Set default to avoid enum mismatch errors
ALTER TABLE public.rides 
ALTER COLUMN requested_vehicle_type SET DEFAULT 'car'::public.vehicle_category;
