-- 1. Update the default value for the expires_at column
-- This ensures every new OTP created is valid for exactly 15 minutes
ALTER TABLE public.otp_verifications 
ALTER COLUMN expires_at
SET
DEFAULT
(now
() + interval '15 minutes');

-- 2. Optional: Clean up any old data that doesn't fit the new 15-minute logic
DELETE FROM public.otp_verifications WHERE created_at < (now() - interval
'15 minutes');
