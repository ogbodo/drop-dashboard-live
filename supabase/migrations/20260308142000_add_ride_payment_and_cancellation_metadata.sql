CREATE OR REPLACE FUNCTION public.set_ride_cancelled_by_trigger
()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only run if the status is flipping TO 'cancelled'
  IF NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status::text <> 'cancelled') THEN

  -- 1. If it's already set by the app, don't touch it
  IF NEW.cancelled_by IS NULL THEN

  -- 2. Identify the person based on their auth session
  IF auth.uid() = OLD.customer_id THEN
        NEW.cancelled_by := 'customer';
ELSIF auth.uid
() = OLD.driver_id THEN
        NEW.cancelled_by := 'driver';
      ELSE
        -- 3. If no one is logged in, it's a System Timeout
        NEW.cancelled_by := 'system';
END
IF;
      
    END
IF;
  END
IF;

  RETURN NEW;
END;
$$;
