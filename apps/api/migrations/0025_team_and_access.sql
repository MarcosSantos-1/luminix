-- Team (professionals, services, weekly hours) and staff access (logins, role presets).
-- Additive: two permissions, three nullable membership columns, functions and one trigger.
-- Agenda routes move from clinic:manage to agenda:* so reception can schedule without editing
-- the establishment. Every existing role that had clinic:manage receives both agenda grants.

-- 1. Permissions and role presets ---------------------------------------------------------

INSERT INTO luminix.permissions (code, description) VALUES
  ('agenda:read', 'Consultar agenda'),
  ('agenda:manage', 'Marcar e alterar atendimentos')
ON CONFLICT (code) DO NOTHING;

-- Fixed presets: simpler for non-technical managers than free permission matrices.
CREATE FUNCTION luminix.role_preset_permissions(p_role text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN ARRAY['clinic:manage', 'team:manage', 'client:read', 'client:manage',
      'professional:manage', 'service:manage', 'settings:manage', 'onboarding:manage',
      'audit:read', 'agenda:read', 'agenda:manage']
    WHEN 'manager' THEN ARRAY['clinic:manage', 'team:manage', 'client:read', 'client:manage',
      'professional:manage', 'service:manage', 'settings:manage', 'audit:read',
      'agenda:read', 'agenda:manage']
    WHEN 'reception' THEN ARRAY['client:read', 'client:manage', 'agenda:read', 'agenda:manage']
    WHEN 'professional' THEN ARRAY['client:read', 'agenda:read']
  END
$$;
REVOKE ALL ON FUNCTION luminix.role_preset_permissions(text) FROM PUBLIC;

-- Idempotent: creates the four preset roles and aligns their grants.
CREATE FUNCTION luminix.ensure_clinic_roles(p_clinic uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_name text; v_role uuid; v_grants text[];
BEGIN
  FOREACH v_name IN ARRAY ARRAY['owner', 'manager', 'reception', 'professional'] LOOP
    v_grants := luminix.role_preset_permissions(v_name);
    INSERT INTO luminix.roles (clinic_id, name) VALUES (p_clinic, v_name)
      ON CONFLICT (clinic_id, name) DO NOTHING;
    SELECT id INTO v_role FROM luminix.roles WHERE clinic_id = p_clinic AND name = v_name;
    INSERT INTO luminix.role_permissions (clinic_id, role_id, permission_code)
      SELECT p_clinic, v_role, grant_code FROM unnest(v_grants) AS grant_code
      ON CONFLICT DO NOTHING;
    DELETE FROM luminix.role_permissions
      WHERE clinic_id = p_clinic AND role_id = v_role AND permission_code <> ALL (v_grants);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION luminix.ensure_clinic_roles(uuid) FROM PUBLIC;

-- clinic_settings is inserted last by bootstrap_owner_clinic, after the owner role exists.
CREATE FUNCTION luminix.ensure_roles_on_clinic_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM luminix.ensure_clinic_roles(NEW.clinic_id);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION luminix.ensure_roles_on_clinic_settings() FROM PUBLIC;
CREATE TRIGGER ensure_clinic_roles AFTER INSERT ON luminix.clinic_settings
  FOR EACH ROW EXECUTE FUNCTION luminix.ensure_roles_on_clinic_settings();

ALTER TABLE luminix.roles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE luminix.role_permissions NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT clinic_id FROM luminix.clinic_settings LOOP
    PERFORM luminix.ensure_clinic_roles(r.clinic_id);
  END LOOP;
END $$;
ALTER TABLE luminix.role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE luminix.roles FORCE ROW LEVEL SECURITY;

-- 2. Staff access ---------------------------------------------------------------------------

ALTER TABLE luminix.clinic_memberships
  ADD COLUMN display_name text CHECK (display_name IS NULL OR length(trim(display_name)) BETWEEN 1 AND 120),
  ADD COLUMN contact_email text CHECK (contact_email IS NULL OR (length(contact_email) <= 254
    AND contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  ADD COLUMN invited_at timestamptz;

-- firebase_uid is returned to the API only, to look up last sign-in; the API never sends it.
CREATE FUNCTION luminix.list_staff_members(p_clinic uuid)
RETURNS TABLE (membership_id uuid, display_name text, contact_email text, role_name text,
  status text, firebase_uid text, is_self boolean, professional_id uuid,
  invited_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_self uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_self FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'team:manage') a;
  RETURN QUERY
    SELECT m.id, m.display_name, m.contact_email, r.name, m.status, i.firebase_uid,
      m.id = v_self, p.id, m.invited_at, m.created_at
    FROM luminix.clinic_memberships m
    JOIN luminix.roles r ON r.clinic_id = m.clinic_id AND r.id = m.role_id
    JOIN luminix.identities i ON i.id = m.identity_id
    LEFT JOIN luminix.professionals p ON p.clinic_id = m.clinic_id AND p.membership_id = m.id
      AND p.status = 'active'
    WHERE m.clinic_id = p_clinic
    ORDER BY (r.name = 'owner') DESC, m.status, coalesce(m.display_name, ''), m.created_at
    LIMIT 200;
END $$;
REVOKE ALL ON FUNCTION luminix.list_staff_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.list_staff_members(uuid) TO luminix_api;

-- Only the owner grants or changes the manager level; nobody grants owner through the panel.
CREATE FUNCTION luminix.invite_staff_member(
  p_clinic uuid, p_identity uuid, p_role text, p_name text, p_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_caller_role text; v_role uuid; v_member uuid; v_status text;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR p_role NOT IN ('manager', 'reception', 'professional')
    OR length(coalesce(btrim(p_name), '')) NOT BETWEEN 1 AND 120
    OR coalesce(p_email, '') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(p_email) > 254 THEN
    RAISE EXCEPTION 'Invalid invitation' USING ERRCODE = '22023';
  END IF;
  SELECT r.name INTO v_caller_role
    FROM luminix.authorize_staff_clinic(
      nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'team:manage') a
    JOIN luminix.roles r ON r.clinic_id = p_clinic AND r.id = a.role_id;
  IF p_role = 'manager' AND v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the owner grants manager access' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM luminix.clinics WHERE id = p_clinic AND status = 'active') THEN
    RAISE EXCEPTION 'Complete onboarding first' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.identities WHERE id = p_identity AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Identity unavailable' USING ERRCODE = '22023'; END IF;
  PERFORM luminix.ensure_clinic_roles(p_clinic);
  SELECT id INTO v_role FROM luminix.roles WHERE clinic_id = p_clinic AND name = p_role;
  SELECT id, status INTO v_member, v_status FROM luminix.clinic_memberships
    WHERE clinic_id = p_clinic AND identity_id = p_identity FOR UPDATE;
  IF v_member IS NOT NULL AND v_status = 'active' THEN
    RAISE EXCEPTION 'Already a member' USING ERRCODE = '23505';
  END IF;
  IF v_member IS NOT NULL AND EXISTS (SELECT 1 FROM luminix.clinic_memberships m
      JOIN luminix.roles r ON r.clinic_id = m.clinic_id AND r.id = m.role_id
      WHERE m.id = v_member AND r.name IN ('owner', 'manager')) AND v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the owner restores this access' USING ERRCODE = '42501';
  END IF;
  IF v_member IS NULL THEN
    INSERT INTO luminix.clinic_memberships
      (clinic_id, identity_id, role_id, status, display_name, contact_email, invited_at)
    VALUES (p_clinic, p_identity, v_role, 'active', btrim(p_name), lower(btrim(p_email)), now())
    RETURNING id INTO v_member;
  ELSE
    UPDATE luminix.clinic_memberships SET role_id = v_role, status = 'active',
        display_name = btrim(p_name), contact_email = lower(btrim(p_email)), invited_at = now()
      WHERE id = v_member;
  END IF;
  RETURN v_member;
END $$;
REVOKE ALL ON FUNCTION luminix.invite_staff_member(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.invite_staff_member(uuid, uuid, text, text, text) TO luminix_api;

-- Name, level or status. The owner membership and the caller's own access are never changed
-- here, so a clinic cannot lock itself out.
CREATE FUNCTION luminix.update_staff_member(
  p_clinic uuid, p_member uuid, p_role text, p_status text, p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_caller uuid; v_caller_role text; v_target_role text; v_role uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR (p_role IS NOT NULL AND p_role NOT IN ('manager', 'reception', 'professional'))
    OR (p_status IS NOT NULL AND p_status NOT IN ('active', 'revoked'))
    OR (p_name IS NOT NULL AND length(btrim(p_name)) NOT BETWEEN 1 AND 120) THEN
    RAISE EXCEPTION 'Invalid member change' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id, r.name INTO v_caller, v_caller_role
    FROM luminix.authorize_staff_clinic(
      nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'team:manage') a
    JOIN luminix.roles r ON r.clinic_id = p_clinic AND r.id = a.role_id;
  SELECT r.name INTO v_target_role FROM luminix.clinic_memberships m
    JOIN luminix.roles r ON r.clinic_id = m.clinic_id AND r.id = m.role_id
    WHERE m.clinic_id = p_clinic AND m.id = p_member FOR UPDATE OF m;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'Member not found' USING ERRCODE = '22023'; END IF;
  IF (p_role IS NOT NULL OR p_status IS NOT NULL) AND (p_member = v_caller OR v_target_role = 'owner') THEN
    RAISE EXCEPTION 'Protected member' USING ERRCODE = '42501';
  END IF;
  IF (v_target_role = 'manager' OR p_role = 'manager') AND v_caller_role <> 'owner'
    AND (p_role IS NOT NULL OR p_status IS NOT NULL) THEN
    RAISE EXCEPTION 'Only the owner changes manager access' USING ERRCODE = '42501';
  END IF;
  IF p_role IS NOT NULL THEN
    PERFORM luminix.ensure_clinic_roles(p_clinic);
    SELECT id INTO v_role FROM luminix.roles WHERE clinic_id = p_clinic AND name = p_role;
  END IF;
  UPDATE luminix.clinic_memberships SET
      role_id = coalesce(v_role, role_id),
      status = coalesce(p_status, status),
      display_name = coalesce(btrim(p_name), display_name)
    WHERE clinic_id = p_clinic AND id = p_member;
END $$;
REVOKE ALL ON FUNCTION luminix.update_staff_member(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.update_staff_member(uuid, uuid, text, text, text) TO luminix_api;

-- 3. Team: professionals, services and weekly hours ---------------------------------------

CREATE FUNCTION luminix.save_professional(p_clinic uuid, p_professional jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_id uuid; v_photo uuid; v_member uuid; v_day jsonb; v_clinic_day record; v_service uuid;
  v_sensitive boolean; v_audience text; v_periods jsonb; v_breaks jsonb; v_cursor text; v_break jsonb;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR jsonb_typeof(p_professional) IS DISTINCT FROM 'object'
    OR coalesce(p_professional->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid professional' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'professional:manage');
  IF NOT EXISTS (SELECT 1 FROM luminix.clinics WHERE id = p_clinic AND status = 'active') THEN
    RAISE EXCEPTION 'Complete onboarding first' USING ERRCODE = '22023';
  END IF;
  v_id := (p_professional->>'id')::uuid;
  IF length(coalesce(btrim(p_professional->>'name'), '')) NOT BETWEEN 1 AND 160
    OR length(coalesce(btrim(p_professional->>'role'), '')) > 120
    OR coalesce(p_professional->>'gender', 'female') NOT IN ('female', 'male')
    OR coalesce(p_professional->>'audience', 'all') NOT IN ('all', 'women', 'men')
    OR jsonb_typeof(p_professional->'serviceIds') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_professional->'serviceIds') > 80
    OR jsonb_typeof(p_professional->'days') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_professional->'days') <> 7
    OR (SELECT count(DISTINCT d->>'weekday') FROM jsonb_array_elements(p_professional->'days') d) <> 7 THEN
    RAISE EXCEPTION 'Invalid professional' USING ERRCODE = '22023';
  END IF;
  IF nullif(p_professional->>'photoAssetId', '') IS NOT NULL THEN
    v_photo := (p_professional->>'photoAssetId')::uuid;
    PERFORM 1 FROM luminix.media_assets WHERE clinic_id = p_clinic AND id = v_photo
      AND kind = 'professional_photo' AND subject_ref = v_id AND status = 'ready';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid professional photo' USING ERRCODE = '22023'; END IF;
  END IF;
  IF nullif(p_professional->>'membershipId', '') IS NOT NULL THEN
    v_member := (p_professional->>'membershipId')::uuid;
    PERFORM 1 FROM luminix.clinic_memberships WHERE clinic_id = p_clinic AND id = v_member AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid member link' USING ERRCODE = '22023'; END IF;
  END IF;

  INSERT INTO luminix.professionals (id, clinic_id, display_name, role_name, gender, audience,
      photo_asset_id, membership_id, status)
    VALUES (v_id, p_clinic, btrim(p_professional->>'name'), nullif(btrim(p_professional->>'role'), ''),
      coalesce(p_professional->>'gender', 'female'), coalesce(p_professional->>'audience', 'all'),
      v_photo, v_member, 'active')
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role_name = EXCLUDED.role_name,
      gender = EXCLUDED.gender, audience = EXCLUDED.audience, photo_asset_id = EXCLUDED.photo_asset_id,
      membership_id = EXCLUDED.membership_id, status = 'active'
    WHERE luminix.professionals.clinic_id = p_clinic;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid professional' USING ERRCODE = '22023'; END IF;

  DELETE FROM luminix.professional_services WHERE clinic_id = p_clinic AND professional_id = v_id;
  FOR v_service IN SELECT (value #>> '{}')::uuid FROM jsonb_array_elements(p_professional->'serviceIds') LOOP
    SELECT is_sensitive, audience INTO v_sensitive, v_audience FROM luminix.services
      WHERE clinic_id = p_clinic AND id = v_service AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid professional service' USING ERRCODE = '22023'; END IF;
    v_audience := CASE WHEN v_sensitive
      THEN coalesce(p_professional->'serviceAudiences'->>v_service::text, v_audience, 'all') END;
    IF v_audience IS NOT NULL AND v_audience NOT IN ('all', 'women', 'men') THEN
      RAISE EXCEPTION 'Invalid professional audience' USING ERRCODE = '22023';
    END IF;
    INSERT INTO luminix.professional_services (clinic_id, professional_id, service_id, audience)
      VALUES (p_clinic, v_id, v_service, v_audience) ON CONFLICT DO NOTHING;
  END LOOP;

  -- Same day validation as onboarding: inside the clinic's opening hours for that weekday.
  FOR v_day IN SELECT value FROM jsonb_array_elements(p_professional->'days') LOOP
    SELECT w.is_available,
        (SELECT min(p->>'start') FROM jsonb_array_elements(w.periods) p) AS opens,
        (SELECT max(p->>'end') FROM jsonb_array_elements(w.periods) p) AS closes
      INTO v_clinic_day FROM luminix.weekly_availability w
      WHERE w.clinic_id = p_clinic AND w.weekday::text = v_day->>'weekday';
    IF jsonb_typeof(v_day) <> 'object' OR coalesce(v_day->>'weekday', '') !~ '^[0-6]$'
      OR coalesce(v_day->>'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      OR coalesce(v_day->>'end', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      OR jsonb_typeof(v_day->'enabled') IS DISTINCT FROM 'boolean'
      OR (v_day->'breaks' IS NOT NULL AND jsonb_typeof(v_day->'breaks') <> 'array')
      OR jsonb_array_length(coalesce(v_day->'breaks', '[]'::jsonb)) > 4
      OR ((v_day->>'enabled')::boolean AND (
        (v_day->>'start')::time >= (v_day->>'end')::time
        OR NOT coalesce(v_clinic_day.is_available, false)
        OR (v_day->>'start') < v_clinic_day.opens OR (v_day->>'end') > v_clinic_day.closes)) THEN
      RAISE EXCEPTION 'Invalid professional hours' USING ERRCODE = '22023';
    END IF;
    -- Breaks must be ordered, inside the day and not overlapping.
    v_cursor := v_day->>'start';
    FOR v_break IN SELECT value FROM jsonb_array_elements(coalesce(v_day->'breaks', '[]'::jsonb))
        ORDER BY value->>'start' LOOP
      IF coalesce(v_break->>'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        OR coalesce(v_break->>'end', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        OR (v_break->>'start') < v_cursor OR (v_break->>'end') <= (v_break->>'start')
        OR (v_break->>'end') > (v_day->>'end') THEN
        RAISE EXCEPTION 'Invalid professional break' USING ERRCODE = '22023';
      END IF;
      v_cursor := v_break->>'end';
    END LOOP;
    v_periods := CASE WHEN (v_day->>'enabled')::boolean THEN luminix.business_day_to_periods(v_day) ELSE '[]'::jsonb END;
    INSERT INTO luminix.professional_weekly_availability
        (clinic_id, professional_id, weekday, is_available, periods, day_schedule)
      VALUES (p_clinic, v_id, (v_day->>'weekday')::smallint, (v_day->>'enabled')::boolean, v_periods,
        jsonb_build_object('weekday', (v_day->>'weekday')::integer, 'enabled', (v_day->>'enabled')::boolean,
          'start', v_day->>'start', 'end', v_day->>'end', 'breaks', coalesce(v_day->'breaks', '[]'::jsonb)))
    ON CONFLICT (clinic_id, professional_id, weekday) DO UPDATE SET
      is_available = EXCLUDED.is_available, periods = EXCLUDED.periods,
      day_schedule = EXCLUDED.day_schedule, updated_at = now();
  END LOOP;

  UPDATE luminix.clinic_profiles SET team_mode = CASE WHEN (SELECT count(*) FROM luminix.professionals
      WHERE clinic_id = p_clinic AND status = 'active') > 1 THEN 'team' ELSE 'solo' END
    WHERE clinic_id = p_clinic;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION luminix.save_professional(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.save_professional(uuid, jsonb) TO luminix_api;

-- Archive keeps appointments and history; at least one active professional must remain.
CREATE FUNCTION luminix.archive_professional(p_clinic uuid, p_professional uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'professional:manage');
  PERFORM 1 FROM luminix.professionals
    WHERE clinic_id = p_clinic AND id = p_professional AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Professional not found' USING ERRCODE = '22023'; END IF;
  IF (SELECT count(*) FROM luminix.professionals WHERE clinic_id = p_clinic AND status = 'active') <= 1 THEN
    RAISE EXCEPTION 'Keep at least one professional' USING ERRCODE = '22023';
  END IF;
  UPDATE luminix.professionals SET status = 'archived', membership_id = NULL
    WHERE clinic_id = p_clinic AND id = p_professional;
  UPDATE luminix.clinic_profiles SET team_mode = CASE WHEN (SELECT count(*) FROM luminix.professionals
      WHERE clinic_id = p_clinic AND status = 'active') > 1 THEN 'team' ELSE 'solo' END
    WHERE clinic_id = p_clinic;
END $$;
REVOKE ALL ON FUNCTION luminix.archive_professional(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.archive_professional(uuid, uuid) TO luminix_api;
