-- Enable RLS
ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;

-- Allow the Service Role (which your function uses) to do everything
CREATE POLICY "Service role can manage OTPs" 
ON public.otp_verifications 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Optional: If you want to debug via the dashboard easily
CREATE POLICY "Admins can view OTPs" 
ON public.otp_verifications 
FOR SELECT 
TO authenticated 
USING (true);
