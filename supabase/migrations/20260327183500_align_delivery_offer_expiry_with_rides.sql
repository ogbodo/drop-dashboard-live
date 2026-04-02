INSERT INTO public.app_dispatch_configs (key, value, updated_at)
VALUES (
  'defaults',
  jsonb_build_object(
    'offer_timeout_seconds', 60,
    'offer_cooldown_seconds', 0,
    'defaults', jsonb_build_object(
      'offer_ttl_seconds', 60
    )
  ),
  now()
)
ON CONFLICT (key) DO UPDATE
SET
  value = public.app_dispatch_configs.value ||
    jsonb_build_object(
      'offer_timeout_seconds', 60,
      'offer_cooldown_seconds', 0,
      'defaults',
        COALESCE(public.app_dispatch_configs.value -> 'defaults', '{}'::jsonb) ||
        jsonb_build_object('offer_ttl_seconds', 60)
    ),
  updated_at = now();
