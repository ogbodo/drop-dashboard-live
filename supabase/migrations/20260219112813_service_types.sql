-- 1. Create the Service Types Table
CREATE TABLE IF NOT EXISTS public.service_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name public.vehicle_category NOT NULL UNIQUE, -- Links to our snake_case Enum
    label TEXT NOT NULL,                           -- 'Standard', 'Luxury', etc.
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Insert the specific categories for Nigeria (Fixed to snake_case)
-- This ensures 'drop_plus' in the DB matches 'Drop Plus' in the App UI
INSERT INTO public.service_types (name, label, description) VALUES
('car', 'Standard', 'Safe and affordable everyday rides'),
('drop_plus', 'Luxury', 'Premium vehicles like BMW X6 or M7 series'),
('drop_family', 'Family', 'Large vehicles for groups and families'),
('bike', 'Bike', 'Fast urban transit for one passenger'),
('shuttle', 'Shuttle', 'Airport transfers and group pickups'),
('van_truck', 'Van/Truck', 'Cargo and heavy-duty delivery services')
ON CONFLICT (name) DO UPDATE SET 
  label = EXCLUDED.label, 
  description = EXCLUDED.description;

-- 3. Add the link to the 'rides' table
-- We use service_type_id so we can 'JOIN' to get the Label later
ALTER TABLE public.rides 
ADD COLUMN IF NOT EXISTS service_type_id UUID REFERENCES public.service_types(id);

-- 4. Enable Realtime for the new table
-- This allows the Customer App to see if a service becomes 'Inactive' (e.g. during fuel crisis)
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_types;

-- 5. Set Security
ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read of services" ON public.service_types FOR SELECT USING (true);
