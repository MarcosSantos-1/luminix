-- Onboarding steps: hours, payments, rules; professional weekly availability at completion.

CREATE TABLE luminix.professional_weekly_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  professional_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_available boolean NOT NULL DEFAULT false,
  periods jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    luminix.valid_schedule_periods(periods)
    AND (is_available OR periods = '[]'::jsonb)
  ),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  UNIQUE (clinic_id, professional_id, weekday),
  FOREIGN KEY (clinic_id, professional_id) REFERENCES luminix.professionals(clinic_id, id)
);

ALTER TABLE luminix.professional_weekly_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.professional_weekly_availability FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.professional_weekly_availability
  USING (clinic_id = luminix.current_clinic_id())
  WITH CHECK (clinic_id = luminix.current_clinic_id());
CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.professional_weekly_availability
  FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.professional_weekly_availability
  FOR EACH ROW EXECUTE FUNCTION luminix.audit_change();

GRANT SELECT ON luminix.professional_weekly_availability TO luminix_api;

CREATE OR REPLACE FUNCTION luminix.business_day_to_periods(v_item jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE
  v_breaks jsonb; v_break jsonb; v_periods jsonb; v_cursor text; v_index integer;
BEGIN
  IF jsonb_typeof(v_item) <> 'object' OR coalesce((v_item->>'enabled')::boolean, false) IS NOT TRUE THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT coalesce(jsonb_agg(opened.value ORDER BY opened.value->>'start'), '[]'::jsonb)
    INTO v_breaks
    FROM jsonb_array_elements(coalesce(v_item->'breaks', '[]'::jsonb)) AS opened(value);
  v_periods := '[]'::jsonb;
  v_cursor := v_item->>'start';
  IF jsonb_array_length(v_breaks) > 0 THEN
    FOR v_index IN 0 .. jsonb_array_length(v_breaks) - 1 LOOP
      v_break := v_breaks->v_index;
      IF (v_break->>'start')::time > v_cursor::time THEN
        v_periods := v_periods || jsonb_build_array(jsonb_build_object('start', v_cursor, 'end', v_break->>'start'));
      END IF;
      v_cursor := v_break->>'end';
    END LOOP;
  END IF;
  IF v_cursor::time < (v_item->>'end')::time THEN
    v_periods := v_periods || jsonb_build_array(jsonb_build_object('start', v_cursor, 'end', v_item->>'end'));
  END IF;
  RETURN v_periods;
END $$;

ALTER TABLE luminix.onboarding_drafts DROP CONSTRAINT onboarding_drafts_step_check;
ALTER TABLE luminix.onboarding_drafts ADD CONSTRAINT onboarding_drafts_step_check
  CHECK (step IN (
    'contact','clinic','catalog','services','structure','schedule',
    'hours','payments','rules','preferences','review'
  )) NOT VALID;

UPDATE luminix.onboarding_drafts SET step = 'payments' WHERE step = 'preferences';
ALTER TABLE luminix.onboarding_drafts VALIDATE CONSTRAINT onboarding_drafts_step_check;

CREATE OR REPLACE FUNCTION luminix.save_onboarding_draft(p_clinic uuid, p_expected_version integer, p_step text, p_payload jsonb)
RETURNS TABLE (draft_version integer, draft_step text, draft_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_draft luminix.onboarding_drafts%ROWTYPE; v_inserted uuid; v_progress integer; v_step text;
BEGIN
  v_step := CASE WHEN p_step = 'preferences' THEN 'payments' ELSE p_step END;
  IF p_clinic IS DISTINCT FROM nullif(current_setting('luminix.clinic_id', true), '')::uuid
    OR p_expected_version IS NULL OR p_expected_version < 0
    OR v_step IS NULL OR v_step NOT IN (
      'contact','clinic','catalog','services','structure','schedule',
      'hours','payments','rules','review'
    )
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR pg_column_size(p_payload) > 131072 THEN
    RAISE EXCEPTION 'Invalid draft' USING ERRCODE = '22023';
  END IF;
  SELECT membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'onboarding:manage');
  PERFORM 1 FROM luminix.clinics c WHERE c.id = p_clinic AND c.status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Clinic already active' USING ERRCODE = '23505'; END IF;
  INSERT INTO luminix.onboarding_drafts (clinic_id, created_by_membership_id, format_version)
    VALUES (p_clinic, v_member, 2) ON CONFLICT (clinic_id) DO NOTHING RETURNING id INTO v_inserted;
  SELECT * INTO v_draft FROM luminix.onboarding_drafts WHERE clinic_id = p_clinic FOR UPDATE;
  IF (p_expected_version = 0 AND v_inserted IS NULL)
    OR (p_expected_version > 0 AND v_draft.version <> p_expected_version)
    OR v_draft.status <> 'draft' THEN RAISE EXCEPTION 'Draft conflict' USING ERRCODE = '23505'; END IF;
  v_progress := CASE v_step
    WHEN 'contact' THEN 0 WHEN 'clinic' THEN 10 WHEN 'catalog' THEN 20 WHEN 'services' THEN 30
    WHEN 'structure' THEN 40 WHEN 'schedule' THEN 50 WHEN 'hours' THEN 60 WHEN 'payments' THEN 70
    WHEN 'rules' THEN 80 ELSE 100 END;
  UPDATE luminix.onboarding_drafts d SET step = v_step, payload = p_payload, progress = v_progress,
    last_activity_at = now(), version = CASE WHEN v_inserted IS NOT NULL THEN 1 ELSE d.version + 1 END
    WHERE d.clinic_id = p_clinic RETURNING * INTO v_draft;
  RETURN QUERY SELECT v_draft.version, v_draft.step, v_draft.payload;
END $$;

CREATE OR REPLACE FUNCTION luminix.complete_onboarding(p_clinic uuid, p_expected_version integer)
RETURNS TABLE (clinic_name text, clinic_status text, clinic_share_code text, draft_version integer, replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_draft luminix.onboarding_drafts%ROWTYPE; v_name text; v_owner text; v_email text; v_phone text;
  v_clinic jsonb; v_prefs jsonb; v_item jsonb; v_prof jsonb; v_service_id uuid; v_prof_id uuid; v_location uuid; v_resource uuid; v_service_name text;
  v_breaks jsonb; v_break jsonb; v_periods jsonb; v_cursor text; v_index integer;
  v_sched jsonb; v_days jsonb; v_day jsonb; v_prof_name text;
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
      OR coalesce(v_item->>'audience','') NOT IN ('all','women','men') THEN
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
      OR jsonb_typeof(v_prof->'serviceNames') <> 'array' THEN
      RAISE EXCEPTION 'Invalid professional' USING ERRCODE = '22023';
    END IF;
    v_prof_name := trim(v_prof->>'name');
    INSERT INTO luminix.professionals (clinic_id, display_name, role_name, audience)
    VALUES (p_clinic, v_prof_name, nullif(trim(v_prof->>'role'),''), coalesce(v_prof->>'audience','all')) RETURNING id INTO v_prof_id;
    FOR v_service_name IN SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(v_prof->'serviceNames','[]'::jsonb)) LOOP
      INSERT INTO luminix.professional_services (clinic_id, professional_id, service_id)
      SELECT p_clinic, v_prof_id, s.id FROM luminix.services s WHERE s.clinic_id = p_clinic AND lower(s.name) = lower(v_service_name) LIMIT 1
      ON CONFLICT DO NOTHING;
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
  UPDATE luminix.clinics SET name = v_name, status = 'active', share_code = 'LX-' || upper(substr(replace(id::text,'-',''),1,12)) WHERE id = p_clinic AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Clinic already active' USING ERRCODE = '23505'; END IF;
  UPDATE luminix.onboarding_drafts SET status = 'completed', step = 'review', progress = 100, completed_at = now(), last_activity_at = now() WHERE clinic_id = p_clinic;
  RETURN QUERY SELECT c.name, c.status, c.share_code, v_draft.version, false FROM luminix.clinics c WHERE c.id = p_clinic;
END $$;
