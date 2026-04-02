CREATE OR REPLACE FUNCTION public.cancel_expired_scheduled_rides()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancelled_count integer := 0;
BEGIN
  WITH cancelled_rows AS (
    UPDATE public.scheduled_rides sr
    SET
      status = 'cancelled',
      updated_at = now()
    WHERE sr.status = 'scheduled'
      AND sr.spawned_ride_id IS NULL
      AND sr.scheduled_for < now()
    RETURNING sr.id
  )
  SELECT count(*)
  INTO v_cancelled_count
  FROM cancelled_rows;

  RETURN COALESCE(v_cancelled_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_scheduled_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  project_url text;
  anon_key text;
  dispatch_token text;
  cancelled_count integer := 0;
BEGIN
  SELECT public.cancel_expired_scheduled_rides()
  INTO cancelled_count;

  IF cancelled_count > 0 THEN
    RAISE LOG 'scheduled dispatch cleanup cancelled % expired scheduled rides', cancelled_count;
  END IF;

  SELECT decrypted_secret
  INTO project_url
  FROM vault.decrypted_secrets
  WHERE name = 'project_url'
  LIMIT 1;

  SELECT decrypted_secret
  INTO anon_key
  FROM vault.decrypted_secrets
  WHERE name = 'anon_key'
  LIMIT 1;

  SELECT decrypted_secret
  INTO dispatch_token
  FROM vault.decrypted_secrets
  WHERE name = 'scheduled_dispatch_token'
  LIMIT 1;

  IF project_url IS NULL OR anon_key IS NULL OR dispatch_token IS NULL THEN
    RAISE LOG 'scheduled dispatch skipped: missing vault secret project_url, anon_key, or scheduled_dispatch_token';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := project_url || '/functions/v1/dispatch-scheduled-rides',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'apikey', anon_key,
      'x-scheduled-dispatch-token', dispatch_token
    ),
    body := jsonb_build_object(
      'batchSize', 20,
      'source', 'pg_cron'
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_expired_scheduled_rides() TO service_role;
