-- Client accounts (ADR-029): global profile + account-level anamnesis, link to a clinic's local
-- record, and client-side booking. Every function derives the person from the verified
-- `luminix.identity_id` set by the API; no function takes an identity or profile id as input.
-- Additive: new nullable/defaulted columns and new functions only.

ALTER TABLE luminix.client_profiles
  ADD COLUMN display_name text CHECK (display_name IS NULL OR length(trim(display_name)) BETWEEN 1 AND 160),
  ADD COLUMN contact_email text CHECK (contact_email IS NULL OR length(contact_email) BETWEEN 3 AND 254),
  ADD COLUMN contact_phone text CHECK (contact_phone IS NULL OR contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  -- Level I record: sex, birthDate, allergies, healthNotes, answeredAt. Health data (LGPD art. 11).
  ADD COLUMN anamnesis jsonb CHECK (anamnesis IS NULL OR jsonb_typeof(anamnesis) = 'object'),
  -- Small square JPEG kept with the record until client media moves to the private bucket (TD-012).
  ADD COLUMN photo_data text CHECK (
    photo_data IS NULL OR (photo_data LIKE 'data:image/jpeg;base64,%' AND length(photo_data) <= 400000)
  ),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE luminix.clinic_clients
  -- The client allowed this clinic to read the account record instead of a record of its own.
  ADD COLUMN anamnesis_shared boolean NOT NULL DEFAULT false,
  ADD COLUMN client_anamnesis jsonb CHECK (client_anamnesis IS NULL OR jsonb_typeof(client_anamnesis) = 'object'),
  ADD COLUMN client_photo_data text CHECK (
    client_photo_data IS NULL
    OR (client_photo_data LIKE 'data:image/jpeg;base64,%' AND length(client_photo_data) <= 400000)
  ),
  -- Removed from the client's list in the app; the clinic keeps its record and history.
  ADD COLUMN client_removed_at timestamptz;

ALTER TABLE luminix.appointments
  -- Chosen by the client when booking. Simulated: no charge is made and no finance entry is created.
  ADD COLUMN client_payment_method text CHECK (
    client_payment_method IS NULL OR client_payment_method IN ('local', 'pix', 'card')
  );

CREATE INDEX clinic_clients_profile_lookup
  ON luminix.clinic_clients (client_profile_id) WHERE client_profile_id IS NOT NULL;

-- The verified person behind this request, or an error. Never trusts any argument.
CREATE FUNCTION luminix.client_identity()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_identity uuid := nullif(current_setting('luminix.identity_id', true), '')::uuid;
BEGIN
  IF v_identity IS NULL OR NOT EXISTS (
    SELECT 1 FROM luminix.identities WHERE id = v_identity AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Client identity unavailable' USING ERRCODE = '42501';
  END IF;
  RETURN v_identity;
END $$;

CREATE FUNCTION luminix.client_profile_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT id FROM luminix.client_profiles WHERE identity_id = luminix.client_identity()
$$;

CREATE FUNCTION luminix.client_me()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object(
    'profile', (
      SELECT jsonb_build_object(
        'name', p.display_name, 'email', p.contact_email, 'phone', p.contact_phone,
        'anamnesis', p.anamnesis, 'photo', p.photo_data, 'createdAt', p.created_at)
      FROM luminix.client_profiles p WHERE p.identity_id = luminix.client_identity()),
    'spaces', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'slug', c.slug, 'shareAnamnesis', cc.anamnesis_shared,
          'ownAnamnesis', cc.client_anamnesis, 'ownPhoto', cc.client_photo_data,
          'linkedAt', cc.created_at) ORDER BY cc.created_at)
        FROM luminix.client_profiles p
        JOIN luminix.clinic_clients cc ON cc.client_profile_id = p.id
          AND cc.status = 'active' AND cc.client_removed_at IS NULL
        JOIN luminix.clinics c ON c.id = cc.clinic_id AND c.status = 'active'
       WHERE p.identity_id = luminix.client_identity()), '[]'::jsonb)
  )
