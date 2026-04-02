-- Ensure dispatcher defaults exist (used by ride matching)
INSERT INTO public.app_dispatch_configs (key, value, updated_at)
VALUES (
  'defaults',
  jsonb_build_object(
    'k_candidates', jsonb_build_object(
      'rides', 3,
      'delivery', 6
    ),
    'min_driver_rating', 0.5,
    'concurrent_offer_cap', 5,
    'max_pickup_distance_m', 15000,
    'offer_timeout_seconds', 45,
    'offer_cooldown_seconds', 300,
    'avg_speed_mps', 10,
    'defaults', jsonb_build_object(
      'max_rounds', 3,
      'k_candidates', 6,
      'offer_ttl_seconds', 45
    )
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;

-- Run dispatcher as owner so it can insert offers + realtime messages under RLS
ALTER FUNCTION public.handle_ride_lifecycle_orchestrator() SECURITY DEFINER;
ALTER FUNCTION public.handle_ride_lifecycle_orchestrator() SET search_path = public, realtime;
