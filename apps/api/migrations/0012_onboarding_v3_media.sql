-- Stable onboarding references, complete clinic fields, Brazilian tax-id validation and media metadata.

CREATE FUNCTION luminix.valid_cpf(p_value text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE v text := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g'); v_sum integer; v_digit integer; i integer;
BEGIN
  IF length(v) <> 11 OR v ~ '^([0-9])\1{10}$' THEN RETURN false; END IF;
  v_sum := 0; FOR i IN 1..9 LOOP v_sum := v_sum + substring(v, i, 1)::integer * (11 - i); END LOOP;
  v_digit := CASE WHEN v_sum % 11 < 2 THEN 0 ELSE 11 - (v_sum % 11) END;
  IF v_digit <> substring(v, 10, 1)::integer THEN RETURN false; END IF;
  v_sum := 0; FOR i IN 1..10 LOOP v_sum := v_sum + substring(v, i, 1)::integer * (12 - i); END LOOP;
  v_digit := CASE WHEN v_sum % 11 < 2 THEN 0 ELSE 11 - (v_sum % 11) END;
  RETURN v_digit = substring(v, 11, 1)::integer;
END $$;

CREATE FUNCTION luminix.valid_cnpj(p_value text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE
  v text := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
  v_weights integer[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  v_sum integer; v_digit integer; i integer;
BEGIN
  IF length(v) <> 14 OR v ~ '^([0-9])\1{13}$' THEN RETURN false; END IF;
  v_sum := 0; FOR i IN 1..12 LOOP v_sum := v_sum + substring(v, i, 1)::integer * v_weights[i]; END LOOP;
  v_digit := CASE WHEN v_sum % 11 < 2 THEN 0 ELSE 11 - (v_sum % 11) END;
  IF v_digit <> substring(v, 13, 1)::integer THEN RETURN false; END IF;
  v_weights := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
  v_sum := 0; FOR i IN 1..13 LOOP v_sum := v_sum + substring(v, i, 1)::integer * v_weights[i]; END LOOP;
  v_digit := CASE WHEN v_sum % 11 < 2 THEN 0 ELSE 11 - (v_sum % 11) END;
  RETURN v_digit = substring(v, 14, 1)::integer;
END $$;
REVOKE ALL ON FUNCTION luminix.valid_cpf(text), luminix.valid_cnpj(text) FROM PUBLIC;

CREATE TABLE luminix.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  kind text NOT NULL CHECK (kind IN ('clinic_logo', 'professional_photo')),
  subject_ref uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed', 'superseded')),
  small_object_key text,
  large_object_key text,
  small_bytes integer CHECK (small_bytes IS NULL OR small_bytes BETWEEN 1 AND 2500000),
  large_bytes integer CHECK (large_bytes IS NULL OR large_bytes BETWEEN 1 AND 2500000),
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  UNIQUE (clinic_id, id),
  FOREIGN KEY (clinic_id, created_by_membership_id) REFERENCES luminix.clinic_memberships(clinic_id, id),
  CHECK ((kind = 'clinic_logo' AND subject_ref IS NULL) OR (kind = 'professional_photo' AND subject_ref IS NOT NULL)),
  CHECK (
    (status = 'ready' AND small_object_key IS NOT NULL AND large_object_key IS NOT NULL AND ready_at IS NOT NULL)
    OR status <> 'ready'
  )
);
CREATE INDEX media_assets_subject ON luminix.media_assets(clinic_id, kind, subject_ref, created_at DESC);

ALTER TABLE luminix.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.media_assets FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.media_assets
  USING (clinic_id = luminix.current_clinic_id()) WITH CHECK (clinic_id = luminix.current_clinic_id());
CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.media_assets
  FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.media_assets
  FOR EACH ROW EXECUTE FUNCTION luminix.audit_change();

ALTER TABLE luminix.clinic_profiles
  ADD COLUMN tax_id_kind text CHECK (tax_id_kind IS NULL OR tax_id_kind IN ('cpf', 'cnpj')),
  ADD COLUMN default_audience text NOT NULL DEFAULT 'all' CHECK (default_audience IN ('all', 'women', 'men')),
  ADD COLUMN logo_asset_id uuid,
  ADD FOREIGN KEY (clinic_id, logo_asset_id) REFERENCES luminix.media_assets(clinic_id, id);
ALTER TABLE luminix.locations
  ADD COLUMN address_number text CHECK (address_number IS NULL OR length(address_number) <= 20),
  ADD COLUMN district text CHECK (district IS NULL OR length(district) <= 120),
  ADD COLUMN address_note text CHECK (address_note IS NULL OR length(address_note) <= 240);
ALTER TABLE luminix.services
  ADD COLUMN is_sensitive boolean NOT NULL DEFAULT false;
ALTER TABLE luminix.professionals
  ADD COLUMN photo_asset_id uuid,
  ADD FOREIGN KEY (clinic_id, photo_asset_id) REFERENCES luminix.media_assets(clinic_id, id);

GRANT SELECT ON luminix.media_assets TO luminix_api;

CREATE FUNCTION luminix.begin_media_upload(p_clinic uuid, p_kind text, p_subject_ref uuid DEFAULT NULL)
RETURNS TABLE (asset_id uuid, asset_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_asset uuid; v_permission text;
BEGIN
  IF p_clinic IS DISTINCT FROM nullif(current_setting('luminix.clinic_id', true), '')::uuid
    OR p_kind NOT IN ('clinic_logo', 'professional_photo')
    OR (p_kind = 'clinic_logo' AND p_subject_ref IS NOT NULL)
    OR (p_kind = 'professional_photo' AND p_subject_ref IS NULL) THEN
    RAISE EXCEPTION 'Invalid media upload' USING ERRCODE = '22023';
  END IF;
  v_permission := CASE WHEN p_kind = 'clinic_logo' THEN 'settings:manage' ELSE 'professional:manage' END;
  SELECT membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, v_permission);
  INSERT INTO luminix.media_assets (clinic_id, kind, subject_ref, created_by_membership_id)
    VALUES (p_clinic, p_kind, p_subject_ref, v_member) RETURNING id INTO v_asset;
  RETURN QUERY SELECT v_asset, 'pending'::text;
END $$;

CREATE FUNCTION luminix.complete_media_upload(
  p_clinic uuid, p_asset uuid, p_small_bytes integer, p_large_bytes integer
) RETURNS TABLE (asset_id uuid, asset_status text, small_object_key text, large_object_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_asset luminix.media_assets%ROWTYPE; v_permission text; v_small text; v_large text; v_module text;
BEGIN
  IF p_clinic IS DISTINCT FROM nullif(current_setting('luminix.clinic_id', true), '')::uuid
    OR p_asset IS NULL OR p_small_bytes NOT BETWEEN 1 AND 2500000 OR p_large_bytes NOT BETWEEN 1 AND 2500000 THEN
    RAISE EXCEPTION 'Invalid media upload' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_asset FROM luminix.media_assets WHERE clinic_id = p_clinic AND id = p_asset FOR UPDATE;
  IF NOT FOUND OR v_asset.status <> 'pending' THEN RAISE EXCEPTION 'Media conflict' USING ERRCODE = '23505'; END IF;
  v_permission := CASE WHEN v_asset.kind = 'clinic_logo' THEN 'settings:manage' ELSE 'professional:manage' END;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, v_permission);
  v_module := CASE WHEN v_asset.kind = 'clinic_logo' THEN 'branding/logo' ELSE 'team/' || v_asset.subject_ref::text END;
  v_small := p_clinic::text || '/' || v_module || '/' || p_asset::text || '/small-128.webp';
  v_large := p_clinic::text || '/' || v_module || '/' || p_asset::text || '/large-512.webp';
  UPDATE luminix.media_assets SET status = 'superseded'
    WHERE clinic_id = p_clinic AND kind = v_asset.kind
      AND subject_ref IS NOT DISTINCT FROM v_asset.subject_ref AND status = 'ready';
  UPDATE luminix.media_assets SET status = 'ready', small_object_key = v_small, large_object_key = v_large,
    small_bytes = p_small_bytes, large_bytes = p_large_bytes, ready_at = now()
    WHERE clinic_id = p_clinic AND id = p_asset;
  RETURN QUERY SELECT p_asset, 'ready'::text, v_small, v_large;
END $$;
REVOKE ALL ON FUNCTION luminix.begin_media_upload(uuid, text, uuid),
  luminix.complete_media_upload(uuid, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.begin_media_upload(uuid, text, uuid),
  luminix.complete_media_upload(uuid, uuid, integer, integer) TO luminix_api;

-- Convert resumable v2 drafts in place. Completed drafts are retained for audit but are never read operationally.
ALTER TABLE luminix.onboarding_drafts DROP CONSTRAINT onboarding_drafts_format_version_check;
ALTER TABLE luminix.onboarding_drafts ALTER COLUMN format_version SET DEFAULT 3;

DO $$
DECLARE
  d record; item jsonb; opened record; v_id uuid; v_ref text;
  v_services jsonb; v_professionals jsonb; v_schedules jsonb; v_service_map jsonb; v_prof_map jsonb;
  v_ids jsonb; v_audiences jsonb; v_prof jsonb; v_schedule jsonb;
BEGIN
  FOR d IN SELECT clinic_id, payload FROM luminix.onboarding_drafts LOOP
    v_services := '[]'::jsonb; v_service_map := '{}'::jsonb;
    FOR item IN SELECT value FROM jsonb_array_elements(coalesce(d.payload->'services', '[]'::jsonb)) LOOP
      v_id := gen_random_uuid();
      v_services := v_services || jsonb_build_array(item || jsonb_build_object('id', v_id));
      v_service_map := v_service_map || jsonb_build_object(lower(trim(item->>'name')), v_id::text);
    END LOOP;
    v_professionals := '[]'::jsonb; v_prof_map := '{}'::jsonb;
    FOR item IN SELECT value FROM jsonb_array_elements(coalesce(d.payload->'professionals', '[]'::jsonb)) LOOP
      v_id := gen_random_uuid(); v_ids := '[]'::jsonb; v_audiences := '{}'::jsonb;
      FOR v_ref IN SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(item->'serviceNames', '[]'::jsonb)) LOOP
        IF v_service_map ? lower(trim(v_ref)) THEN
          v_ids := v_ids || jsonb_build_array(v_service_map->>lower(trim(v_ref)));
        END IF;
      END LOOP;
      IF jsonb_typeof(item->'serviceAudiences') = 'object' THEN
        FOR opened IN SELECT key, value FROM jsonb_each_text(item->'serviceAudiences') LOOP
          IF v_service_map ? lower(trim(opened.key)) THEN
            v_audiences := v_audiences || jsonb_build_object(v_service_map->>lower(trim(opened.key)), opened.value);
          END IF;
        END LOOP;
      END IF;
      v_prof := item || jsonb_build_object('id', v_id, 'serviceIds', v_ids, 'serviceAudiences', v_audiences);
      v_professionals := v_professionals || jsonb_build_array(v_prof);
      v_prof_map := v_prof_map || jsonb_build_object(lower(trim(item->>'name')), v_id::text);
    END LOOP;
    v_schedules := '[]'::jsonb;
    FOR item IN SELECT value FROM jsonb_array_elements(coalesce(d.payload->'professionalSchedules', '[]'::jsonb)) LOOP
      v_ref := v_prof_map->>lower(trim(item->>'name'));
      IF v_ref IS NOT NULL THEN
        v_schedule := item || jsonb_build_object('professionalId', v_ref);
        v_schedules := v_schedules || jsonb_build_array(v_schedule);
      END IF;
    END LOOP;
    UPDATE luminix.onboarding_drafts SET format_version = 3, payload =
      d.payload || jsonb_build_object(
        'services', v_services,
        'professionals', v_professionals,
        'professionalSchedules', v_schedules,
        'clinic', coalesce(d.payload->'clinic', '{}'::jsonb) || jsonb_build_object(
          'addressNumber', coalesce(d.payload->'clinic'->>'addressNumber', ''),
          'addressDistrict', coalesce(d.payload->'clinic'->>'addressDistrict', ''),
          'addressNote', coalesce(d.payload->'clinic'->>'addressNote', ''),
          'taxIdKind', coalesce(d.payload->'clinic'->>'taxIdKind', 'cnpj'),
          'defaultAudience', coalesce(d.payload->'clinic'->>'defaultAudience', 'all')
        )
      )
      WHERE clinic_id = d.clinic_id;
  END LOOP;
END $$;

ALTER TABLE luminix.onboarding_drafts ADD CONSTRAINT onboarding_drafts_format_version_check CHECK (format_version = 3);

CREATE OR REPLACE FUNCTION luminix.save_onboarding_draft(p_clinic uuid, p_expected_version integer, p_step text, p_payload jsonb)
RETURNS TABLE (draft_version integer, draft_step text, draft_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_draft luminix.onboarding_drafts%ROWTYPE; v_inserted uuid; v_progress integer; v_step text;
BEGIN
  v_step := CASE WHEN p_step = 'preferences' THEN 'payments' ELSE p_step END;
  IF p_clinic IS DISTINCT FROM nullif(current_setting('luminix.clinic_id', true), '')::uuid
    OR p_expected_version IS NULL OR p_expected_version < 0
    OR v_step IS NULL OR v_step NOT IN ('contact','clinic','catalog','services','structure','schedule','hours','payments','rules','review')
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR pg_column_size(p_payload) > 131072 THEN
    RAISE EXCEPTION 'Invalid draft' USING ERRCODE = '22023';
  END IF;
  SELECT membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'onboarding:manage');
  PERFORM 1 FROM luminix.clinics c WHERE c.id = p_clinic AND c.status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Clinic already active' USING ERRCODE = '23505'; END IF;
  INSERT INTO luminix.onboarding_drafts (clinic_id, created_by_membership_id, format_version)
    VALUES (p_clinic, v_member, 3) ON CONFLICT (clinic_id) DO NOTHING RETURNING id INTO v_inserted;
  SELECT * INTO v_draft FROM luminix.onboarding_drafts WHERE clinic_id = p_clinic FOR UPDATE;
  IF (p_expected_version = 0 AND v_inserted IS NULL)
    OR (p_expected_version > 0 AND v_draft.version <> p_expected_version)
    OR v_draft.status <> 'draft' THEN RAISE EXCEPTION 'Draft conflict' USING ERRCODE = '23505'; END IF;
  v_progress := CASE v_step
    WHEN 'contact' THEN 0 WHEN 'clinic' THEN 10 WHEN 'catalog' THEN 20 WHEN 'services' THEN 30
    WHEN 'structure' THEN 40 WHEN 'schedule' THEN 50 WHEN 'hours' THEN 60 WHEN 'payments' THEN 70
    WHEN 'rules' THEN 80 ELSE 100 END;
  UPDATE luminix.onboarding_drafts d SET step = v_step, payload = p_payload, format_version = 3, progress = v_progress,
    last_activity_at = now(), version = CASE WHEN v_inserted IS NOT NULL THEN 1 ELSE d.version + 1 END
    WHERE d.clinic_id = p_clinic RETURNING * INTO v_draft;
  RETURN QUERY SELECT v_draft.version, v_draft.step, v_draft.payload;
END $$;

CREATE OR REPLACE FUNCTION luminix.complete_onboarding(p_clinic uuid, p_expected_version integer)
RETURNS TABLE (clinic_name text, clinic_status text, clinic_share_code text, draft_version integer, replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_draft luminix.onboarding_drafts%ROWTYPE; v_name text; v_owner text; v_email text; v_phone text;
  v_clinic jsonb; v_prefs jsonb; v_item jsonb; v_prof jsonb; v_service_id uuid; v_prof_id uuid; v_location uuid; v_resource uuid;
  v_periods jsonb; v_sched jsonb; v_days jsonb; v_day jsonb; v_clinic_day jsonb; v_service_item jsonb; v_link_audience text;
  v_logo_asset uuid; v_photo_asset uuid; v_tax_kind text;
BEGIN
  IF p_clinic IS DISTINCT FROM nullif(current_setting('luminix.clinic_id', true), '')::uuid OR p_expected_version IS NULL OR p_expected_version < 1
    THEN RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'onboarding:manage');
  SELECT * INTO v_draft FROM luminix.onboarding_drafts WHERE clinic_id = p_clinic FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft missing' USING ERRCODE = '22023'; END IF;
  IF v_draft.status = 'completed' THEN
    RETURN QUERY SELECT c.name, c.status, c.share_code, v_draft.version, true FROM luminix.clinics c WHERE c.id = p_clinic; RETURN;
  END IF;
  IF v_draft.status <> 'draft' OR v_draft.version <> p_expected_version OR v_draft.format_version <> 3
    THEN RAISE EXCEPTION 'Draft conflict' USING ERRCODE = '23505'; END IF;
  v_name := trim(v_draft.payload->>'name'); v_owner := trim(v_draft.payload->>'ownerName');
  v_email := lower(trim(v_draft.payload->>'email')); v_phone := trim(v_draft.payload->>'phone');
  v_clinic := coalesce(v_draft.payload->'clinic','{}'::jsonb); v_prefs := coalesce(v_draft.payload->'preferences','{}'::jsonb);
  v_tax_kind := coalesce(v_clinic->>'taxIdKind', 'cnpj');
  IF length(v_name) NOT BETWEEN 1 AND 160 OR length(v_owner) NOT BETWEEN 1 AND 120
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR v_phone !~ '^\+[1-9][0-9]{7,14}$'
    OR (coalesce(v_clinic->>'whatsapp','') <> '' AND v_clinic->>'whatsapp' !~ '^\+[1-9][0-9]{7,14}$')
    OR (coalesce(v_clinic->>'foundedYear','') <> '' AND ((v_clinic->>'foundedYear') !~ '^[0-9]{4}$' OR (v_clinic->>'foundedYear')::integer NOT BETWEEN 1800 AND 2200))
    OR (coalesce(v_clinic->>'state','') <> '' AND upper(v_clinic->>'state') !~ '^[A-Z]{2}$')
    OR (coalesce(v_clinic->>'postalCode','') <> '' AND regexp_replace(v_clinic->>'postalCode','[^0-9]','','g') !~ '^[0-9]{8}$')
    OR v_tax_kind NOT IN ('cpf','cnpj')
    OR (coalesce(v_clinic->>'taxId','') <> '' AND ((v_tax_kind = 'cpf' AND NOT luminix.valid_cpf(v_clinic->>'taxId')) OR (v_tax_kind = 'cnpj' AND NOT luminix.valid_cnpj(v_clinic->>'taxId'))))
    OR coalesce(v_clinic->>'defaultAudience','all') NOT IN ('all','women','men')
    OR jsonb_typeof(v_draft.payload->'services') <> 'array' OR jsonb_array_length(v_draft.payload->'services') < 1
    OR jsonb_array_length(v_draft.payload->'services') > 80 OR jsonb_typeof(v_draft.payload->'professionals') <> 'array'
    OR jsonb_array_length(v_draft.payload->'professionals') < 1 OR jsonb_array_length(v_draft.payload->'professionals') > 30
    OR jsonb_typeof(v_draft.payload->'businessHours') <> 'array' OR jsonb_array_length(v_draft.payload->'businessHours') <> 7
    OR (SELECT count(DISTINCT value->>'weekday') FROM jsonb_array_elements(v_draft.payload->'businessHours')) <> 7
    OR coalesce(v_prefs->>'cancellationHours','') !~ '^[0-9]{1,3}$' OR (v_prefs->>'cancellationHours')::integer NOT BETWEEN 0 AND 168
    OR coalesce(v_prefs->>'specialCancellationHours','') !~ '^[0-9]{1,3}$' OR (v_prefs->>'specialCancellationHours')::integer NOT BETWEEN 0 AND 336
    OR jsonb_typeof(v_prefs->'acceptInApp') <> 'boolean'
    OR coalesce(v_prefs->>'packagePaymentMode','') NOT IN ('clinic_only','in_app','both')
    OR (NOT coalesce((v_prefs->>'acceptInApp')::boolean,false) AND coalesce(v_prefs->>'packagePaymentMode','clinic_only') <> 'clinic_only')
    THEN RAISE EXCEPTION 'Invalid onboarding data' USING ERRCODE = '22023'; END IF;

  IF nullif(v_clinic->>'logoAssetId','') IS NOT NULL THEN
    v_logo_asset := (v_clinic->>'logoAssetId')::uuid;
    PERFORM 1 FROM luminix.media_assets WHERE clinic_id = p_clinic AND id = v_logo_asset AND kind = 'clinic_logo' AND status = 'ready';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid logo asset' USING ERRCODE = '22023'; END IF;
  END IF;
  INSERT INTO luminix.clinic_profiles
    (clinic_id, owner_name, contact_email, contact_phone, whatsapp_phone, founded_year, tax_id, tax_id_kind, default_audience, instagram, facebook, website, logo_asset_id)
  VALUES (p_clinic, v_owner, v_email, v_phone, nullif(v_clinic->>'whatsapp',''), nullif(v_clinic->>'foundedYear','')::integer,
    nullif(regexp_replace(v_clinic->>'taxId','[^0-9]','','g'),''), CASE WHEN nullif(v_clinic->>'taxId','') IS NULL THEN NULL ELSE v_tax_kind END,
    coalesce(v_clinic->>'defaultAudience','all'), nullif(v_clinic->>'instagram',''), nullif(v_clinic->>'facebook',''), nullif(v_clinic->>'website',''), v_logo_asset);
  INSERT INTO luminix.locations
    (clinic_id, name, address_line, address_number, district, address_note, city, state, postal_code, is_primary)
  VALUES (p_clinic, 'Principal', nullif(v_clinic->>'addressLine',''), nullif(v_clinic->>'addressNumber',''), nullif(v_clinic->>'addressDistrict',''),
    nullif(v_clinic->>'addressNote',''), nullif(v_clinic->>'city',''), nullif(upper(v_clinic->>'state'),''),
    nullif(regexp_replace(v_clinic->>'postalCode','[^0-9]','','g'),''), true) RETURNING id INTO v_location;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_draft.payload->'businessHours') LOOP
    IF jsonb_typeof(v_item) <> 'object' OR (v_item->>'weekday') !~ '^[0-6]$'
      OR (v_item->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR (v_item->>'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
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
    VALUES (p_clinic, (v_item->>'weekday')::smallint, coalesce((v_item->>'enabled')::boolean,false),
      CASE WHEN coalesce((v_item->>'enabled')::boolean,false) THEN v_periods ELSE '[]'::jsonb END);
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_draft.payload->'occupations') LOOP
    IF jsonb_typeof(v_item) <> 'string' OR length(trim(v_item #>> '{}')) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Invalid occupation' USING ERRCODE = '22023'; END IF;
    INSERT INTO luminix.occupations (clinic_id, name) VALUES (p_clinic, trim(v_item #>> '{}')) ON CONFLICT (clinic_id, name) DO NOTHING;
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_draft.payload->'services') LOOP
    IF jsonb_typeof(v_item) <> 'object' OR coalesce(v_item->>'id','') !~* '^[0-9a-f-]{36}$'
      OR length(trim(v_item->>'name')) NOT BETWEEN 1 AND 160 OR length(trim(v_item->>'category')) NOT BETWEEN 1 AND 120
      OR (v_item->>'priceCents') !~ '^[0-9]{1,9}$' OR (v_item->>'durationMinutes') !~ '^[0-9]{1,4}$'
      OR (v_item->>'durationMinutes')::integer NOT BETWEEN 1 AND 1440 OR coalesce(v_item->>'priceType','') NOT IN ('fixed','from','quote')
      OR coalesce(v_item->>'bookingMode','') NOT IN ('instant','request','manual_release') OR coalesce(v_item->>'audience','') NOT IN ('all','women','men')
      OR (v_item ? 'sensitive' AND jsonb_typeof(v_item->'sensitive') <> 'boolean') THEN
      RAISE EXCEPTION 'Invalid service' USING ERRCODE = '22023'; END IF;
    v_service_id := (v_item->>'id')::uuid;
    INSERT INTO luminix.services (id, clinic_id, name, category, description, price_cents, duration_minutes, price_type, booking_mode, audience, is_sensitive, cancellation_notice_minutes)
    VALUES (v_service_id, p_clinic, trim(v_item->>'name'), nullif(trim(v_item->>'category'),''), nullif(trim(v_item->>'description'),''),
      (v_item->>'priceCents')::integer, (v_item->>'durationMinutes')::integer, coalesce(v_item->>'priceType','fixed'),
      coalesce(v_item->>'bookingMode','instant'), coalesce(v_item->>'audience','all'), coalesce((v_item->>'sensitive')::boolean,false),
      CASE WHEN nullif(v_item->>'cancellationHours','') IS NULL THEN NULL ELSE (v_item->>'cancellationHours')::integer * 60 END);
    IF nullif(trim(v_item->>'resourceName'),'') IS NOT NULL THEN
      INSERT INTO luminix.resources (clinic_id, location_id, name, type, availability_mode)
      VALUES (p_clinic, v_location, trim(v_item->>'resourceName'), 'equipment', 'manual_release')
      ON CONFLICT (clinic_id, name) DO UPDATE SET name = excluded.name RETURNING id INTO v_resource;
      INSERT INTO luminix.service_resources (clinic_id, service_id, resource_id) VALUES (p_clinic, v_service_id, v_resource);
    END IF;
  END LOOP;
  FOR v_prof IN SELECT value FROM jsonb_array_elements(v_draft.payload->'professionals') LOOP
    IF jsonb_typeof(v_prof) <> 'object' OR coalesce(v_prof->>'id','') !~* '^[0-9a-f-]{36}$'
      OR length(trim(v_prof->>'name')) NOT BETWEEN 1 AND 160 OR length(trim(v_prof->>'role')) NOT BETWEEN 1 AND 120
      OR coalesce(v_prof->>'audience','') NOT IN ('all','women','men') OR jsonb_typeof(v_prof->'serviceIds') <> 'array'
      OR (v_prof ? 'serviceAudiences' AND jsonb_typeof(v_prof->'serviceAudiences') <> 'object') THEN
      RAISE EXCEPTION 'Invalid professional' USING ERRCODE = '22023'; END IF;
    v_prof_id := (v_prof->>'id')::uuid; v_photo_asset := NULL;
    IF nullif(v_prof->>'photoAssetId','') IS NOT NULL THEN
      v_photo_asset := (v_prof->>'photoAssetId')::uuid;
      PERFORM 1 FROM luminix.media_assets WHERE clinic_id = p_clinic AND id = v_photo_asset
        AND kind = 'professional_photo' AND subject_ref = v_prof_id AND status = 'ready';
      IF NOT FOUND THEN RAISE EXCEPTION 'Invalid professional photo' USING ERRCODE = '22023'; END IF;
    END IF;
    INSERT INTO luminix.professionals (id, clinic_id, display_name, role_name, audience, photo_asset_id)
    VALUES (v_prof_id, p_clinic, trim(v_prof->>'name'), nullif(trim(v_prof->>'role'),''), coalesce(v_prof->>'audience','all'), v_photo_asset);
    FOR v_service_id IN SELECT (value #>> '{}')::uuid FROM jsonb_array_elements(v_prof->'serviceIds') LOOP
      SELECT opened.value INTO v_service_item FROM jsonb_array_elements(v_draft.payload->'services') AS opened(value)
        WHERE opened.value->>'id' = v_service_id::text LIMIT 1;
      IF v_service_item IS NULL THEN RAISE EXCEPTION 'Unknown professional service' USING ERRCODE = '22023'; END IF;
      v_link_audience := NULL;
      IF coalesce((v_service_item->>'sensitive')::boolean, false) THEN
        v_link_audience := coalesce(v_prof->'serviceAudiences'->>v_service_id::text, v_service_item->>'audience', 'all');
        IF v_link_audience NOT IN ('all','women','men') THEN RAISE EXCEPTION 'Invalid professional audience' USING ERRCODE = '22023'; END IF;
      END IF;
      INSERT INTO luminix.professional_services (clinic_id, professional_id, service_id, audience)
        VALUES (p_clinic, v_prof_id, v_service_id, v_link_audience);
    END LOOP;
    SELECT entry.value INTO v_sched FROM jsonb_array_elements(coalesce(v_draft.payload->'professionalSchedules','[]'::jsonb)) AS entry(value)
      WHERE entry.value->>'professionalId' = v_prof_id::text LIMIT 1;
    v_days := CASE WHEN v_sched IS NOT NULL AND jsonb_typeof(v_sched->'days') = 'array' AND jsonb_array_length(v_sched->'days') = 7
      THEN v_sched->'days' ELSE v_draft.payload->'businessHours' END;
    FOR v_day IN SELECT value FROM jsonb_array_elements(v_days) LOOP
      SELECT entry.value INTO v_clinic_day FROM jsonb_array_elements(v_draft.payload->'businessHours') AS entry(value)
        WHERE entry.value->>'weekday' = v_day->>'weekday' LIMIT 1;
      IF jsonb_typeof(v_day) <> 'object' OR (v_day->>'weekday') !~ '^[0-6]$'
        OR (v_day->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR (v_day->>'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        OR (coalesce((v_day->>'enabled')::boolean,false) AND (v_day->>'start')::time >= (v_day->>'end')::time)
        OR jsonb_array_length(coalesce(v_day->'breaks','[]'::jsonb)) > 4
        OR (coalesce((v_day->>'enabled')::boolean,false) AND (
          NOT coalesce((v_clinic_day->>'enabled')::boolean,false)
          OR (v_day->>'start')::time < (v_clinic_day->>'start')::time
          OR (v_day->>'end')::time > (v_clinic_day->>'end')::time
        )) THEN RAISE EXCEPTION 'Invalid professional hours' USING ERRCODE = '22023'; END IF;
      v_periods := luminix.business_day_to_periods(v_day);
      INSERT INTO luminix.professional_weekly_availability (clinic_id, professional_id, weekday, is_available, periods)
      VALUES (p_clinic, v_prof_id, (v_day->>'weekday')::smallint, coalesce((v_day->>'enabled')::boolean,false),
        CASE WHEN coalesce((v_day->>'enabled')::boolean,false) THEN v_periods ELSE '[]'::jsonb END);
    END LOOP;
  END LOOP;
  INSERT INTO luminix.booking_policies (clinic_id, cancellation_notice_minutes, special_cancellation_notice_minutes)
  VALUES (p_clinic, (v_prefs->>'cancellationHours')::integer * 60, (v_prefs->>'specialCancellationHours')::integer * 60);
  INSERT INTO luminix.payment_preferences (clinic_id, accept_in_app, provider, package_payment_mode)
  VALUES (p_clinic, (v_prefs->>'acceptInApp')::boolean, CASE WHEN (v_prefs->>'acceptInApp')::boolean THEN 'stripe_connect' ELSE NULL END, v_prefs->>'packagePaymentMode');
  UPDATE luminix.clinics SET name = v_name, status = 'active' WHERE id = p_clinic AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Clinic already active' USING ERRCODE = '23505'; END IF;
  UPDATE luminix.onboarding_drafts SET status = 'completed', step = 'review', progress = 100, completed_at = now(), last_activity_at = now() WHERE clinic_id = p_clinic;
  RETURN QUERY SELECT c.name, c.status, c.share_code, v_draft.version, false FROM luminix.clinics c WHERE c.id = p_clinic;
END $$;
