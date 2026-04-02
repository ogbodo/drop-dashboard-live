INSERT INTO public.app_dispatch_configs (key, value, updated_at)
VALUES (
  'defaults',
  jsonb_build_object(
    'k_candidates', jsonb_build_object(
      'rides', 8,
      'delivery', 10
    ),
    'min_driver_rating', 0.5,
    'concurrent_offer_cap', 8,
    'max_pickup_distance_m', 15000,
    'offer_timeout_seconds', 18,
    'offer_cooldown_seconds', 90,
    'avg_speed_mps', 10,
    'routing_candidate_limit_per_service', 6,
    'routing_request_timeout_ms', 3500,
    'defaults', jsonb_build_object(
      'max_rounds', 3,
      'k_candidates', 8,
      'offer_ttl_seconds', 18
    )
  ),
  now()
)
ON CONFLICT (key) DO UPDATE
SET
  value = public.app_dispatch_configs.value || jsonb_build_object(
    'k_candidates',
    COALESCE(public.app_dispatch_configs.value -> 'k_candidates', '{}'::jsonb) ||
      jsonb_build_object('rides', 8, 'delivery', 10),
    'concurrent_offer_cap', 8,
    'offer_timeout_seconds', 18,
    'offer_cooldown_seconds', 90,
    'routing_candidate_limit_per_service', 6,
    'routing_request_timeout_ms', 3500,
    'defaults',
      COALESCE(public.app_dispatch_configs.value -> 'defaults', '{}'::jsonb) ||
      jsonb_build_object(
        'k_candidates', 8,
        'offer_ttl_seconds', 18
      )
  ),
  updated_at = now();
