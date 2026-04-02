CREATE OR REPLACE FUNCTION public.issue_offers_for_ride(in_ride_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime, extensions, vault
AS $$
DECLARE
  offer_ttl int := 45;
  current_round int := 1;
  ride_record RECORD;
  candidate RECORD;
  project_url text;
  anon_key text;
  offer_created_at timestamptz;
  offer_expires_at timestamptz;
  push_title text;
  push_body text;
BEGIN
  SELECT
    COALESCE(
      (value ->> 'offer_timeout_seconds')::int,
      (value -> 'defaults' ->> 'offer_ttl_seconds')::int,
      offer_ttl
    )
  INTO offer_ttl
  FROM public.app_dispatch_configs
  WHERE key = 'defaults'
  LIMIT 1;

  IF NOT FOUND THEN
    offer_ttl := 45;
  END IF;

  SELECT
    id,
    status,
    price,
    pickup_address,
    destination_address,
    COALESCE(is_delivery, false) AS is_delivery
  INTO ride_record
  FROM public.rides
  WHERE id = in_ride_id
  FOR UPDATE;

  IF NOT FOUND OR ride_record.status <> 'pending' THEN
    RETURN;
  END IF;

  SELECT COALESCE(MAX(round), 0) + 1
  INTO current_round
  FROM public.ride_offers
  WHERE ride_id = in_ride_id;

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

  push_title :=
    CASE
      WHEN ride_record.is_delivery THEN 'New Delivery Request'
      ELSE 'New Ride Request'
    END;
  push_body := trim(
    BOTH ' '
    FROM concat_ws(
      ' to ',
      NULLIF(ride_record.pickup_address, ''),
      NULLIF(ride_record.destination_address, '')
    )
  );

  FOR candidate IN
    SELECT *
    FROM public.get_candidate_drivers(in_ride_id)
  LOOP
    offer_created_at := now();
    offer_expires_at := offer_created_at + make_interval(secs => offer_ttl);

    INSERT INTO public.ride_offers (
      ride_id,
      driver_id,
      offered_at,
      status,
      round,
      expires_at,
      updated_at
    )
    VALUES (
      in_ride_id,
      candidate.driver_id,
      offer_created_at,
      'offered',
      current_round,
      offer_expires_at,
      offer_created_at
    )
    ON CONFLICT (ride_id, driver_id) DO UPDATE
    SET offered_at = EXCLUDED.offered_at,
        status = EXCLUDED.status,
        round = EXCLUDED.round,
        expires_at = EXCLUDED.expires_at,
        updated_at = EXCLUDED.updated_at;

    INSERT INTO realtime.messages (topic, event, payload, extension)
    VALUES (
      'driver:' || candidate.driver_id::text || ':offers',
      'offer_created',
      jsonb_build_object(
        'ride_id', in_ride_id,
        'price', ride_record.price,
        'round', current_round,
        'dist_km', ROUND((candidate.distance_meters / 1000.0)::numeric, 2),
        'offered_at', offer_created_at,
        'expires_at', offer_expires_at
      ),
      'broadcast'
    );

    IF project_url IS NOT NULL AND anon_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := project_url || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || anon_key,
          'apikey', anon_key
        ),
        body := jsonb_build_object(
          'recipientIds', jsonb_build_array(candidate.driver_id::text),
          'title', push_title,
          'body', COALESCE(
            NULLIF(push_body, ''),
            'Open Drop to review this request.'
          ),
          'sticky', true,
          'channelId', 'trip-urgent',
          'data', jsonb_build_object(
            'type', 'ride_request',
            'rideId', in_ride_id,
            'round', current_round,
            'offeredAt', offer_created_at,
            'expiresAt', offer_expires_at
          )
        )
      );
    END IF;
  END LOOP;
END;
$$;
