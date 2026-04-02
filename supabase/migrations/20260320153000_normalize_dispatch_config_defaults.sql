INSERT INTO public.app_dispatch_configs (key, value, updated_at)
VALUES (
  'defaults',
  jsonb_build_object(
    'max_pickup_distance_m', 15000,
    'driver_location_stale_seconds', 300,
    'routing_enabled', true,
    'routing_provider', 'google_routes',
    'routing_candidate_limit_per_service', 3,
    'routing_request_timeout_ms', 6000,
    'routing_preference', 'TRAFFIC_AWARE_OPTIMAL',
    'live_eta_refresh_seconds', 90
  ),
  now()
)
ON CONFLICT (key) DO UPDATE
SET
  value = public.app_dispatch_configs.value || jsonb_build_object(
    'max_pickup_distance_m',
    COALESCE(
      (public.app_dispatch_configs.value ->> 'max_pickup_distance_m')::int,
      15000
    ),
    'driver_location_stale_seconds',
    COALESCE(
      (public.app_dispatch_configs.value ->> 'driver_location_stale_seconds')::int,
      300
    ),
    'routing_enabled',
    COALESCE(
      (public.app_dispatch_configs.value ->> 'routing_enabled')::boolean,
      true
    ),
    'routing_provider',
    COALESCE(
      public.app_dispatch_configs.value ->> 'routing_provider',
      'google_routes'
    ),
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
    ),
    'live_eta_refresh_seconds',
    COALESCE(
      (public.app_dispatch_configs.value ->> 'live_eta_refresh_seconds')::int,
      90
    )
  ),
  updated_at = now();
