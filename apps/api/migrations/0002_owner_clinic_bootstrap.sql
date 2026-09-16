-- Global identity-scoped receipt for the first clinic. No direct runtime grants.
CREATE TABLE luminix.owner_clinic_bootstraps (
  identity_id uuid PRIMARY KEY REFERENCES luminix.identities(id),
  clinic_id uuid NOT NULL UNIQUE REFERENCES luminix.clinics(id),
  request_name text NOT NULL CHECK (length(trim(request_name)) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON luminix.owner_clinic_bootstraps FROM PUBLIC;
ALTER TABLE luminix.owner_clinic_bootstraps ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.owner_clinic_bootstraps FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_scope ON luminix.owner_clinic_bootstraps
  USING (identity_id = nullif(current_setting('luminix.identity_id', true), '')::uuid)
  WITH CHECK (identity_id = nullif(current_setting('luminix.identity_id', true), '')::uuid
    AND clinic_id = luminix.current_clinic_id());

-- Narrow bootstrap privilege. Identity is resolved from verified token by the backend.
CREATE FUNCTION luminix.bootstrap_owner_clinic(p_identity uuid, p_name text)
RETURNS TABLE (clinic_id uuid, clinic_name text, clinic_slug text, clinic_status text, created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_clinic uuid;
  v_role uuid;
  v_request text;
  v_previous_identity text := current_setting('luminix.identity_id', true);
  v_previous_clinic text := current_setting('luminix.clinic_id', true);
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Invalid clinic name' USING ERRCODE = '22023';
  END IF;
  -- Serialize duplicate bootstrap and disablement of this identity.
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
    RETURN QUERY SELECT c.id, c.name, c.slug, c.status, false FROM luminix.clinics c WHERE c.id = v_clinic;
  ELSE
    v_clinic := gen_random_uuid();
    v_role := gen_random_uuid();
    PERFORM set_config('luminix.clinic_id', v_clinic::text, true);
    INSERT INTO luminix.clinics (id, name, slug, status)
      VALUES (v_clinic, trim(p_name), 'clinica-' || v_clinic::text, 'draft');
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
    RETURN QUERY SELECT c.id, c.name, c.slug, c.status, true FROM luminix.clinics c WHERE c.id = v_clinic;
  END IF;
  PERFORM set_config('luminix.identity_id', coalesce(v_previous_identity, ''), true);
  PERFORM set_config('luminix.clinic_id', coalesce(v_previous_clinic, ''), true);
END $$;
REVOKE ALL ON FUNCTION luminix.bootstrap_owner_clinic(uuid, text) FROM PUBLIC;
