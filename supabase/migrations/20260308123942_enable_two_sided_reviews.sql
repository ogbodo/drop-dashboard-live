ALTER TABLE public.reviews
ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS target_id UUID REFERENCES public.profiles(id);

UPDATE public.reviews
SET
  reviewer_id = COALESCE(reviewer_id, customer_id),
  target_id = COALESCE(target_id, driver_id)
WHERE reviewer_id IS NULL
   OR target_id IS NULL;

ALTER TABLE public.reviews
DROP CONSTRAINT IF EXISTS reviews_ride_id_key;

DROP INDEX IF EXISTS reviews_ride_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_ride_reviewer_unique_idx
ON public.reviews (ride_id, reviewer_id);

CREATE OR REPLACE FUNCTION public.update_profile_rating_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET
    rating = (
      SELECT COALESCE(AVG(rating)::NUMERIC(3, 2), 1.1)
      FROM public.reviews
      WHERE target_id = NEW.target_id
    ),
    total_trips = (
      SELECT COUNT(*)
      FROM public.rides
      WHERE status = 'completed'
        AND (driver_id = NEW.target_id OR customer_id = NEW.target_id)
    )
  WHERE id = NEW.target_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_driver_rating ON public.reviews;

CREATE TRIGGER tr_update_profile_rating
AFTER INSERT OR UPDATE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.update_profile_rating_stats();
