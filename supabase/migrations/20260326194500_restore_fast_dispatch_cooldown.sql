INSERT INTO public.app_dispatch_configs (key, value, updated_at)
VALUES (
  'defaults',
  jsonb_build_object(
    'offer_cooldown_seconds', 0
  ),
  now()
)
ON CONFLICT (key) DO UPDATE
SET
  value = public.app_dispatch_configs.value || jsonb_build_object(
    'offer_cooldown_seconds', 0
  ),
  updated_at = now();
