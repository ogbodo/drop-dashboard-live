-- 1. Drop the old trigger/function so we can overwrite it
DROP TRIGGER IF EXISTS on_auth_user_created
ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user;

-- 2. Create the "Smart" version of the trigger
CREATE OR REPLACE FUNCTION public.handle_new_user
()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles
        (id, full_name, email, role, phone, driver_type)
    VALUES
        (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
            NEW.email,
            COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'customer'
    ::public.user_role), 
    NEW.phone,
    -- THE FIX: Logic to only set driver_type for drivers
    CASE 
      WHEN
    (NEW.raw_user_meta_data->>'role') = 'driver' 
      THEN COALESCE
    ((NEW.raw_user_meta_data->>'driver_type')::public.driver_service_type, 'rides'::public.driver_service_type)
      ELSE NULL
-- Customers get NULL, keeping their profile clean
END
);
RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Re-enable the trigger
CREATE TRIGGER on_auth_user_created
  AFTER
INSERT ON
auth.users
FOR EACH ROW
EXECUTE
PROCEDURE public.handle_new_user
();

-- 4. Clean up any existing customers who accidentally got 'rides' assigned
UPDATE public.profiles 
SET driver_type = NULL 
WHERE role = 'customer' AND driver_type IS NOT NULL;
