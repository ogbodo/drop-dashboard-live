-- 1. SETUP EXTENSIONS & CUSTOM TYPES
-- PostGIS for "Find nearby drivers" and "Live Maps"
CREATE EXTENSION IF NOT EXISTS postgis SCHEMA extensions;
-- pg_cron for the "Janitor" (Automatic OTP Cleanup)
CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA extensions;

-- Custom Enums for Logistics Data Integrity
CREATE TYPE ride_status AS ENUM ('pending', 'accepted', 'picked_up', 'completed', 'cancelled');
CREATE TYPE user_role AS ENUM ('customer', 'driver');
CREATE TYPE driver_service_type AS ENUM ('rides', 'delivery', 'both');
-- Your specific categories: car, bike, van_truck
CREATE TYPE vehicle_category AS ENUM ('car', 'bike', 'van_truck'); 
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other');

-- 2. CORE TABLES
-- Profiles: Holds both Customer & Driver data (including all onboarding items)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  full_name TEXT,
  email TEXT,       -- Auto-synced from Auth
  phone TEXT,       -- Auto-synced from Auth
  role user_role DEFAULT 'customer',
  driver_type driver_service_type DEFAULT 'rides',
  
  -- Identity Fields
  gender gender_type,
  dob DATE, 
  
  is_online BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false, -- Admin toggle for approval
  avatar_url TEXT,                 -- Item 1: Avatar
  
  -- Driver Verification (Items 4, 5, 6)
  nin_number TEXT,                 -- Item 4
  license_number TEXT,             -- Item 5
  license_expiry DATE,             -- Item 6
  
  -- Document Paths (Items 2, 3)
  -- Stored as paths in the 'driver-docs' bucket
  license_photo_url TEXT,          -- Item 2: License Photo
  license_selfie_url TEXT,         -- Item 3: Selfie holding License
  
  -- Item 14: Emergency Contact
  emergency_contact JSONB,         -- {fullName, relationship, phone, address}
  
  expo_push_token TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Vehicles: Linked to drivers (Items 7-13)
CREATE TABLE public.vehicles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  category vehicle_category DEFAULT 'car', -- Item 13
  make TEXT NOT NULL,              -- Item 9 (Brand)
  model TEXT NOT NULL,             -- Item 10
  color TEXT,                      -- Item 11
  production_year INTEGER,         -- Item 12
  plate_number TEXT UNIQUE NOT NULL,
  
  -- Vehicle Docs (Items 7, 8)
  registration_photo_url TEXT,     -- Item 7: Plate Number Photo
  vehicle_image_url TEXT,          -- Item 8: Vehicle Photo
  
  capacity_kg NUMERIC(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

-- Rides & Deliveries: The transaction engine
CREATE TABLE public.rides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.profiles(id),
  driver_id UUID REFERENCES public.profiles(id),
  status ride_status DEFAULT 'pending',
  is_delivery BOOLEAN DEFAULT false,
  
  -- Geography (Using extensions.geography to avoid schema errors)
  pickup_location extensions.geography(POINT) NOT NULL,
  destination_location extensions.geography(POINT) NOT NULL,
  pickup_address TEXT,
  destination_address TEXT,
  
  pickup_code TEXT,    -- For pickup verification
  dropoff_code TEXT,   -- For dropoff verification
  
  package_details TEXT,
  weight_kg NUMERIC(10, 2),
  price NUMERIC(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Real-time Tracking
CREATE TABLE public.driver_locations (
  driver_id UUID REFERENCES public.profiles(id) PRIMARY KEY,
  current_location extensions.geography(POINT),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- OTP Storage (For Africa's Talking / WhatsApp flow)
CREATE TABLE public.otp_verifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  -- Set to 15 minutes to handle Nigerian network delays
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '15 minutes')
);

-- 3. AUTOMATION (The Profile Sync Trigger)
-- This ensures every Auth Signup creates a Public Profile automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, driver_type, phone)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'), 
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer'), 
    COALESCE((NEW.raw_user_meta_data->>'driver_type')::driver_service_type, 'rides'),
    NEW.phone
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. BUCKETS & SECURITY (RLS)
-- Create Storage Buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('driver-docs', 'driver-docs', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('vehicle-images', 'vehicle-images', true) ON CONFLICT DO NOTHING;

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- Database Policies
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Drivers manage own vehicle" ON public.vehicles FOR ALL USING (auth.uid() = driver_id);

-- Storage Policies (Securely mapping folders to User IDs)
CREATE POLICY "Drivers upload docs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'driver-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Drivers view docs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'driver-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Drivers upload vehicles" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'vehicle-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users view vehicles" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'vehicle-images');

-- 5. THE JANITOR (Cleanup & Realtime)
CREATE INDEX ON public.driver_locations USING GIST (current_location);
CREATE INDEX ON public.otp_verifications (expires_at);

-- Grant usage for pg_cron
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule the OTP Janitor to run every hour
SELECT cron.schedule('cleanup-otps', '0 * * * *', $$ DELETE FROM public.otp_verifications WHERE expires_at < now(); $$);

-- Enable Realtime broadcasting for live ride updates and map movement
ALTER PUBLICATION supabase_realtime ADD TABLE public.rides, public.driver_locations;
