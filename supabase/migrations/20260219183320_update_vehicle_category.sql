-- This must be executed and committed before the next steps
ALTER TYPE public.vehicle_category
ADD VALUE
IF NOT EXISTS 'bus';
ALTER TYPE public.vehicle_category
ADD VALUE
IF NOT EXISTS 'mini_van';
