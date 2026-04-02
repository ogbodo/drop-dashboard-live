CREATE TABLE IF NOT EXISTS public.expo_push_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expo_ticket_id TEXT NOT NULL UNIQUE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  notification_type TEXT,
  ride_id UUID REFERENCES public.rides(id) ON DELETE SET NULL,
  receipt_status TEXT,
  receipt_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  receipt_checked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS expo_push_tickets_pending_idx
ON public.expo_push_tickets (created_at)
WHERE receipt_status IS NULL;

CREATE INDEX IF NOT EXISTS expo_push_tickets_recipient_idx
ON public.expo_push_tickets (recipient_id, created_at DESC);
