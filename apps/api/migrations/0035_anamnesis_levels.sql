-- Anamnesis levels (ADR-030): each space requires level I, II or III; the record keeps the
-- answers of every step it went through (version 2: {version, level, answeredAt, answers}).
-- Records of levels II–III expire after 365 days. Additive: one nullable column, replaced
-- client functions with the same arguments.

-- Explicit choice of the space (future setting in the admin). NULL derives from the services.
ALTER TABLE luminix.clinic_profiles
  ADD COLUMN anamnesis_level smallint CHECK (anamnesis_level IS NULL OR anamnesis_level BETWEEN 1 AND 3);

-- Highest level among the active services: a salon that also does skin care asks for level III.
CREATE FUNCTION luminix.clinic_anamnesis_level(p_clinic uuid)
RETURNS smallint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce(
    (SELECT anamnesis_level FROM luminix.clinic_profiles WHERE clinic_id = p_clinic),
    (SELECT max(CASE
        WHEN luminix.fold(coalesce(s.category, '') || ' ' || s.name)
          ~ '(estetic|facial|corporal|massag|massot|quiropr|harmoniz|biomed|peeling|laser|drenag|limpeza de pele|microagulh)'
          THEN 3
        WHEN luminix.fold(coalesce(s.category, '') || ' ' || s.name)
          ~ '(unha|manicure|pedicure|nail|sobrancel|cilio|depil|tatu|tattoo|piercing|micropig|lash|cera)'
          THEN 2
        ELSE 1 END)::smallint
       FROM luminix.services s WHERE s.clinic_id = p_clinic AND s.status = 'active'),
    1::smallint)
$$;

-- Sex and birth date live in `answers` since version 2; version 1 kept them at the top.
CREATE FUNCTION luminix.anamnesis_field(p_record jsonb, p_key text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(p_record->'answers'->>p_key, p_record->>p_key)
$$;

CREATE OR REPLACE FUNCTION luminix.client_me()
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
          'requiredLevel', luminix.clinic_anamnesis_level(c.id),
          'linkedAt', cc.created_at) ORDER BY cc.created_at)
        FROM luminix.client_profiles p
        JOIN luminix.clinic_clients cc ON cc.client_profile_id = p.id
          AND cc.status = 'active' AND cc.client_removed_at IS NULL
        JOIN luminix.clinics c ON c.id = cc.clinic_id AND c.status = 'active'
       WHERE p.identity_id = luminix.client_identity()), '[]'::jsonb)
  )
$$;

CREATE OR REPLACE FUNCTION luminix.client_save_anamnesis(p_slug text, p_record jsonb, p_photo text)
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
    UPDATE luminix.clinic_clients
       SET sex = luminix.anamnesis_field(p_record, 'sex'),
           birth_date = luminix.anamnesis_field(p_record, 'birthDate')::date
     WHERE client_profile_id = v_profile AND anamnesis_shared;
    RETURN;
  END IF;
  UPDATE luminix.clinic_clients cc
     SET client_anamnesis = p_record, client_photo_data = p_photo, anamnesis_shared = false,
         sex = luminix.anamnesis_field(p_record, 'sex'),
         birth_date = luminix.anamnesis_field(p_record, 'birthDate')::date
    FROM luminix.clinics c
   WHERE c.id = cc.clinic_id AND c.slug = p_slug AND cc.client_profile_id = v_profile
     AND cc.client_removed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Space not linked' USING ERRCODE = '22023'; END IF;
END $$;

CREATE OR REPLACE FUNCTION luminix.client_join_clinic(p_slug text, p_share boolean)
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
    CASE WHEN p_share THEN luminix.anamnesis_field(v_profile.anamnesis, 'sex') END,
    CASE WHEN p_share THEN luminix.anamnesis_field(v_profile.anamnesis, 'birthDate')::date END)
  ON CONFLICT (clinic_id, client_profile_id) DO UPDATE SET
    client_removed_at = NULL,
    anamnesis_shared = CASE WHEN luminix.clinic_clients.client_removed_at IS NULL
      THEN luminix.clinic_clients.anamnesis_shared ELSE EXCLUDED.anamnesis_shared END;
END $$;

-- The scope now also returns what the booking check needs: the level the space requires and the
-- record it reads (account record when shared, else its own).
DROP FUNCTION luminix.client_clinic_scope(text);
CREATE FUNCTION luminix.client_clinic_scope(p_slug text)
RETURNS TABLE (clinic_id uuid, clinic_client_id uuid, client_sex text, required_level smallint,
  anamnesis jsonb, has_photo boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT c.id, cc.id,
         coalesce(cc.sex, CASE WHEN cc.anamnesis_shared THEN luminix.anamnesis_field(p.anamnesis, 'sex') END),
         luminix.clinic_anamnesis_level(c.id),
         CASE WHEN cc.anamnesis_shared THEN p.anamnesis ELSE cc.client_anamnesis END,
         CASE WHEN cc.anamnesis_shared THEN p.photo_data IS NOT NULL ELSE cc.client_photo_data IS NOT NULL END
    FROM luminix.client_profiles p
    JOIN luminix.clinic_clients cc ON cc.client_profile_id = p.id
      AND cc.status = 'active' AND cc.client_removed_at IS NULL
    JOIN luminix.clinics c ON c.id = cc.clinic_id AND c.status = 'active'
   WHERE p.identity_id = luminix.client_identity() AND c.slug = p_slug
$$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'luminix.clinic_anamnesis_level(uuid)', 'luminix.anamnesis_field(jsonb, text)',
    'luminix.client_clinic_scope(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO luminix_api', fn);
  END LOOP;
END $$;
