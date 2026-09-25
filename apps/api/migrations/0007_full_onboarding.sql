-- Onboarding v2 persists configuration into tenant-owned domain tables.
-- The JSON payload remains a resumable draft only; it is not the source of truth after completion.
CREATE TABLE luminix.clinic_profiles (
  clinic_id uuid PRIMARY KEY REFERENCES luminix.clinics(id),
  owner_name text NOT NULL CHECK (length(trim(owner_name)) BETWEEN 1 AND 120),
  contact_email text NOT NULL CHECK (contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  contact_phone text NOT NULL CHECK (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_phone text CHECK (whatsapp_phone IS NULL OR whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$'),
  founded_year integer CHECK (founded_year IS NULL OR founded_year BETWEEN 1800 AND 2200),
  tax_id text CHECK (tax_id IS NULL OR length(tax_id) BETWEEN 11 AND 18),
  instagram text CHECK (instagram IS NULL OR length(instagram) <= 120),
  facebook text CHECK (facebook IS NULL OR length(facebook) <= 300),
  website text CHECK (website IS NULL OR length(website) <= 300),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE luminix.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  address_line text CHECK (address_line IS NULL OR length(address_line) <= 240),
  city text CHECK (city IS NULL OR length(city) <= 120),
  state text CHECK (state IS NULL OR state ~ '^[A-Z]{2}$'),
  postal_code text CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{8}$'),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id)
);
CREATE UNIQUE INDEX locations_one_primary ON luminix.locations(clinic_id) WHERE is_primary;

CREATE TABLE luminix.business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  location_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at time NOT NULL,
  ends_at time NOT NULL CHECK (ends_at > starts_at),
  FOREIGN KEY (clinic_id, location_id) REFERENCES luminix.locations(clinic_id, id),
  UNIQUE (clinic_id, location_id, weekday)
);

ALTER TABLE luminix.services
  ADD COLUMN category text CHECK (category IS NULL OR length(trim(category)) BETWEEN 1 AND 120),
  ADD COLUMN description text CHECK (description IS NULL OR length(description) <= 1200),
  ADD COLUMN price_type text NOT NULL DEFAULT 'fixed' CHECK (price_type IN ('fixed', 'from', 'quote')),
  ADD COLUMN booking_mode text NOT NULL DEFAULT 'instant' CHECK (booking_mode IN ('instant', 'request', 'manual_release')),
  ADD COLUMN audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'women', 'men')),
  ADD COLUMN cancellation_notice_minutes integer CHECK (cancellation_notice_minutes IS NULL OR cancellation_notice_minutes BETWEEN 0 AND 10080);

ALTER TABLE luminix.professionals
  ADD COLUMN role_name text CHECK (role_name IS NULL OR length(trim(role_name)) BETWEEN 1 AND 120),
  ADD COLUMN audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'women', 'men'));

CREATE TABLE luminix.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  location_id uuid,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  type text NOT NULL DEFAULT 'equipment' CHECK (type IN ('equipment', 'room', 'bed', 'other')),
  availability_mode text NOT NULL DEFAULT 'manual_release' CHECK (availability_mode IN ('business_hours', 'manual_release')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  UNIQUE (clinic_id, name),
  FOREIGN KEY (clinic_id, location_id) REFERENCES luminix.locations(clinic_id, id)
);

CREATE TABLE luminix.service_resources (
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  service_id uuid NOT NULL,
  resource_id uuid NOT NULL,
  PRIMARY KEY (clinic_id, service_id, resource_id),
  FOREIGN KEY (clinic_id, service_id) REFERENCES luminix.services(clinic_id, id),
  FOREIGN KEY (clinic_id, resource_id) REFERENCES luminix.resources(clinic_id, id)
);

