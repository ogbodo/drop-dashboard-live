alter table public.customer_payments
  drop constraint if exists customer_payments_provider_check;

alter table public.customer_payments
  add constraint customer_payments_provider_check
  check (provider in ('manual', 'paystack', 'flutterwave', 'internal'));

alter table public.driver_payout_accounts
  drop constraint if exists driver_payout_accounts_provider_check;

alter table public.driver_payout_accounts
  add constraint driver_payout_accounts_provider_check
  check (provider in ('manual', 'paystack', 'flutterwave', 'internal'));

alter table public.driver_payouts
  drop constraint if exists driver_payouts_provider_check;

alter table public.driver_payouts
  add constraint driver_payouts_provider_check
  check (provider in ('manual', 'paystack', 'flutterwave', 'internal'));
