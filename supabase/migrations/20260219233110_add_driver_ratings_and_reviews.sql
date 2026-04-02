-- 1. Add Rating & Trip Count to Profiles
ALTER TABLE public.profiles 
ADD COLUMN
IF NOT EXISTS rating NUMERIC
(3, 2) DEFAULT 1.1,
ADD COLUMN
IF NOT EXISTS total_trips INTEGER DEFAULT 0;

-- 2. Create the Reviews Table
CREATE TABLE
IF NOT EXISTS public.reviews
(
  id UUID DEFAULT gen_random_uuid
() PRIMARY KEY,
  ride_id UUID REFERENCES public.rides
(id) UNIQUE,
  customer_id UUID REFERENCES public.profiles
(id),
  driver_id UUID REFERENCES public.profiles
(id),
  rating INTEGER CHECK
(rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP
WITH TIME ZONE DEFAULT now
()
);

-- 3. Automation: Auto-update the Driver's average star rating
CREATE OR REPLACE FUNCTION public.update_driver_rating_stats
()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
    SET 
        rating = (SELECT COALESCE(AVG(rating)::NUMERIC(3,2), 1.1)
  FROM public.reviews
  WHERE driver_id = NEW.driver_id),
        total_trips = (SELECT COUNT(*)
  FROM public.rides
  WHERE driver_id = NEW.driver_id AND status = 'completed')
    WHERE id = NEW.driver_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Attach the Trigger
DROP TRIGGER IF EXISTS tr_update_driver_rating
ON public.reviews;
CREATE TRIGGER tr_update_driver_rating
AFTER
INSERT OR
UPDATE ON public.reviews
FOR EACH ROW
EXECUTE
FUNCTION public.update_driver_rating_stats
();
