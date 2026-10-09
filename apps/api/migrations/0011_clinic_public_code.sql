-- Short public clinic code for URLs. The UUID primary key stays in place.

CREATE FUNCTION luminix.next_clinic_code()
RETURNS text
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog AS $$
DECLARE v_letters text; v_number integer;
BEGIN
  LOOP
    v_letters := chr(65 + floor(random() * 26)::integer) || chr(65 + floor(random() * 26)::integer);
    EXIT WHEN v_letters <> ALL (ARRAY['CU', 'KU', 'FU', 'SH']);
  END LOOP;
  v_number := floor(random() * 10000)::integer;
  RETURN v_letters || '-' || lpad(v_number::text, 4, '0');
END $$;
REVOKE ALL ON FUNCTION luminix.next_clinic_code() FROM PUBLIC;

DO $$
DECLARE v_name text;
BEGIN
  SELECT conname INTO v_name
    FROM pg_constraint
    WHERE conrelid = 'luminix.clinics'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%share_code%';
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE luminix.clinics DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

ALTER TABLE luminix.clinics NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE r record; v_code text; v_try integer;
BEGIN
  FOR r IN
    SELECT id FROM luminix.clinics
    WHERE share_code IS NULL OR share_code !~ '^[A-Z]{2}-[0-9]{4}$'
  LOOP
    v_try := 0;
    LOOP
      v_try := v_try + 1;
      v_code := luminix.next_clinic_code();
      BEGIN
        UPDATE luminix.clinics
          SET share_code = v_code, slug = lower(v_code)
          WHERE id = r.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF v_try >= 30 THEN RAISE; END IF;
      END;
    END LOOP;
  END LOOP;
END $$;
ALTER TABLE luminix.clinics FORCE ROW LEVEL SECURITY;

ALTER TABLE luminix.clinics ADD CONSTRAINT clinics_share_code_check
  CHECK (
    share_code IS NULL
    OR (
      share_code ~ '^[A-Z]{2}-[0-9]{4}$'
      AND substring(share_code FROM 1 FOR 2) <> ALL (ARRAY['CU', 'KU', 'FU', 'SH'])
    )
  );

CREATE POLICY clinic_code_lookup ON luminix.clinics
  FOR SELECT
  USING (
    share_code IS NOT NULL
    AND share_code = nullif(current_setting('luminix.lookup_clinic_code', true), '')
  );

