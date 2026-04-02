UPDATE public.rides
SET
  "paymentMode" = 'Pay now',
  updated_at = now()
WHERE "paymentMode" = 'Pay before trip';
