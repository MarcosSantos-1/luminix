-- One switchable level: Recepção and Profissional become Equipe (`team`) — ADR-034.
--
-- Small clinics rarely separate front desk from the professional, so the panel now offers
-- Gerente (fixed, full) and Equipe (fixed base + options the owner/manager switch per clinic).
-- 1. Existing clinics keep what their people could already do: an Equipe option starts on when
--    it was on for Recepção or Profissional there. New clinics get the defaults below.
-- 2. Members of both old levels move to Equipe; the old roles and their grants are removed.

-- 1. Carry over the choices before the old levels disappear -------------------------------

CREATE TEMP TABLE team_carry AS
  SELECT s.clinic_id, o.permission_code,
    bool_or(coalesce(c.enabled, o.enabled_by_default)) AS enabled
  FROM luminix.clinic_settings s
  CROSS JOIN unnest(ARRAY['reception', 'professional']) AS r(name)
  CROSS JOIN LATERAL luminix.role_optional_permissions(r.name) o
  LEFT JOIN luminix.role_permission_choices c ON c.clinic_id = s.clinic_id
    AND c.role_name = r.name AND c.permission_code = o.permission_code
  GROUP BY s.clinic_id, o.permission_code;

-- 2. Levels ----------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION luminix.role_preset_permissions(p_role text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN ARRAY['clinic:manage', 'team:manage', 'client:read', 'client:manage',
      'professional:manage', 'service:manage', 'settings:manage', 'onboarding:manage',
      'audit:read', 'agenda:read', 'agenda:manage', 'media:read', 'media:manage',
      'finance:manage', 'inventory:manage', 'schedule:manage', 'vacation:manage',
      'marketing:manage']
    WHEN 'manager' THEN ARRAY['clinic:manage', 'team:manage', 'client:read', 'client:manage',
      'professional:manage', 'service:manage', 'settings:manage', 'audit:read',
      'agenda:read', 'agenda:manage', 'media:read', 'media:manage', 'finance:manage',
      'inventory:manage', 'schedule:manage', 'vacation:manage', 'marketing:manage']
    WHEN 'team' THEN ARRAY['client:read', 'agenda:read', 'media:read']
  END
$$;

-- Keep in sync with apps/admin/lib/access.ts (labels); the database is the authority.
CREATE OR REPLACE FUNCTION luminix.role_optional_permissions(p_role text)
RETURNS TABLE (permission_code text, enabled_by_default boolean)
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT o.code, o.enabled FROM (VALUES
    ('team', 'agenda:manage', true),
    ('team', 'client:manage', true),
    ('team', 'service:manage', true),
    ('team', 'inventory:manage', true),
    ('team', 'media:manage', true),
    ('team', 'schedule:manage', true),
    ('team', 'marketing:manage', false),
    ('team', 'vacation:manage', false)
  ) AS o(role, code, enabled)
  WHERE o.role = p_role
$$;

ALTER TABLE luminix.role_permission_choices
  DROP CONSTRAINT IF EXISTS role_permission_choices_role_name_check;

CREATE OR REPLACE FUNCTION luminix.ensure_clinic_roles(p_clinic uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_name text; v_role uuid; v_grants text[];
BEGIN
  FOREACH v_name IN ARRAY ARRAY['owner', 'manager', 'team'] LOOP
    v_grants := luminix.role_preset_permissions(v_name) || coalesce(ARRAY(
      SELECT o.permission_code FROM luminix.role_optional_permissions(v_name) o
        LEFT JOIN luminix.role_permission_choices c ON c.clinic_id = p_clinic
          AND c.role_name = v_name AND c.permission_code = o.permission_code
        WHERE coalesce(c.enabled, o.enabled_by_default)), ARRAY[]::text[]);
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

CREATE OR REPLACE FUNCTION luminix.list_role_options(p_clinic uuid)
RETURNS TABLE (role_name text, permission_code text, enabled boolean, enabled_by_default boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'team:manage');
  RETURN QUERY
    SELECT 'team'::text, o.permission_code, coalesce(c.enabled, o.enabled_by_default),
      o.enabled_by_default
    FROM luminix.role_optional_permissions('team') o
    LEFT JOIN luminix.role_permission_choices c ON c.clinic_id = p_clinic
      AND c.role_name = 'team' AND c.permission_code = o.permission_code;
END $$;

-- Only Equipe options are accepted, so finance, settings and access never reach it.
CREATE OR REPLACE FUNCTION luminix.set_role_option(
  p_clinic uuid, p_role text, p_permission text, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_enabled IS NULL
    OR p_role IS DISTINCT FROM 'team'
    OR NOT EXISTS (SELECT 1 FROM luminix.role_optional_permissions(p_role) o
      WHERE o.permission_code = p_permission) THEN
    RAISE EXCEPTION 'Invalid option' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'team:manage') a;
  INSERT INTO luminix.role_permission_choices
      (clinic_id, role_name, permission_code, enabled, updated_by_membership_id)
    VALUES (p_clinic, p_role, p_permission, p_enabled, v_member)
  ON CONFLICT (clinic_id, role_name, permission_code) DO UPDATE SET
    enabled = EXCLUDED.enabled, updated_by_membership_id = EXCLUDED.updated_by_membership_id,
    updated_at = now();
  PERFORM luminix.ensure_clinic_roles(p_clinic);
END $$;

-- 3. Inviting and changing people: Gerente or Equipe -----------------------------------------

CREATE OR REPLACE FUNCTION luminix.invite_staff_member(
  p_clinic uuid, p_identity uuid, p_role text, p_name text, p_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_caller_role text; v_role uuid; v_member uuid; v_status text;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR p_role NOT IN ('manager', 'team')
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
CREATE OR REPLACE FUNCTION luminix.update_staff_member(
  p_clinic uuid, p_member uuid, p_role text, p_status text, p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_caller uuid; v_caller_role text; v_target_role text; v_role uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR (p_role IS NOT NULL AND p_role NOT IN ('manager', 'team'))
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

-- 4. Move every clinic to Equipe -------------------------------------------------------------

ALTER TABLE luminix.roles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE luminix.role_permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE luminix.clinic_memberships NO FORCE ROW LEVEL SECURITY;
ALTER TABLE luminix.role_permission_choices NO FORCE ROW LEVEL SECURITY;

DELETE FROM luminix.role_permission_choices WHERE role_name IN ('reception', 'professional');
INSERT INTO luminix.role_permission_choices (clinic_id, role_name, permission_code, enabled)
  SELECT t.clinic_id, 'team', t.permission_code, t.enabled
  FROM team_carry t
  JOIN luminix.role_optional_permissions('team') o ON o.permission_code = t.permission_code
  WHERE t.enabled IS DISTINCT FROM o.enabled_by_default
ON CONFLICT (clinic_id, role_name, permission_code) DO NOTHING;
DROP TABLE team_carry;
ALTER TABLE luminix.role_permission_choices
  ADD CONSTRAINT role_permission_choices_role_name_check CHECK (role_name = 'team');

DO $$
DECLARE r record; v_team uuid;
BEGIN
  FOR r IN SELECT clinic_id FROM luminix.clinic_settings LOOP
    PERFORM luminix.ensure_clinic_roles(r.clinic_id);
    SELECT id INTO v_team FROM luminix.roles WHERE clinic_id = r.clinic_id AND name = 'team';
    UPDATE luminix.clinic_memberships m SET role_id = v_team
      FROM luminix.roles old
      WHERE old.clinic_id = r.clinic_id AND old.id = m.role_id
        AND old.name IN ('reception', 'professional') AND m.clinic_id = r.clinic_id;
  END LOOP;
END $$;
DELETE FROM luminix.role_permissions rp USING luminix.roles r
  WHERE r.clinic_id = rp.clinic_id AND r.id = rp.role_id AND r.name IN ('reception', 'professional');
DELETE FROM luminix.roles WHERE name IN ('reception', 'professional')
  AND NOT EXISTS (SELECT 1 FROM luminix.clinic_memberships m
    WHERE m.clinic_id = luminix.roles.clinic_id AND m.role_id = luminix.roles.id);

ALTER TABLE luminix.role_permission_choices FORCE ROW LEVEL SECURITY;
ALTER TABLE luminix.clinic_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE luminix.role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE luminix.roles FORCE ROW LEVEL SECURITY;
