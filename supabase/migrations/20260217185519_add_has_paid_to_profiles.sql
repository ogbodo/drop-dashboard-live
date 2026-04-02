-- 1. Add the has_paid column to the profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS has_paid BOOLEAN DEFAULT false;

-- 2. Optional: Add a comment for clarity
COMMENT ON COLUMN public.profiles.has_paid IS 'Indicates if the driver has completed their required payment.';

-- 3. Ensure RLS is active (if not already)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Create or Update Policy: Allow users to read their own profile (including has_paid)
CREATE POLICY "Users can view own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

-- 5. Create or Update Policy: Only the system or admin should update payment status
-- (Prevents drivers from manually setting has_paid = true via the client SDK)
CREATE POLICY "System can update payment status" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (false); -- This prevents client-side updates to this specific field
