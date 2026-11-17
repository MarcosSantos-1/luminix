-- 1. "Minha conta" of a staff member inside a clinic: own name and a small square photo.
-- 2. The photo a client sent through the client area (kept with the account record, TD-012)
--    becomes readable by the clinic staff that already reads that record.

-- 1. Own account -----------------------------------------------------------------------------------

ALTER TABLE luminix.clinic_memberships
  ADD COLUMN photo_data text CHECK (
    photo_data IS NULL OR (photo_data LIKE 'data:image/jpeg;base64,%' AND length(photo_data) <= 200000)
  );

-- The person is always the verified identity of the request; no id is taken as input.
CREATE FUNCTION luminix.own_account(p_clinic uuid)
RETURNS TABLE (display_name text, contact_email text, role_name text, photo_data text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT m.display_name, m.contact_email, r.name, m.photo_data
    FROM luminix.clinic_memberships m
    JOIN luminix.roles r ON r.clinic_id = m.clinic_id AND r.id = m.role_id
   WHERE p_clinic = luminix.current_clinic_id() AND m.clinic_id = p_clinic AND m.status = 'active'
     AND m.identity_id = nullif(current_setting('luminix.identity_id', true), '')::uuid
$$;
REVOKE ALL ON FUNCTION luminix.own_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.own_account(uuid) TO luminix_api;

CREATE FUNCTION luminix.save_own_account(p_clinic uuid, p_name text, p_photo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR length(coalesce(btrim(p_name), '')) NOT BETWEEN 1 AND 120
    OR (p_photo IS NOT NULL AND (p_photo NOT LIKE 'data:image/jpeg;base64,%' OR length(p_photo) > 200000)) THEN
    RAISE EXCEPTION 'Invalid account' USING ERRCODE = '22023';
  END IF;
  UPDATE luminix.clinic_memberships SET display_name = btrim(p_name), photo_data = p_photo
   WHERE clinic_id = p_clinic AND status = 'active'
     AND identity_id = nullif(current_setting('luminix.identity_id', true), '')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid account' USING ERRCODE = '22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.save_own_account(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.save_own_account(uuid, text, text) TO luminix_api;

-- 2. Client account photo ----------------------------------------------------------------------------

-- Same source the client area uses: the account record when shared, else the clinic's own copy.
CREATE FUNCTION luminix.clinic_client_has_account_photo(p_clinic uuid, p_client uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce((
    SELECT CASE WHEN cc.anamnesis_shared THEN p.photo_data IS NOT NULL
                ELSE cc.client_photo_data IS NOT NULL END
      FROM luminix.clinic_clients cc
      LEFT JOIN luminix.client_profiles p ON p.id = cc.client_profile_id
     WHERE p_clinic = luminix.current_clinic_id() AND cc.clinic_id = p_clinic AND cc.id = p_client
       AND cc.client_removed_at IS NULL), false)
$$;
REVOKE ALL ON FUNCTION luminix.clinic_client_has_account_photo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.clinic_client_has_account_photo(uuid, uuid) TO luminix_api;

CREATE FUNCTION luminix.clinic_client_account_photo(p_clinic uuid, p_client uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_photo text;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid client' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'client:read');
  SELECT CASE WHEN cc.anamnesis_shared THEN p.photo_data ELSE cc.client_photo_data END INTO v_photo
    FROM luminix.clinic_clients cc
    LEFT JOIN luminix.client_profiles p ON p.id = cc.client_profile_id
   WHERE cc.clinic_id = p_clinic AND cc.id = p_client AND cc.client_removed_at IS NULL;
  RETURN v_photo;
END $$;
REVOKE ALL ON FUNCTION luminix.clinic_client_account_photo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.clinic_client_account_photo(uuid, uuid) TO luminix_api;
