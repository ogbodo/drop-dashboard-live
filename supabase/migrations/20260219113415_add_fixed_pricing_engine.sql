-- 1. Create the Services Table (The Source of Truth for Prices)
CREATE TABLE IF NOT EXISTS public.services (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category public.vehicle_category NOT NULL UNIQUE, 
    base_fare NUMERIC(10, 2) NOT NULL,         -- Starting price in Naira
    per_km_rate NUMERIC(10, 2) NOT NULL,       -- Fixed price per Kilometer
    min_fare NUMERIC(10, 2) NOT NULL,          -- Absolute minimum for any trip
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Insert the official Drop categories with snake_case naming
INSERT INTO public.services (category, base_fare, per_km_rate, min_fare, description) VALUES
('bike', 200.00, 100.00, 400.00, 'Fast 2-wheel transit'),
('car', 500.00, 250.00, 1000.00, 'Standard 4-door sedan'),
('drop_plus', 1000.00, 450.00, 2500.00, 'Premium luxury vehicles'),
('drop_family', 800.00, 350.00, 2000.00, 'Large SUVs and Minivans'),
('shuttle', 1500.00, 500.00, 3500.00, 'Airport and group transfers'),
('van_truck', 2500.00, 800.00, 6000.00, 'Deliveries and heavy moving')
ON CONFLICT (category) DO UPDATE SET 
  base_fare = EXCLUDED.base_fare, 
  per_km_rate = EXCLUDED.per_km_rate,
  min_fare = EXCLUDED.min_fare;

-- 3. Add the preference column to the Rides table
ALTER TABLE public.rides 
ADD COLUMN IF NOT EXISTS requested_vehicle_type public.vehicle_category DEFAULT 'Car';

-- 4. Create the Secure Pricing & Code Trigger
CREATE OR REPLACE FUNCTION public.secure_ride_pricing()
RETURNS TRIGGER AS $$
DECLARE
    v_base_fare NUMERIC;
    v_km_rate NUMERIC;
    v_min_fare NUMERIC;
    v_distance_km FLOAT;
BEGIN
    -- 1. Generate the verification codes (Security upgrade)
    NEW.pickup_code := floor(random() * 9000 + 1000)::text;
    NEW.dropoff_code := floor(random() * 9000 + 1000)::text;

    -- 2. Get the official rates from our services table
    SELECT base_fare, per_km_rate, min_fare 
    INTO v_base_fare, v_km_rate, v_min_fare
    FROM public.services 
    WHERE category = NEW.requested_vehicle_type;

    -- 3. Calculate distance in KM using PostGIS (pickup to destination)
    v_distance_km := ST_Distance(NEW.pickup_location, NEW.destination_location) / 1000.0;

    -- 4. Final Price = Base + (Distance * Rate), but never lower than Min Fare
    NEW.price := GREATEST(v_base_fare + (v_distance_km * v_km_rate), v_min_fare);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the pricing trigger to the rides table
DROP TRIGGER IF EXISTS tr_secure_ride_pricing ON public.rides;
CREATE TRIGGER tr_secure_ride_pricing
  BEFORE INSERT ON public.rides
  FOR EACH ROW EXECUTE PROCEDURE public.secure_ride_pricing();

-- 5. Enable Realtime for the Services table
ALTER PUBLICATION supabase_realtime ADD TABLE public.services;