$$;

CREATE FUNCTION luminix.client_save_profile(p_name text, p_email text, p_phone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  INSERT INTO luminix.client_profiles (identity_id, display_name, contact_email, contact_phone)
  VALUES (luminix.client_identity(), p_name, p_email, p_phone)
  ON CONFLICT (identity_id) DO UPDATE SET
    display_name = EXCLUDED.display_name, contact_email = EXCLUDED.contact_email,
    contact_phone = EXCLUDED.contact_phone, updated_at = now();
END $$;

-- p_slug NULL saves the account record; a slug saves that clinic's own record (and stops sharing).
CREATE FUNCTION luminix.client_save_anamnesis(p_slug text, p_record jsonb, p_photo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_profile uuid := luminix.client_profile_id();
BEGIN
  IF v_profile IS NULL THEN RAISE EXCEPTION 'Profile missing' USING ERRCODE = '22023'; END IF;
  IF p_record IS NULL OR jsonb_typeof(p_record) <> 'object' OR p_photo IS NULL THEN
    RAISE EXCEPTION 'Invalid anamnesis' USING ERRCODE = '22023';
  END IF;
  IF p_slug IS NULL THEN
    UPDATE luminix.client_profiles
       SET anamnesis = p_record, photo_data = p_photo, updated_at = now()
     WHERE id = v_profile;
    -- Clinics allowed to use the account record see the same sex and birth date.
    UPDATE luminix.clinic_clients
       SET sex = p_record->>'sex', birth_date = (p_record->>'birthDate')::date
     WHERE client_profile_id = v_profile AND anamnesis_shared;
    RETURN;
  END IF;
  UPDATE luminix.clinic_clients cc
     SET client_anamnesis = p_record, client_photo_data = p_photo, anamnesis_shared = false,
         sex = p_record->>'sex', birth_date = (p_record->>'birthDate')::date
    FROM luminix.clinics c
   WHERE c.id = cc.clinic_id AND c.slug = p_slug AND cc.client_profile_id = v_profile
     AND cc.client_removed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Space not linked' USING ERRCODE = '22023'; END IF;
END $$;

-- Links the person to a published clinic with a new local record (never matched by phone,
-- e-mail or CPF typed at the front desk: ADR-027). Linking again only refreshes the permission.
CREATE FUNCTION luminix.client_join_clinic(p_slug text, p_share boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_profile luminix.client_profiles%ROWTYPE; v_clinic uuid;
BEGIN
  SELECT * INTO v_profile FROM luminix.client_profiles WHERE identity_id = luminix.client_identity();
  IF NOT FOUND OR v_profile.display_name IS NULL THEN
    RAISE EXCEPTION 'Profile missing' USING ERRCODE = '22023';
  END IF;
  SELECT c.id INTO v_clinic FROM luminix.clinics c
    JOIN luminix.clinic_profiles p ON p.clinic_id = c.id AND p.public_enabled
   WHERE c.slug = p_slug AND c.status = 'active';
  IF v_clinic IS NULL THEN RAISE EXCEPTION 'Space unavailable' USING ERRCODE = '22023'; END IF;
  INSERT INTO luminix.clinic_clients
    (clinic_id, client_profile_id, display_name, contact_phone, contact_email, source,
     anamnesis_shared, sex, birth_date)
  VALUES (v_clinic, v_profile.id, v_profile.display_name, v_profile.contact_phone,
    v_profile.contact_email, 'client_app', coalesce(p_share, false),
    CASE WHEN p_share THEN v_profile.anamnesis->>'sex' END,
    CASE WHEN p_share THEN (v_profile.anamnesis->>'birthDate')::date END)
  ON CONFLICT (clinic_id, client_profile_id) DO UPDATE SET
    client_removed_at = NULL,
    anamnesis_shared = CASE WHEN luminix.clinic_clients.client_removed_at IS NULL
      THEN luminix.clinic_clients.anamnesis_shared ELSE EXCLUDED.anamnesis_shared END;
END $$;

CREATE FUNCTION luminix.client_leave_clinic(p_slug text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  UPDATE luminix.clinic_clients cc SET client_removed_at = now()
    FROM luminix.clinics c
   WHERE c.id = cc.clinic_id AND c.slug = p_slug
     AND cc.client_profile_id = luminix.client_profile_id() AND cc.client_removed_at IS NULL;
END $$;

-- Scope for a request about one linked clinic. The API then sets luminix.clinic_id to it.
CREATE FUNCTION luminix.client_clinic_scope(p_slug text)
RETURNS TABLE (clinic_id uuid, clinic_client_id uuid, client_sex text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT c.id, cc.id,
         coalesce(cc.sex, CASE WHEN cc.anamnesis_shared THEN p.anamnesis->>'sex' END)
    FROM luminix.client_profiles p
    JOIN luminix.clinic_clients cc ON cc.client_profile_id = p.id
      AND cc.status = 'active' AND cc.client_removed_at IS NULL
    JOIN luminix.clinics c ON c.id = cc.clinic_id AND c.status = 'active'
   WHERE p.identity_id = luminix.client_identity() AND c.slug = p_slug
$$;

-- Ownership check shared by the write functions below.
CREATE FUNCTION luminix.client_owns_record(p_clinic uuid, p_client uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT p_clinic = luminix.current_clinic_id() AND EXISTS (
    SELECT 1 FROM luminix.clinic_clients cc
      JOIN luminix.client_profiles p ON p.id = cc.client_profile_id
     WHERE cc.clinic_id = p_clinic AND cc.id = p_client AND cc.status = 'active'
       AND cc.client_removed_at IS NULL AND p.identity_id = luminix.client_identity())
$$;

-- Final, race-safe checks for a client booking. Availability windows are computed by the API;
-- this function guarantees ownership, catalog state, the future and no double booking.
CREATE FUNCTION luminix.client_book_appointment(
  p_clinic uuid, p_client uuid, p_service uuid, p_professional uuid,
  p_starts_at timestamptz, p_ends_at timestamptz, p_payment text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_mode text; v_id uuid;
BEGIN
  IF NOT luminix.client_owns_record(p_clinic, p_client) THEN
    RAISE EXCEPTION 'Client access denied' USING ERRCODE = '42501';
  END IF;
  IF p_starts_at IS NULL OR p_ends_at <= p_starts_at OR p_starts_at <= now() THEN
    RAISE EXCEPTION 'Invalid appointment time' USING ERRCODE = '22023';
  END IF;
  SELECT booking_mode INTO v_mode FROM luminix.services
   WHERE clinic_id = p_clinic AND id = p_service AND status = 'active';
  IF v_mode IS NULL OR v_mode = 'manual_release' THEN
    RAISE EXCEPTION 'Service unavailable' USING ERRCODE = '22023';
  END IF;
  IF p_professional IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM luminix.professionals WHERE clinic_id = p_clinic AND id = p_professional AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Professional unavailable' USING ERRCODE = '22023';
  END IF;
  -- One booking at a time per agenda, so two clients cannot take the same slot.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_clinic::text || coalesce(p_professional::text, ''), 0));
  IF EXISTS (
    SELECT 1 FROM luminix.appointments
     WHERE clinic_id = p_clinic AND status IN ('scheduled', 'confirmed')
       AND starts_at < p_ends_at AND ends_at > p_starts_at
       AND (p_professional IS NULL OR professional_id = p_professional)
  ) THEN
    RAISE EXCEPTION 'Slot taken' USING ERRCODE = '23P01';
  END IF;
  INSERT INTO luminix.appointments
    (clinic_id, clinic_client_id, service_id, professional_id, starts_at, ends_at, status,
     booking_source, client_payment_method)
  VALUES (p_clinic, p_client, p_service, p_professional, p_starts_at, p_ends_at,
    CASE WHEN v_mode = 'instant' THEN 'confirmed' ELSE 'scheduled' END, 'client', p_payment)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE FUNCTION luminix.client_cancel_appointment(p_clinic uuid, p_client uuid, p_appointment uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_starts timestamptz; v_policy luminix.booking_policies%ROWTYPE;
BEGIN
  IF NOT luminix.client_owns_record(p_clinic, p_client) THEN
    RAISE EXCEPTION 'Client access denied' USING ERRCODE = '42501';
  END IF;
  SELECT starts_at INTO v_starts FROM luminix.appointments
   WHERE clinic_id = p_clinic AND id = p_appointment AND clinic_client_id = p_client
     AND status IN ('scheduled', 'confirmed') FOR UPDATE;
  IF v_starts IS NULL OR v_starts <= now() THEN
    RAISE EXCEPTION 'Appointment not found' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_policy FROM luminix.booking_policies WHERE clinic_id = p_clinic;
  IF FOUND AND (NOT v_policy.allow_client_cancellation
    OR v_starts - make_interval(mins => v_policy.cancellation_notice_minutes) < now()) THEN
    RAISE EXCEPTION 'Cancellation closed' USING ERRCODE = 'P0001';
  END IF;
  UPDATE luminix.appointments SET status = 'canceled', updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment;
END $$;

CREATE FUNCTION luminix.client_reschedule_appointment(
  p_clinic uuid, p_client uuid, p_appointment uuid, p_starts_at timestamptz, p_ends_at timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_row luminix.appointments%ROWTYPE; v_notice integer;
BEGIN
  IF NOT luminix.client_owns_record(p_clinic, p_client) THEN
    RAISE EXCEPTION 'Client access denied' USING ERRCODE = '42501';
  END IF;
  IF p_starts_at IS NULL OR p_ends_at <= p_starts_at OR p_starts_at <= now() THEN
    RAISE EXCEPTION 'Invalid appointment time' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM luminix.appointments
   WHERE clinic_id = p_clinic AND id = p_appointment AND clinic_client_id = p_client
     AND status IN ('scheduled', 'confirmed') FOR UPDATE;
  IF NOT FOUND OR v_row.starts_at <= now() THEN
    RAISE EXCEPTION 'Appointment not found' USING ERRCODE = '22023';
  END IF;
  SELECT rescheduling_notice_minutes INTO v_notice FROM luminix.booking_policies WHERE clinic_id = p_clinic;
  IF v_notice IS NOT NULL AND v_row.starts_at - make_interval(mins => v_notice) < now() THEN
    RAISE EXCEPTION 'Rescheduling closed' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_clinic::text || coalesce(v_row.professional_id::text, ''), 0));
  IF EXISTS (
    SELECT 1 FROM luminix.appointments
     WHERE clinic_id = p_clinic AND id <> p_appointment AND status IN ('scheduled', 'confirmed')
       AND starts_at < p_ends_at AND ends_at > p_starts_at
       AND (v_row.professional_id IS NULL OR professional_id = v_row.professional_id)
  ) THEN
    RAISE EXCEPTION 'Slot taken' USING ERRCODE = '23P01';
  END IF;
  UPDATE luminix.appointments
     SET previous_starts_at = starts_at, starts_at = p_starts_at, ends_at = p_ends_at,
         rescheduled_at = now(), updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment;
END $$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'luminix.client_identity()', 'luminix.client_profile_id()', 'luminix.client_me()',
    'luminix.client_save_profile(text, text, text)',
    'luminix.client_save_anamnesis(text, jsonb, text)',
    'luminix.client_join_clinic(text, boolean)', 'luminix.client_leave_clinic(text)',
    'luminix.client_clinic_scope(text)', 'luminix.client_owns_record(uuid, uuid)',
    'luminix.client_book_appointment(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text)',
    'luminix.client_cancel_appointment(uuid, uuid, uuid)',
    'luminix.client_reschedule_appointment(uuid, uuid, uuid, timestamptz, timestamptz)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO luminix_api', fn);
  END LOOP;
END $$;

GRANT SELECT ON luminix.promotions, luminix.promotion_services TO luminix_api;
