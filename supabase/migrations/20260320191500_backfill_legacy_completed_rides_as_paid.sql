-- Legacy rides created on or before March 20, 2026 should not enter the new
-- cashless TripPayment flow. Backfill them as paid without firing the
-- completed-ride financial trigger so we don't retro-credit driver wallets.

BEGIN;

ALTER TABLE public.rides DISABLE TRIGGER tr_handle_completed_ride_financials;

UPDATE public.rides
SET
  payment_status = 'paid',
  settlement_status = CASE
    WHEN settlement_status = 'pending' THEN 'paid'
    ELSE settlement_status
  END,
  updated_at = (now() AT TIME ZONE 'utc')
WHERE status = 'completed'::public.ride_status
  AND created_at <= TIMESTAMPTZ '2026-03-20 23:59:59+00'
  AND COALESCE(payment_status, 'pending') <> 'paid'
  AND customer_payment_id IS NULL;

ALTER TABLE public.rides ENABLE TRIGGER tr_handle_completed_ride_financials;

COMMIT;
