ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS eta_stage text;

INSERT INTO public.app_dispatch_configs (key, value, updated_at)
VALUES (
  'defaults',
  jsonb_build_object(
    'live_eta_refresh_seconds', 90
  ),
  now()
)
ON CONFLICT (key) DO UPDATE
SET
  value = public.app_dispatch_configs.value || jsonb_build_object(
    'live_eta_refresh_seconds',
    COALESCE(
      (public.app_dispatch_configs.value ->> 'live_eta_refresh_seconds')::int,
      90
    )
  ),
  updated_at = now();

CREATE OR REPLACE FUNCTION public.broadcast_ride_eta_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF
    OLD.estimated_pickup_mins IS NOT DISTINCT FROM NEW.estimated_pickup_mins
    AND OLD.estimated_dropoff_mins IS NOT DISTINCT FROM NEW.estimated_dropoff_mins
    AND OLD.eta_last_calculated_at IS NOT DISTINCT FROM NEW.eta_last_calculated_at
    AND OLD.eta_source IS NOT DISTINCT FROM NEW.eta_source
    AND OLD.eta_stage IS NOT DISTINCT FROM NEW.eta_stage
  THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status::text, '') NOT IN ('accepted', 'arrived', 'on_trip') THEN
    RETURN NEW;
  END IF;

  INSERT INTO realtime.messages (topic, event, payload, extension)
  VALUES (
    'ride:' || NEW.id::text || ':eta',
    'UPDATE',
    jsonb_build_object(
      'new',
      jsonb_build_object(
        'pickup_eta', NEW.estimated_pickup_mins,
        'dropoff_eta', NEW.estimated_dropoff_mins,
        'eta_stage', NEW.eta_stage,
        'eta_source', NEW.eta_source,
        'eta_last_calculated_at', NEW.eta_last_calculated_at
      )
    ),
    'broadcast'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_ride_eta_update ON public.rides;

CREATE TRIGGER trg_broadcast_ride_eta_update
AFTER UPDATE OF estimated_pickup_mins, estimated_dropoff_mins, eta_last_calculated_at, eta_source, eta_stage
ON public.rides
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_ride_eta_update();
