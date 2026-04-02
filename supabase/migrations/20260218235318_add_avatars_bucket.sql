-- 1. Create the Public Avatars Bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true) 
ON CONFLICT DO NOTHING;

-- 2. Security: Allow users to upload their own avatar
CREATE POLICY "Users can upload own avatar" ON storage.objects 
FOR INSERT TO authenticated 
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3. Security: Allow everyone to see avatars (Public)
CREATE POLICY "Avatars are publicly viewable" ON storage.objects 
FOR SELECT TO authenticated, anon 
USING (bucket_id = 'avatars');