CREATE TABLE luminix.booking_policies (
  clinic_id uuid PRIMARY KEY REFERENCES luminix.clinics(id),
  cancellation_notice_minutes integer NOT NULL DEFAULT 720 CHECK (cancellation_notice_minutes BETWEEN 0 AND 10080),
  special_cancellation_notice_minutes integer NOT NULL DEFAULT 1440 CHECK (special_cancellation_notice_minutes BETWEEN 0 AND 20160),
  allow_client_cancellation boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE luminix.payment_preferences (
  clinic_id uuid PRIMARY KEY REFERENCES luminix.clinics(id),
  accept_in_app boolean NOT NULL DEFAULT false,
  provider text CHECK (provider IS NULL OR provider = 'stripe_connect'),
  provider_status text NOT NULL DEFAULT 'not_started' CHECK (provider_status IN ('not_started', 'pending', 'active', 'restricted')),
  package_payment_mode text NOT NULL DEFAULT 'clinic_only' CHECK (package_payment_mode IN ('clinic_only', 'in_app', 'both')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE luminix.onboarding_drafts DROP CONSTRAINT onboarding_drafts_format_version_check;
ALTER TABLE luminix.onboarding_drafts ALTER COLUMN format_version SET DEFAULT 2;
ALTER TABLE luminix.onboarding_drafts ADD CONSTRAINT onboarding_drafts_format_version_check CHECK (format_version = 2) NOT VALID;
ALTER TABLE luminix.onboarding_drafts DROP CONSTRAINT onboarding_drafts_step_check;
ALTER TABLE luminix.onboarding_drafts ADD CONSTRAINT onboarding_drafts_step_check
  CHECK (step IN ('contact','clinic','catalog','services','structure','schedule','preferences','review')) NOT VALID;
ALTER TABLE luminix.onboarding_drafts DROP CONSTRAINT onboarding_drafts_payload_check;
ALTER TABLE luminix.onboarding_drafts ADD CONSTRAINT onboarding_drafts_payload_check
  CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 131072);
ALTER TABLE luminix.onboarding_drafts
  ADD COLUMN progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  ADD COLUMN last_activity_at timestamptz NOT NULL DEFAULT now();

UPDATE luminix.onboarding_drafts SET
  format_version = 2,
  step = CASE step
    WHEN 'occupations' THEN 'catalog'
    WHEN 'professionals' THEN 'structure'
    ELSE step
  END,
  payload = jsonb_build_object(
    'name', coalesce(payload->>'name', ''),
    'ownerName', coalesce(payload->>'ownerName', ''),
    'email', coalesce(payload->>'email', ''),
    'phone', coalesce(payload->>'phone', ''),
    'clinic', jsonb_build_object('foundedYear','','whatsapp',coalesce(payload->>'phone', ''),'instagram','','facebook','','website','','taxId','','addressLine','','city','','state','','postalCode',''),
    'occupations', coalesce(payload->'occupations', '[]'::jsonb),
    'services', coalesce(payload->'services', '[]'::jsonb),
    'teamMode', CASE WHEN jsonb_array_length(coalesce(payload->'professionals','[]'::jsonb)) = 0 THEN 'solo' ELSE 'team' END,
    'professionals', coalesce((SELECT jsonb_agg(jsonb_build_object('name', value #>> '{}','role','Profissional','audience','all','serviceNames','[]'::jsonb)) FROM jsonb_array_elements(coalesce(payload->'professionals','[]'::jsonb))), '[]'::jsonb),
    'businessHours', '[{"weekday":1,"enabled":true,"start":"09:00","end":"18:00"},{"weekday":2,"enabled":true,"start":"09:00","end":"18:00"},{"weekday":3,"enabled":true,"start":"09:00","end":"18:00"},{"weekday":4,"enabled":true,"start":"09:00","end":"18:00"},{"weekday":5,"enabled":true,"start":"09:00","end":"18:00"},{"weekday":6,"enabled":false,"start":"09:00","end":"13:00"},{"weekday":0,"enabled":false,"start":"09:00","end":"13:00"}]'::jsonb,
    'preferences', jsonb_build_object('cancellationHours',12,'specialCancellationHours',24,'acceptInApp',false,'packagePaymentMode','clinic_only')
  );
ALTER TABLE luminix.onboarding_drafts VALIDATE CONSTRAINT onboarding_drafts_format_version_check;
ALTER TABLE luminix.onboarding_drafts VALIDATE CONSTRAINT onboarding_drafts_step_check;

CREATE OR REPLACE FUNCTION luminix.save_onboarding_draft(p_clinic uuid, p_expected_version integer, p_step text, p_payload jsonb)
RETURNS TABLE (draft_version integer, draft_step text, draft_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_draft luminix.onboarding_drafts%ROWTYPE; v_inserted uuid; v_progress integer;
BEGIN
  IF p_clinic IS DISTINCT FROM nullif(current_setting('luminix.clinic_id', true), '')::uuid
    OR p_expected_version IS NULL OR p_expected_version < 0
    OR p_step IS NULL OR p_step NOT IN ('contact','clinic','catalog','services','structure','schedule','preferences','review')
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
  v_progress := CASE p_step WHEN 'contact' THEN 0 WHEN 'clinic' THEN 14 WHEN 'catalog' THEN 28 WHEN 'services' THEN 43 WHEN 'structure' THEN 57 WHEN 'schedule' THEN 71 WHEN 'preferences' THEN 86 ELSE 100 END;
  UPDATE luminix.onboarding_drafts d SET step = p_step, payload = p_payload, progress = v_progress,
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
      OR (coalesce((v_item->>'enabled')::boolean,false) AND (v_item->>'start')::time >= (v_item->>'end')::time) THEN
      RAISE EXCEPTION 'Invalid business hours' USING ERRCODE = '22023';
    END IF;
    IF coalesce((v_item->>'enabled')::boolean,false) THEN
      INSERT INTO luminix.business_hours (clinic_id, location_id, weekday, starts_at, ends_at)
      VALUES (p_clinic, v_location, (v_item->>'weekday')::smallint, (v_item->>'start')::time, (v_item->>'end')::time);
    END IF;
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
    INSERT INTO luminix.professionals (clinic_id, display_name, role_name, audience)
    VALUES (p_clinic, trim(v_prof->>'name'), nullif(trim(v_prof->>'role'),''), coalesce(v_prof->>'audience','all')) RETURNING id INTO v_prof_id;
    FOR v_service_name IN SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(v_prof->'serviceNames','[]'::jsonb)) LOOP
      INSERT INTO luminix.professional_services (clinic_id, professional_id, service_id)
      SELECT p_clinic, v_prof_id, s.id FROM luminix.services s WHERE s.clinic_id = p_clinic AND lower(s.name) = lower(v_service_name) LIMIT 1
      ON CONFLICT DO NOTHING;
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

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['clinic_profiles','locations','business_hours','resources','service_resources','booking_policies','payment_preferences'] LOOP
    EXECUTE format('ALTER TABLE luminix.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE luminix.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY clinic_scope ON luminix.%I USING (clinic_id = luminix.current_clinic_id()) WITH CHECK (clinic_id = luminix.current_clinic_id())', table_name);
    EXECUTE format('CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.%I FOR EACH ROW EXECUTE FUNCTION luminix.audit_change()', table_name);
    EXECUTE format('CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.%I FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move()', table_name);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA luminix FROM PUBLIC;
GRANT SELECT ON luminix.clinic_profiles, luminix.locations, luminix.business_hours, luminix.resources,
  luminix.service_resources, luminix.booking_policies, luminix.payment_preferences TO luminix_api;
