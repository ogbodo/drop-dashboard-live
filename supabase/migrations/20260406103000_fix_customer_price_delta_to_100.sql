INSERT INTO public.app_configs (key, description, value)
VALUES (
  'hybrid_finance_settings',
  'Hybrid cashless marketplace settings for service fees, withdrawals, and partner settlement.',
  jsonb_build_object(
    'service_fee_bands',
    jsonb_build_array(
      jsonb_build_object('max_fare', NULL, 'fee', 100)
    ),
    'payment_provider_customer_fee_percent', 0,
    'driver_minimum_withdrawal_amount', 1000,
    'driver_auto_withdraw_enabled_default', false,
    'partner_commission_hold_days', 7
  )
)
ON CONFLICT (key) DO UPDATE
SET
  value = COALESCE(public.app_configs.value, '{}'::jsonb) ||
    jsonb_build_object(
      'service_fee_bands',
      jsonb_build_array(
        jsonb_build_object('max_fare', NULL, 'fee', 100)
      ),
      'payment_provider_customer_fee_percent',
      0
    ),
  updated_at = now();
