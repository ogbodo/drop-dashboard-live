-- 1. Update the Pricing Function with Rounding Logic
CREATE OR REPLACE FUNCTION public.secure_ride_pricing()
RETURNS TRIGGER AS $$
DECLARE
    v_base_fare NUMERIC;
    v_km_rate NUMERIC;
    v_min_fare NUMERIC;
    v_distance_km FLOAT;
    v_raw_price NUMERIC;
BEGIN
    -- 1. Fetch official rates from our services table
    SELECT base_fare, per_km_rate, min_fare 
    INTO v_base_fare, v_km_rate, v_min_fare
    FROM public.services 
    WHERE category = NEW.requested_vehicle_type;

    -- 2. Calculate distance in KM using PostGIS (pickup to destination)
    -- ST_Distance returns meters, so we divide by 1000.0
    v_distance_km := ST_Distance(NEW.pickup_location, NEW.destination_location) / 1000.0;

    -- 3. Calculate Raw Price (Base + (Distance * Rate))
    -- We use GREATEST to ensure we never go below the Minimum Fare
    v_raw_price := GREATEST(v_base_fare + (v_distance_km * v_km_rate), v_min_fare);

    -- 4. THE "DROP" ROUNDING LOGIC (Round to nearest ₦100)
    -- Example: ₦1,249 becomes ₦1,200 | ₦1,250 becomes ₦1,300
    -- This solves the 'change' problem for Nigerian drivers
    NEW.price := ROUND(v_raw_price / 100.0) * 100;

    -- 5. Generate the verification codes for the trip
    NEW.pickup_code := floor(random() * 9000 + 1000)::text;
    NEW.dropoff_code := floor(random() * 9000 + 1000)::text;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Re-attach the trigger to the rides table
-- We drop it first to ensure we aren't creating duplicates
DROP TRIGGER IF EXISTS tr_secure_ride_pricing ON public.rides;
CREATE TRIGGER tr_secure_ride_pricing
  BEFORE INSERT ON public.rides
  FOR EACH ROW EXECUTE PROCEDURE public.secure_ride_pricing();
