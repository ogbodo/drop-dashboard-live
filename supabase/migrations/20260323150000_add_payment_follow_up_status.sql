ALTER TABLE public.rides
ADD COLUMN IF NOT EXISTS payment_follow_up_status TEXT NOT NULL DEFAULT 'none'
CHECK (
  payment_follow_up_status IN ('none', 'customer_paying_soon', 'under_review', 'resolved')
);

ALTER TABLE public.rides
ADD COLUMN IF NOT EXISTS payment_follow_up_note TEXT;

ALTER TABLE public.rides
ADD COLUMN IF NOT EXISTS payment_follow_up_reported_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rides_payment_follow_up_status
ON public.rides (payment_follow_up_status, payment_status, completed_at DESC);

CREATE OR REPLACE FUNCTION public.sync_payment_follow_up_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.payment_status, 'pending') = 'paid' THEN
    NEW.payment_follow_up_status = 'resolved';
  ELSIF TG_OP = 'UPDATE'
    AND COALESCE(OLD.payment_status, 'pending') = 'paid'
    AND COALESCE(NEW.payment_status, 'pending') <> 'paid'
    AND COALESCE(NEW.payment_follow_up_status, 'none') = 'resolved' THEN
    NEW.payment_follow_up_status = 'under_review';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_payment_follow_up_status ON public.rides;
CREATE TRIGGER tr_sync_payment_follow_up_status
BEFORE UPDATE OF payment_status ON public.rides
FOR EACH ROW
EXECUTE FUNCTION public.sync_payment_follow_up_status();

CREATE OR REPLACE FUNCTION public.submit_payment_issue_report_rpc(
  p_ride_id uuid,
  p_category text,
  p_description text,
  p_customer_commitment text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reporter_id uuid := auth.uid();
  v_ride public.rides%ROWTYPE;
  v_note text;
BEGIN
  IF v_reporter_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_ride
  FROM public.rides
  WHERE id = p_ride_id
    AND customer_id = v_reporter_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ride not found for this customer.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_ride.status <> 'completed'::public.ride_status THEN
    RAISE EXCEPTION 'Payment issue reports can only be submitted after the trip is completed.'
      USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(v_ride.payment_status, 'pending') = 'paid' THEN
    RAISE EXCEPTION 'This trip is already marked as paid.'
      USING ERRCODE = 'P0001';
  END IF;

  v_note := trim(
    both ' '
    from concat_ws(' ', NULLIF(trim(p_description), ''), NULLIF(trim(p_customer_commitment), ''))
  );

  INSERT INTO public.reports (
    ride_id,
    reporter_id,
    target_id,
    issue_category,
    description,
    status
  )
  VALUES (
    v_ride.id,
    v_reporter_id,
    v_ride.driver_id,
    p_category,
    NULLIF(v_note, ''),
    'pending'
  );

  UPDATE public.rides
  SET
    payment_follow_up_status = 'customer_paying_soon',
    payment_follow_up_note = COALESCE(NULLIF(trim(p_customer_commitment), ''), NULLIF(trim(p_description), ''), payment_follow_up_note),
    payment_follow_up_reported_at = now()
  WHERE id = v_ride.id;

  RETURN json_build_object(
    'status', 'ok',
    'message', 'Payment issue recorded.',
    'ride_id', v_ride.id,
    'payment_follow_up_status', 'customer_paying_soon'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_payment_issue_report_rpc(uuid, text, text, text)
TO authenticated, service_role;