CREATE FUNCTION luminix.resolve_clinic_ref(p_ref text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog AS $$
DECLARE v_id uuid; v_code text;
BEGIN
  IF p_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN p_ref::uuid;
  END IF;
  v_code := upper(p_ref);
  IF v_code !~ '^[A-Z]{2}-[0-9]{4}$' THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('luminix.lookup_clinic_code', v_code, true);
  SELECT id INTO v_id FROM luminix.clinics WHERE share_code = v_code;
  PERFORM set_config('luminix.lookup_clinic_code', '', true);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION luminix.resolve_clinic_ref(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.resolve_clinic_ref(text) TO luminix_api;

DROP FUNCTION luminix.bootstrap_owner_clinic(uuid, text);
CREATE FUNCTION luminix.bootstrap_owner_clinic(p_identity uuid, p_name text)
RETURNS TABLE (clinic_id uuid, clinic_name text, clinic_slug text, clinic_status text, created boolean, clinic_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_clinic uuid;
  v_role uuid;
  v_request text;
  v_code text;
  v_attempt integer;
  v_previous_identity text := current_setting('luminix.identity_id', true);
  v_previous_clinic text := current_setting('luminix.clinic_id', true);
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Invalid clinic name' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.identities i WHERE i.id = p_identity AND i.status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Identity unavailable' USING ERRCODE = '42501'; END IF;
  PERFORM set_config('luminix.identity_id', p_identity::text, true);
  SELECT b.clinic_id, b.request_name INTO v_clinic, v_request
    FROM luminix.owner_clinic_bootstraps b WHERE b.identity_id = p_identity;
  IF FOUND THEN
    PERFORM set_config('luminix.clinic_id', v_clinic::text, true);
    PERFORM 1 FROM luminix.clinic_memberships m
      JOIN luminix.roles r ON r.clinic_id = m.clinic_id AND r.id = m.role_id
      JOIN luminix.clinics c ON c.id = m.clinic_id
      JOIN luminix.role_permissions p ON p.clinic_id = r.clinic_id AND p.role_id = r.id
      WHERE m.identity_id = p_identity AND m.clinic_id = v_clinic
        AND m.status = 'active' AND r.name = 'owner' AND c.status IN ('draft', 'active')
        AND p.permission_code = 'clinic:manage'
      FOR SHARE OF m, r, c, p;
    IF NOT FOUND THEN RAISE EXCEPTION 'Owner access unavailable' USING ERRCODE = '42501'; END IF;
    IF v_request <> trim(p_name) THEN RAISE EXCEPTION 'Bootstrap conflict' USING ERRCODE = '22023'; END IF;
    RETURN QUERY SELECT c.id, c.name, c.slug, c.status, false, c.share_code FROM luminix.clinics c WHERE c.id = v_clinic;
  ELSE
    v_clinic := gen_random_uuid();
    v_role := gen_random_uuid();
    PERFORM set_config('luminix.clinic_id', v_clinic::text, true);
    v_attempt := 0;
    LOOP
      v_attempt := v_attempt + 1;
      v_code := luminix.next_clinic_code();
      BEGIN
        INSERT INTO luminix.clinics (id, name, slug, status, share_code)
          VALUES (v_clinic, trim(p_name), lower(v_code), 'draft', v_code);
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF v_attempt >= 30 THEN RAISE; END IF;
      END;
    END LOOP;
    INSERT INTO luminix.roles (id, clinic_id, name) VALUES (v_role, v_clinic, 'owner');
    INSERT INTO luminix.role_permissions (clinic_id, role_id, permission_code)
      SELECT v_clinic, v_role, p FROM unnest(ARRAY[
        'clinic:manage', 'team:manage', 'client:read', 'client:manage', 'professional:manage',
        'service:manage', 'settings:manage', 'onboarding:manage', 'audit:read'
      ]) AS p;
    INSERT INTO luminix.clinic_memberships (clinic_id, identity_id, role_id, status)
      VALUES (v_clinic, p_identity, v_role, 'active');
    INSERT INTO luminix.clinic_settings (clinic_id) VALUES (v_clinic);
    INSERT INTO luminix.owner_clinic_bootstraps (identity_id, clinic_id, request_name)
      VALUES (p_identity, v_clinic, trim(p_name));
    RETURN QUERY SELECT c.id, c.name, c.slug, c.status, true, c.share_code FROM luminix.clinics c WHERE c.id = v_clinic;
  END IF;
  PERFORM set_config('luminix.identity_id', coalesce(v_previous_identity, ''), true);
  PERFORM set_config('luminix.clinic_id', coalesce(v_previous_clinic, ''), true);
END $$;
REVOKE ALL ON FUNCTION luminix.bootstrap_owner_clinic(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.bootstrap_owner_clinic(uuid, text) TO luminix_api;

DROP FUNCTION luminix.list_staff_clinics(uuid, uuid);
CREATE FUNCTION luminix.list_staff_clinics(p_identity uuid, p_after uuid DEFAULT NULL)
RETURNS TABLE (clinic_id uuid, clinic_name text, clinic_status text, role_name text, clinic_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT c.id, c.name, c.status, r.name, c.share_code
    FROM luminix.clinic_memberships m
    JOIN luminix.identities i ON i.id = m.identity_id AND i.status = 'active'
    JOIN luminix.clinics c ON c.id = m.clinic_id AND c.status IN ('draft', 'active')
    JOIN luminix.roles r ON r.clinic_id = m.clinic_id AND r.id = m.role_id
    WHERE m.identity_id = p_identity AND m.status = 'active' AND (p_after IS NULL OR c.id > p_after)
    ORDER BY c.id LIMIT 51
$$;
REVOKE ALL ON FUNCTION luminix.list_staff_clinics(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.list_staff_clinics(uuid, uuid) TO luminix_api;

CREATE OR REPLACE FUNCTION luminix.complete_onboarding(p_clinic uuid, p_expected_version integer)
RETURNS TABLE (clinic_name text, clinic_status text, clinic_share_code text, draft_version integer, replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_draft luminix.onboarding_drafts%ROWTYPE; v_name text; v_owner text; v_email text; v_phone text;
  v_clinic jsonb; v_prefs jsonb; v_item jsonb; v_prof jsonb; v_service_id uuid; v_prof_id uuid; v_location uuid; v_resource uuid; v_service_name text;
  v_breaks jsonb; v_break jsonb; v_periods jsonb; v_cursor text; v_index integer;
  v_sched jsonb; v_days jsonb; v_day jsonb; v_prof_name text; v_service_item jsonb; v_link_audience text;
BEGIN
  IF p_clinic IS DISTINCT FROM nullif(current_setting('luminix.clinic_id', true), '')::uuid OR p_expected_version IS NULL OR p_expected_version < 1
    THEN RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'onboarding:manage');
  SELECT * INTO v_draft FROM luminix.onboarding_drafts WHERE clinic_id = p_clinic FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft missing' USING ERRCODE = '22023'; END IF;
  IF v_draft.status = 'completed' THEN
    RETURN QUERY SELECT c.name, c.status, c.share_code, v_draft.version, true FROM luminix.clinics c WHERE c.id = p_clinic; RETURN;
  END IF;
  IF v_draft.status <> 'draft' OR v_draft.version <> p_expected_version OR v_draft.format_version <> 2
    THEN RAISE EXCEPTION 'Draft conflict' USING ERRCODE = '23505'; END IF;
  v_name := trim(v_draft.payload->>'name'); v_owner := trim(v_draft.payload->>'ownerName');
  v_email := lower(trim(v_draft.payload->>'email')); v_phone := trim(v_draft.payload->>'phone');
  v_clinic := coalesce(v_draft.payload->'clinic','{}'::jsonb); v_prefs := coalesce(v_draft.payload->'preferences','{}'::jsonb);
  IF length(v_name) NOT BETWEEN 1 AND 160 OR length(v_owner) NOT BETWEEN 1 AND 120
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR v_phone !~ '^\+[1-9][0-9]{7,14}$'
    OR (coalesce(v_clinic->>'whatsapp','') <> '' AND v_clinic->>'whatsapp' !~ '^\+[1-9][0-9]{7,14}$')
    OR (coalesce(v_clinic->>'foundedYear','') <> '' AND ((v_clinic->>'foundedYear') !~ '^[0-9]{4}$' OR (v_clinic->>'foundedYear')::integer NOT BETWEEN 1800 AND 2200))
    OR (coalesce(v_clinic->>'state','') <> '' AND upper(v_clinic->>'state') !~ '^[A-Z]{2}$')
    OR (coalesce(v_clinic->>'postalCode','') <> '' AND regexp_replace(v_clinic->>'postalCode','[^0-9]','','g') !~ '^[0-9]{8}$')
    OR (coalesce(v_clinic->>'taxId','') <> '' AND length(regexp_replace(v_clinic->>'taxId','[^0-9]','','g')) NOT BETWEEN 11 AND 14)
    OR jsonb_typeof(v_draft.payload->'services') <> 'array' OR jsonb_array_length(v_draft.payload->'services') < 1
    OR jsonb_array_length(v_draft.payload->'services') > 80 OR jsonb_typeof(v_draft.payload->'professionals') <> 'array'
    OR jsonb_array_length(v_draft.payload->'professionals') > 30 OR jsonb_typeof(v_draft.payload->'businessHours') <> 'array'
    OR jsonb_array_length(v_draft.payload->'businessHours') <> 7
    OR (SELECT count(DISTINCT value->>'weekday') FROM jsonb_array_elements(v_draft.payload->'businessHours')) <> 7
    OR coalesce(v_prefs->>'cancellationHours','') !~ '^[0-9]{1,3}$'
    OR (v_prefs->>'cancellationHours')::integer NOT BETWEEN 0 AND 168
    OR coalesce(v_prefs->>'specialCancellationHours','') !~ '^[0-9]{1,3}$'
    OR (v_prefs->>'specialCancellationHours')::integer NOT BETWEEN 0 AND 336
    OR jsonb_typeof(v_prefs->'acceptInApp') <> 'boolean'
    OR coalesce(v_prefs->>'packagePaymentMode','') NOT IN ('clinic_only','in_app','both')
    OR (NOT coalesce((v_prefs->>'acceptInApp')::boolean,false) AND coalesce(v_prefs->>'packagePaymentMode','clinic_only') <> 'clinic_only')
    THEN RAISE EXCEPTION 'Invalid onboarding data' USING ERRCODE = '22023'; END IF;

  INSERT INTO luminix.clinic_profiles (clinic_id, owner_name, contact_email, contact_phone, whatsapp_phone, founded_year, tax_id, instagram, facebook, website)
  VALUES (p_clinic, v_owner, v_email, v_phone, nullif(v_clinic->>'whatsapp',''), nullif(v_clinic->>'foundedYear','')::integer,
    nullif(regexp_replace(v_clinic->>'taxId','[^0-9]','','g'),''), nullif(v_clinic->>'instagram',''), nullif(v_clinic->>'facebook',''), nullif(v_clinic->>'website',''));
  INSERT INTO luminix.locations (clinic_id, name, address_line, city, state, postal_code, is_primary)
  VALUES (p_clinic, 'Principal', nullif(v_clinic->>'addressLine',''), nullif(v_clinic->>'city',''), nullif(upper(v_clinic->>'state'),''), nullif(regexp_replace(v_clinic->>'postalCode','[^0-9]','','g'),''), true)
  RETURNING id INTO v_location;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_draft.payload->'businessHours') LOOP
    IF jsonb_typeof(v_item) <> 'object' OR (v_item->>'weekday') !~ '^[0-6]$'
      OR (v_item->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      OR (v_item->>'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      OR (coalesce((v_item->>'enabled')::boolean,false) AND (v_item->>'start')::time >= (v_item->>'end')::time)
      OR (v_item->'breaks' IS NOT NULL AND jsonb_typeof(v_item->'breaks') <> 'array')
      OR jsonb_array_length(coalesce(v_item->'breaks','[]'::jsonb)) > 4 THEN
      RAISE EXCEPTION 'Invalid business hours' USING ERRCODE = '22023';
    END IF;
    v_periods := luminix.business_day_to_periods(v_item);
    IF coalesce((v_item->>'enabled')::boolean,false) THEN
      INSERT INTO luminix.business_hours (clinic_id, location_id, weekday, starts_at, ends_at)
      VALUES (p_clinic, v_location, (v_item->>'weekday')::smallint, (v_item->>'start')::time, (v_item->>'end')::time);
    END IF;
    INSERT INTO luminix.weekly_availability (clinic_id, weekday, is_available, periods)
    VALUES (
      p_clinic,
      (v_item->>'weekday')::smallint,
      coalesce((v_item->>'enabled')::boolean,false),
      CASE WHEN coalesce((v_item->>'enabled')::boolean,false) THEN v_periods ELSE '[]'::jsonb END
    );
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_draft.payload->'occupations') LOOP
    IF jsonb_typeof(v_item) <> 'string' OR length(trim(v_item #>> '{}')) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Invalid occupation' USING ERRCODE = '22023';
    END IF;
    INSERT INTO luminix.occupations (clinic_id, name) VALUES (p_clinic, trim(v_item #>> '{}')) ON CONFLICT (clinic_id, name) DO NOTHING;
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_draft.payload->'services') LOOP
    IF jsonb_typeof(v_item) <> 'object' OR length(trim(v_item->>'name')) NOT BETWEEN 1 AND 160
      OR length(trim(v_item->>'category')) NOT BETWEEN 1 AND 120 OR (v_item->>'priceCents') !~ '^[0-9]{1,9}$'
      OR (v_item->>'durationMinutes') !~ '^[0-9]{1,4}$' OR (v_item->>'durationMinutes')::integer NOT BETWEEN 1 AND 1440
      OR coalesce(v_item->>'priceType','') NOT IN ('fixed','from','quote')
      OR coalesce(v_item->>'bookingMode','') NOT IN ('instant','request','manual_release')
      OR coalesce(v_item->>'audience','') NOT IN ('all','women','men') OR (v_item ? 'sensitive' AND jsonb_typeof(v_item->'sensitive') <> 'boolean') THEN
      RAISE EXCEPTION 'Invalid service' USING ERRCODE = '22023';
    END IF;
    INSERT INTO luminix.services (clinic_id, name, category, description, price_cents, duration_minutes, price_type, booking_mode, audience, cancellation_notice_minutes)
    VALUES (p_clinic, trim(v_item->>'name'), nullif(trim(v_item->>'category'),''), nullif(trim(v_item->>'description'),''),
      (v_item->>'priceCents')::integer, (v_item->>'durationMinutes')::integer, coalesce(v_item->>'priceType','fixed'),
      coalesce(v_item->>'bookingMode','instant'), coalesce(v_item->>'audience','all'),
      CASE WHEN nullif(v_item->>'cancellationHours','') IS NULL THEN NULL ELSE (v_item->>'cancellationHours')::integer * 60 END)
    RETURNING id INTO v_service_id;
    IF nullif(trim(v_item->>'resourceName'),'') IS NOT NULL THEN
      INSERT INTO luminix.resources (clinic_id, location_id, name, type, availability_mode)
      VALUES (p_clinic, v_location, trim(v_item->>'resourceName'), 'equipment', 'manual_release')
      ON CONFLICT (clinic_id, name) DO UPDATE SET name = excluded.name RETURNING id INTO v_resource;
      INSERT INTO luminix.service_resources (clinic_id, service_id, resource_id) VALUES (p_clinic, v_service_id, v_resource);
    END IF;
  END LOOP;
  FOR v_prof IN SELECT value FROM jsonb_array_elements(v_draft.payload->'professionals') LOOP
    IF jsonb_typeof(v_prof) <> 'object' OR length(trim(v_prof->>'name')) NOT BETWEEN 1 AND 160
      OR length(trim(v_prof->>'role')) NOT BETWEEN 1 AND 120 OR coalesce(v_prof->>'audience','') NOT IN ('all','women','men')
      OR jsonb_typeof(v_prof->'serviceNames') <> 'array' OR (v_prof ? 'serviceAudiences' AND jsonb_typeof(v_prof->'serviceAudiences') <> 'object') THEN
      RAISE EXCEPTION 'Invalid professional' USING ERRCODE = '22023';
    END IF;
    v_prof_name := trim(v_prof->>'name');
    INSERT INTO luminix.professionals (clinic_id, display_name, role_name, audience)
    VALUES (p_clinic, v_prof_name, nullif(trim(v_prof->>'role'),''), coalesce(v_prof->>'audience','all')) RETURNING id INTO v_prof_id;
    IF v_prof ? 'serviceAudiences' AND EXISTS (
      SELECT 1 FROM jsonb_each_text(v_prof->'serviceAudiences') AS opened(key, value)
      WHERE opened.value NOT IN ('all','women','men') OR length(trim(opened.key)) NOT BETWEEN 1 AND 160
    ) THEN RAISE EXCEPTION 'Invalid professional' USING ERRCODE = '22023'; END IF;
    FOR v_service_name IN SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(v_prof->'serviceNames','[]'::jsonb)) LOOP
      v_link_audience := NULL;
      SELECT opened.value INTO v_service_item
        FROM jsonb_array_elements(v_draft.payload->'services') AS opened(value)
        WHERE lower(trim(opened.value->>'name')) = lower(trim(v_service_name))
        LIMIT 1;
      IF coalesce((v_service_item->>'sensitive')::boolean, false) THEN
        SELECT opened.value INTO v_link_audience
          FROM jsonb_each_text(coalesce(v_prof->'serviceAudiences','{}'::jsonb)) AS opened(key, value)
          WHERE lower(opened.key) = lower(trim(v_service_name))
          LIMIT 1;
        v_link_audience := coalesce(v_link_audience, v_service_item->>'audience', 'all');
        IF v_link_audience NOT IN ('all','women','men') THEN
          RAISE EXCEPTION 'Invalid professional' USING ERRCODE = '22023';
        END IF;
      END IF;
      INSERT INTO luminix.professional_services (clinic_id, professional_id, service_id, audience)
      SELECT p_clinic, v_prof_id, s.id, v_link_audience FROM luminix.services s
      WHERE s.clinic_id = p_clinic AND lower(s.name) = lower(trim(v_service_name)) LIMIT 1
      ON CONFLICT (clinic_id, professional_id, service_id) DO UPDATE SET audience = excluded.audience;
    END LOOP;
    SELECT entry.value INTO v_sched
      FROM jsonb_array_elements(coalesce(v_draft.payload->'professionalSchedules','[]'::jsonb)) AS entry(value)
      WHERE lower(trim(entry.value->>'name')) = lower(v_prof_name)
      LIMIT 1;
    IF v_sched IS NOT NULL AND jsonb_typeof(v_sched->'days') = 'array' AND jsonb_array_length(v_sched->'days') = 7 THEN
      v_days := v_sched->'days';
    ELSE
      v_days := v_draft.payload->'businessHours';
    END IF;
    FOR v_day IN SELECT value FROM jsonb_array_elements(v_days) LOOP
      IF jsonb_typeof(v_day) <> 'object' OR (v_day->>'weekday') !~ '^[0-6]$'
        OR (v_day->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        OR (v_day->>'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        OR (coalesce((v_day->>'enabled')::boolean,false) AND (v_day->>'start')::time >= (v_day->>'end')::time)
        OR jsonb_array_length(coalesce(v_day->'breaks','[]'::jsonb)) > 4 THEN
        RAISE EXCEPTION 'Invalid professional hours' USING ERRCODE = '22023';
      END IF;
      v_periods := luminix.business_day_to_periods(v_day);
      INSERT INTO luminix.professional_weekly_availability (clinic_id, professional_id, weekday, is_available, periods)
      VALUES (
        p_clinic,
        v_prof_id,
        (v_day->>'weekday')::smallint,
        coalesce((v_day->>'enabled')::boolean,false),
        CASE WHEN coalesce((v_day->>'enabled')::boolean,false) THEN v_periods ELSE '[]'::jsonb END
      );
    END LOOP;
  END LOOP;
  INSERT INTO luminix.booking_policies (clinic_id, cancellation_notice_minutes, special_cancellation_notice_minutes)
  VALUES (p_clinic, coalesce((v_prefs->>'cancellationHours')::integer,12) * 60, coalesce((v_prefs->>'specialCancellationHours')::integer,24) * 60);
  INSERT INTO luminix.payment_preferences (clinic_id, accept_in_app, provider, package_payment_mode)
  VALUES (p_clinic, coalesce((v_prefs->>'acceptInApp')::boolean,false), CASE WHEN coalesce((v_prefs->>'acceptInApp')::boolean,false) THEN 'stripe_connect' ELSE NULL END, coalesce(v_prefs->>'packagePaymentMode','clinic_only'));
  UPDATE luminix.clinics SET name = v_name, status = 'active' WHERE id = p_clinic AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Clinic already active' USING ERRCODE = '23505'; END IF;
  UPDATE luminix.onboarding_drafts SET status = 'completed', step = 'review', progress = 100, completed_at = now(), last_activity_at = now() WHERE clinic_id = p_clinic;
  RETURN QUERY SELECT c.name, c.status, c.share_code, v_draft.version, false FROM luminix.clinics c WHERE c.id = p_clinic;
END $$;
