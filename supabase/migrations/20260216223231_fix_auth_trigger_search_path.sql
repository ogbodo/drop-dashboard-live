-- 1. Drop old logic to ensure a clean overwrite
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user;

-- 2. Create the "Explicit" version that points directly to the public schema
-- This prevents the "type user_role does not exist" error during signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, driver_type, phone)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'), 
    NEW.email,
    -- Using public. prefix is the 'Honest Pro' way to handle custom types in triggers
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'customer'::public.user_role), 
    COALESCE((NEW.raw_user_meta_data->>'driver_type')::public.driver_service_type, 'rides'::public.driver_service_type),
    NEW.phone
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Re-attach the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. Ensure permissions are set for the app roles
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
