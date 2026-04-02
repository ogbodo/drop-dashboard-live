INSERT INTO public.app_dispatch_configs (key, value, updated_at)
VALUES (
  'defaults',
  jsonb_build_object(
    'routing_enabled', true,
    'routing_provider', 'google_routes',
    'routing_candidate_limit_per_service', 3,
    'routing_request_timeout_ms', 6000,
    'routing_preference', 'TRAFFIC_AWARE_OPTIMAL'
  ),
  now()
)
ON CONFLICT (key) DO UPDATE
SET
  value = public.app_dispatch_configs.value || jsonb_build_object(
    'routing_enabled',
    COALESCE((public.app_dispatch_configs.value ->> 'routing_enabled')::boolean, true),
    'routing_provider',
    COALESCE(public.app_dispatch_configs.value ->> 'routing_provider', 'google_routes'),
    'routing_candidate_limit_per_service',
    COALESCE(
      (public.app_dispatch_configs.value ->> 'routing_candidate_limit_per_service')::int,
      3
    ),
    'routing_request_timeout_ms',
    COALESCE(
      (public.app_dispatch_configs.value ->> 'routing_request_timeout_ms')::int,
      6000
    ),
    'routing_preference',
    COALESCE(
      public.app_dispatch_configs.value ->> 'routing_preference',
      'TRAFFIC_AWARE_OPTIMAL'
    )
  ),
  updated_at = now();
