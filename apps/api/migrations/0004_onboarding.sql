-- The initial onboarding format is deliberately small. `version` remains the
-- optimistic revision from migration 0001; format_version identifies the payload.
ALTER TABLE luminix.onboarding_drafts
  ADD COLUMN format_version integer NOT NULL DEFAULT 1 CHECK (format_version = 1),
  ADD COLUMN payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 32768),
  ADD COLUMN completed_at timestamptz;
ALTER TABLE luminix.onboarding_drafts DROP CONSTRAINT onboarding_drafts_step_check;
ALTER TABLE luminix.onboarding_drafts ADD CONSTRAINT onboarding_drafts_step_check
  CHECK (step IN ('clinic', 'occupations', 'services', 'professionals', 'review'));
ALTER TABLE luminix.clinics ADD COLUMN share_code text UNIQUE
  CHECK (share_code ~ '^LX-[A-F0-9]{12}$');

CREATE FUNCTION luminix.save_onboarding_draft(p_clinic uuid, p_expected_version integer, p_step text, p_payload jsonb)
RETURNS TABLE (draft_version integer, draft_step text, draft_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_draft luminix.onboarding_drafts%ROWTYPE; v_inserted uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM nullif(current_setting('luminix.clinic_id', true), '')::uuid
    OR p_expected_version IS NULL OR p_expected_version < 0
    OR p_step IS NULL OR p_step NOT IN ('clinic','occupations','services','professionals','review')
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR pg_column_size(p_payload) > 32768 THEN
    RAISE EXCEPTION 'Invalid draft' USING ERRCODE = '22023';
  END IF;
  SELECT membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'onboarding:manage');
  PERFORM 1 FROM luminix.clinics c WHERE c.id = p_clinic AND c.status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Clinic already active' USING ERRCODE = '23505'; END IF;
  INSERT INTO luminix.onboarding_drafts (clinic_id, created_by_membership_id)
    VALUES (p_clinic, v_member) ON CONFLICT (clinic_id) DO NOTHING RETURNING id INTO v_inserted;
  SELECT * INTO v_draft FROM luminix.onboarding_drafts WHERE clinic_id = p_clinic FOR UPDATE;
  IF (p_expected_version = 0 AND v_inserted IS NULL)
    OR (p_expected_version > 0 AND v_draft.version <> p_expected_version)
    OR v_draft.status <> 'draft' THEN
    RAISE EXCEPTION 'Draft conflict' USING ERRCODE = '23505';
  END IF;
  UPDATE luminix.onboarding_drafts d SET step = p_step, payload = p_payload,
    version = CASE WHEN v_inserted IS NOT NULL THEN 1 ELSE d.version + 1 END
    WHERE d.clinic_id = p_clinic RETURNING * INTO v_draft;
  RETURN QUERY SELECT v_draft.version, v_draft.step, v_draft.payload;
END $$;

CREATE FUNCTION luminix.complete_onboarding(p_clinic uuid, p_expected_version integer)
RETURNS TABLE (clinic_name text, clinic_status text, clinic_share_code text, draft_version integer, replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_draft luminix.onboarding_drafts%ROWTYPE; v_name text; v_item jsonb;
BEGIN
  IF p_clinic IS DISTINCT FROM nullif(current_setting('luminix.clinic_id', true), '')::uuid
    OR p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'onboarding:manage');
  SELECT * INTO v_draft FROM luminix.onboarding_drafts WHERE clinic_id = p_clinic FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft missing' USING ERRCODE = '22023'; END IF;
  IF v_draft.status = 'completed' THEN
    RETURN QUERY SELECT c.name, c.status, c.share_code, v_draft.version, true
      FROM luminix.clinics c WHERE c.id = p_clinic;
    RETURN;
  END IF;
  IF v_draft.status <> 'draft' OR v_draft.version <> p_expected_version THEN
    RAISE EXCEPTION 'Draft conflict' USING ERRCODE = '23505';
  END IF;
  v_name := trim(v_draft.payload->>'name');
  IF v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 160
    OR jsonb_typeof(v_draft.payload->'occupations') <> 'array'
    OR jsonb_typeof(v_draft.payload->'services') <> 'array'
    OR jsonb_typeof(v_draft.payload->'professionals') <> 'array'
    OR jsonb_array_length(v_draft.payload->'occupations') > 20
    OR jsonb_array_length(v_draft.payload->'services') > 30
    OR jsonb_array_length(v_draft.payload->'professionals') > 20 THEN
    RAISE EXCEPTION 'Invalid onboarding data' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_draft.payload->'occupations') LOOP
    IF jsonb_typeof(v_item) <> 'string' OR length(trim(v_item #>> '{}')) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Invalid occupation' USING ERRCODE = '22023';
    END IF;
    INSERT INTO luminix.occupations (clinic_id, name) VALUES (p_clinic, trim(v_item #>> '{}'));
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_draft.payload->'services') LOOP
    IF jsonb_typeof(v_item) <> 'object' OR length(trim(v_item->>'name')) NOT BETWEEN 1 AND 160
      OR (v_item->>'priceCents') !~ '^[0-9]{1,9}$'
      OR (v_item->>'durationMinutes') !~ '^[0-9]{1,4}$'
      OR (v_item->>'durationMinutes')::integer NOT BETWEEN 1 AND 1440 THEN
      RAISE EXCEPTION 'Invalid service' USING ERRCODE = '22023';
    END IF;
    INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes)
      VALUES (p_clinic, trim(v_item->>'name'), (v_item->>'priceCents')::integer, (v_item->>'durationMinutes')::integer);
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_draft.payload->'professionals') LOOP
    IF jsonb_typeof(v_item) <> 'string' OR length(trim(v_item #>> '{}')) NOT BETWEEN 1 AND 160 THEN
      RAISE EXCEPTION 'Invalid professional' USING ERRCODE = '22023';
    END IF;
    INSERT INTO luminix.professionals (clinic_id, display_name) VALUES (p_clinic, trim(v_item #>> '{}'));
  END LOOP;
  UPDATE luminix.clinics c SET name = v_name, status = 'active',
    share_code = 'LX-' || upper(substr(replace(c.id::text, '-', ''), 1, 12))
    WHERE c.id = p_clinic AND c.status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Clinic already active' USING ERRCODE = '23505'; END IF;
  UPDATE luminix.onboarding_drafts SET status = 'completed', step = 'review', completed_at = now()
    WHERE clinic_id = p_clinic;
  RETURN QUERY SELECT c.name, c.status, c.share_code, v_draft.version, false
    FROM luminix.clinics c WHERE c.id = p_clinic;
END $$;

REVOKE ALL ON FUNCTION luminix.save_onboarding_draft(uuid, integer, text, jsonb),
  luminix.complete_onboarding(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.save_onboarding_draft(uuid, integer, text, jsonb),
  luminix.complete_onboarding(uuid, integer) TO luminix_api;
GRANT SELECT ON luminix.onboarding_drafts, luminix.occupations, luminix.services,
  luminix.professionals TO luminix_api;
