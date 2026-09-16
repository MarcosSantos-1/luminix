-- No password in migrations. Provision LOGIN/password separately into private env/vault.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'luminix_api') THEN
    CREATE ROLE luminix_api NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END $$;

CREATE FUNCTION luminix.resolve_staff_identity(p_uid text)
RETURNS TABLE (identity_id uuid, identity_status text, created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_created boolean;
BEGIN
  IF p_uid IS NULL OR length(p_uid) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'Invalid UID' USING ERRCODE = '22023';
  END IF;
  INSERT INTO luminix.identities (firebase_uid) VALUES (p_uid)
    ON CONFLICT (firebase_uid) DO NOTHING;
  v_created := FOUND;
  RETURN QUERY SELECT i.id, i.status, v_created FROM luminix.identities i WHERE i.firebase_uid = p_uid;
END $$;

-- Global discovery with minimal projection and explicit identity predicate.
-- Definer must retain BYPASSRLS (verified migration role); callers never receive it.
CREATE FUNCTION luminix.list_staff_clinics(p_identity uuid, p_after uuid DEFAULT NULL)
RETURNS TABLE (clinic_id uuid, clinic_name text, clinic_status text, role_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT c.id, c.name, c.status, r.name
    FROM luminix.clinic_memberships m
    JOIN luminix.identities i ON i.id = m.identity_id AND i.status = 'active'
    JOIN luminix.clinics c ON c.id = m.clinic_id AND c.status IN ('draft', 'active')
    JOIN luminix.roles r ON r.clinic_id = m.clinic_id AND r.id = m.role_id
    WHERE m.identity_id = p_identity AND m.status = 'active' AND (p_after IS NULL OR c.id > p_after)
    ORDER BY c.id LIMIT 51
$$;

CREATE FUNCTION luminix.authorize_staff_clinic(p_identity uuid, p_clinic uuid, p_permission text)
RETURNS TABLE (membership_id uuid, clinic_id uuid, identity_id uuid, role_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_role uuid;
BEGIN
  SELECT m.id, m.role_id INTO v_member, v_role
    FROM luminix.clinic_memberships m
    JOIN luminix.identities i ON i.id = m.identity_id
    JOIN luminix.clinics c ON c.id = m.clinic_id
    JOIN luminix.roles r ON r.clinic_id = m.clinic_id AND r.id = m.role_id
    WHERE m.identity_id = p_identity AND m.clinic_id = p_clinic
      AND m.status = 'active' AND i.status = 'active' AND c.status IN ('draft', 'active')
    FOR SHARE OF i, m, c, r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clinic access denied' USING ERRCODE = '42501'; END IF;
  IF p_permission IS NOT NULL THEN
    PERFORM 1 FROM luminix.role_permissions p
      WHERE p.clinic_id = p_clinic AND p.role_id = v_role AND p.permission_code = p_permission
      FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Clinic access denied' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN QUERY SELECT v_member, p_clinic, p_identity, v_role;
END $$;

REVOKE ALL ON FUNCTION luminix.resolve_staff_identity(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION luminix.list_staff_clinics(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION luminix.authorize_staff_clinic(uuid, uuid, text) FROM PUBLIC;
GRANT USAGE ON SCHEMA luminix TO luminix_api;
GRANT EXECUTE ON FUNCTION luminix.resolve_staff_identity(text), luminix.list_staff_clinics(uuid, uuid),
  luminix.authorize_staff_clinic(uuid, uuid, text), luminix.bootstrap_owner_clinic(uuid, text) TO luminix_api;
GRANT SELECT ON luminix.clinics, luminix.clinic_settings, luminix.role_permissions TO luminix_api;
-- This database is the authorized Luminix database; runtime must not create schemas/temp objects.
DO $$ BEGIN
  EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
END $$;
