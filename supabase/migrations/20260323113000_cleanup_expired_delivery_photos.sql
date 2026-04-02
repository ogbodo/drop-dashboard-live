CREATE INDEX IF NOT EXISTS idx_rides_expired_delivery_photos
ON public.rides (created_at)
WHERE is_delivery = true
  AND (
    (delivery_item_info ? 'image')
    OR item_image_url IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_reports_pending_ride_id
ON public.reports (ride_id)
WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.normalize_delivery_photo_path(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_path text := NULLIF(BTRIM(p_value), '');
BEGIN
  IF v_path IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_path ~* '^https?://' THEN
    v_path := regexp_replace(
      v_path,
      '^https?://[^/]+/storage/v1/object/(?:public|sign|authenticated)/deliveries/',
      ''
    );
    v_path := regexp_replace(v_path, '\?.*$', '');
  END IF;

  RETURN NULLIF(BTRIM(v_path), '');
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_delivery_photos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_cleared_count integer := 0;
  v_deleted_count integer := 0;
BEGIN
  WITH candidate_rides AS (
    SELECT
      r.id,
      public.normalize_delivery_photo_path(
        COALESCE(r.delivery_item_info ->> 'image', r.item_image_url)
      ) AS object_name
    FROM public.rides r
    WHERE r.is_delivery = true
      AND r.created_at < now() - interval '30 days'
      AND public.normalize_delivery_photo_path(
        COALESCE(r.delivery_item_info ->> 'image', r.item_image_url)
      ) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.reports rp
        WHERE rp.ride_id = r.id
          AND COALESCE(rp.status, 'pending') = 'pending'
      )
  ),
  cleaned_rides AS (
    UPDATE public.rides r
    SET
      delivery_item_info = CASE
        WHEN jsonb_typeof(r.delivery_item_info) = 'object'
          THEN r.delivery_item_info - 'image'
        ELSE r.delivery_item_info
      END,
      item_image_url = NULL
    FROM candidate_rides cr
    WHERE r.id = cr.id
    RETURNING cr.object_name
  ),
  deleted_objects AS (
    DELETE FROM storage.objects so
    USING (
      SELECT DISTINCT object_name
      FROM cleaned_rides
      WHERE object_name IS NOT NULL
    ) targets
    WHERE so.bucket_id = 'deliveries'
      AND so.name = targets.object_name
    RETURNING so.name
  )
  SELECT
    (SELECT count(*) FROM cleaned_rides),
    (SELECT count(*) FROM deleted_objects)
  INTO v_cleared_count, v_deleted_count;

  IF v_cleared_count > 0 OR v_deleted_count > 0 THEN
    RAISE LOG 'delivery photo cleanup cleared % ride references and deleted % storage objects',
      v_cleared_count,
      v_deleted_count;
  END IF;

  RETURN COALESCE(v_cleared_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_delivery_photos() TO service_role;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid
  INTO v_job_id
  FROM cron.job
  WHERE jobname = 'cleanup-expired-delivery-photos'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'cleanup-expired-delivery-photos',
    '15 3 * * *',
    'SELECT public.cleanup_expired_delivery_photos();'
  );
END;
$$;
