-- Access levels with per-clinic options (ADR-024).
--
-- 1. Finer permissions: the space's hours and one-off closed days (schedule:manage) are now
--    separate from vacations and leaves (vacation:manage) and from editing the establishment
--    (clinic:manage). Marketing gets its own permission (marketing:manage).
-- 2. Each level = fixed base (role_preset_permissions) + options the owner/manager may switch
--    per clinic for Recepção and Profissional (role_optional_permissions + choices table).
--    Finance, reports, settings, access, payments and onboarding are never optional for them.

-- 1. Permissions ---------------------------------------------------------------------------

INSERT INTO luminix.permissions (code, description) VALUES
  ('schedule:manage', 'Alterar horários de funcionamento e fechar dias avulsos'),
  ('vacation:manage', 'Lançar férias e afastamentos'),
  ('marketing:manage', 'Planejar e editar o marketing')
ON CONFLICT (code) DO NOTHING;

-- Fixed part of each level: always granted, never switched in the panel.
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
    WHEN 'reception' THEN ARRAY['client:read', 'agenda:read', 'media:read']
    WHEN 'professional' THEN ARRAY['client:read', 'agenda:read', 'media:read']
  END
$$;

-- What the panel may switch per level, and the default when the clinic never chose.
-- Keep in sync with apps/admin/lib/access.ts (labels) — the database is the authority.
CREATE FUNCTION luminix.role_optional_permissions(p_role text)
RETURNS TABLE (permission_code text, enabled_by_default boolean)
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT o.code, o.enabled FROM (VALUES
    ('reception', 'agenda:manage', true),
    ('reception', 'client:manage', true),
    ('reception', 'inventory:manage', true),
    ('reception', 'service:manage', false),
    ('reception', 'marketing:manage', false),
    ('reception', 'media:manage', false),
    ('reception', 'schedule:manage', false),
    ('reception', 'vacation:manage', false),
    ('professional', 'agenda:manage', false),
    ('professional', 'client:manage', false),
    ('professional', 'inventory:manage', true),
    ('professional', 'service:manage', true),
    ('professional', 'marketing:manage', true),
    ('professional', 'media:manage', true),
    ('professional', 'schedule:manage', true),
    ('professional', 'vacation:manage', false)
  ) AS o(role, code, enabled)
  WHERE o.role = p_role
$$;
REVOKE ALL ON FUNCTION luminix.role_optional_permissions(text) FROM PUBLIC;

-- 2. Per-clinic choices --------------------------------------------------------------------

CREATE TABLE luminix.role_permission_choices (
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  role_name text NOT NULL CHECK (role_name IN ('reception', 'professional')),
  permission_code text NOT NULL REFERENCES luminix.permissions(code),
  enabled boolean NOT NULL,
  updated_by_membership_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, role_name, permission_code),
  FOREIGN KEY (clinic_id, updated_by_membership_id)
    REFERENCES luminix.clinic_memberships(clinic_id, id)
);
ALTER TABLE luminix.role_permission_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.role_permission_choices FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.role_permission_choices
  USING (clinic_id = luminix.current_clinic_id())
  WITH CHECK (clinic_id = luminix.current_clinic_id());
CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.role_permission_choices
  FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.role_permission_choices
  FOR EACH ROW EXECUTE FUNCTION luminix.audit_change();
REVOKE ALL ON luminix.role_permission_choices FROM PUBLIC;

-- Grants = base ∪ options switched on (the clinic's choice, or the default).
CREATE OR REPLACE FUNCTION luminix.ensure_clinic_roles(p_clinic uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_name text; v_role uuid; v_grants text[];
BEGIN
  FOREACH v_name IN ARRAY ARRAY['owner', 'manager', 'reception', 'professional'] LOOP
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

-- Options of both switchable levels with their current state (team:manage).
CREATE FUNCTION luminix.list_role_options(p_clinic uuid)
RETURNS TABLE (role_name text, permission_code text, enabled boolean, enabled_by_default boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'team:manage');
  RETURN QUERY
    SELECT r.name, o.permission_code, coalesce(c.enabled, o.enabled_by_default), o.enabled_by_default
    FROM unnest(ARRAY['reception', 'professional']) AS r(name)
    CROSS JOIN LATERAL luminix.role_optional_permissions(r.name) o
    LEFT JOIN luminix.role_permission_choices c ON c.clinic_id = p_clinic
      AND c.role_name = r.name AND c.permission_code = o.permission_code;
END $$;
REVOKE ALL ON FUNCTION luminix.list_role_options(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.list_role_options(uuid) TO luminix_api;

-- Switches one option. Only options listed for the level are accepted, so nothing outside the
-- whitelist (finance, settings, access…) can ever reach Recepção or Profissional.
CREATE FUNCTION luminix.set_role_option(
  p_clinic uuid, p_role text, p_permission text, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_enabled IS NULL
    OR p_role NOT IN ('reception', 'professional')
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
REVOKE ALL ON FUNCTION luminix.set_role_option(uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_role_option(uuid, text, text, boolean) TO luminix_api;

-- 3. Schedule, vacations and marketing use the new permissions ------------------------------

-- People away (vacation, leave) need vacation:manage; closing the space for maintenance,
-- an event, a course… is a one-off closure (schedule:manage).
CREATE FUNCTION luminix.closure_permission(p_kind text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN p_kind IN ('vacation', 'collective_vacation', 'sick_leave', 'bereavement')
    THEN 'vacation:manage' ELSE 'schedule:manage' END
$$;
REVOKE ALL ON FUNCTION luminix.closure_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.closure_permission(text) TO luminix_api;

CREATE OR REPLACE FUNCTION luminix.save_weekly_availability(
  p_clinic uuid, p_weekday smallint, p_is_available boolean, p_periods jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'schedule:manage');
  INSERT INTO luminix.weekly_availability (clinic_id, weekday, is_available, periods)
  VALUES (p_clinic, p_weekday, p_is_available, p_periods)
  ON CONFLICT (clinic_id, weekday) DO UPDATE SET
    is_available = EXCLUDED.is_available, periods = EXCLUDED.periods, updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION luminix.save_schedule_override(
  p_clinic uuid, p_date date, p_use_default boolean, p_is_available boolean,
  p_periods jsonb, p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'schedule:manage');
  IF p_use_default THEN
    DELETE FROM luminix.schedule_overrides WHERE clinic_id = p_clinic AND local_date = p_date;
    RETURN;
  END IF;
  INSERT INTO luminix.schedule_overrides (clinic_id, local_date, is_available, periods, reason)
  VALUES (p_clinic, p_date, p_is_available, p_periods, p_reason)
  ON CONFLICT (clinic_id, local_date) DO UPDATE SET
    is_available = EXCLUDED.is_available, periods = EXCLUDED.periods,
    reason = EXCLUDED.reason, updated_at = now();
END $$;

-- One professional's hours on one date: a one-off change, like closing the space for a day.
CREATE OR REPLACE FUNCTION luminix.save_professional_override(
  p_clinic uuid, p_professional uuid, p_date date, p_use_default boolean,
  p_is_available boolean, p_periods jsonb, p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_professional IS NULL
    OR p_date IS NULL THEN
    RAISE EXCEPTION 'Invalid override' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'schedule:manage');
  PERFORM 1 FROM luminix.professionals
    WHERE clinic_id = p_clinic AND id = p_professional AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid professional' USING ERRCODE = '22023'; END IF;
  IF p_use_default THEN
    DELETE FROM luminix.professional_schedule_overrides
      WHERE clinic_id = p_clinic AND professional_id = p_professional AND local_date = p_date;
    RETURN;
  END IF;
  INSERT INTO luminix.professional_schedule_overrides
      (clinic_id, professional_id, local_date, is_available, periods, reason)
    VALUES (p_clinic, p_professional, p_date, p_is_available, p_periods, nullif(btrim(p_reason), ''))
  ON CONFLICT (clinic_id, professional_id, local_date) DO UPDATE SET
    is_available = EXCLUDED.is_available, periods = EXCLUDED.periods,
    reason = EXCLUDED.reason, updated_at = now();
END $$;

-- An edit needs the permission of the old kind and of the new one (no turning a vacation
-- into "maintenance" to remove it without vacation:manage).
CREATE OR REPLACE FUNCTION luminix.save_schedule_closure(
  p_clinic uuid, p_id uuid, p_professional uuid, p_starts date, p_ends date, p_kind text,
  p_note text
) RETURNS luminix.schedule_closures
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE result luminix.schedule_closures%ROWTYPE; v_member uuid; v_previous text;
  v_identity uuid := nullif(current_setting('luminix.identity_id', true), '')::uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid closure' USING ERRCODE = '22023';
  END IF;
  SELECT membership_id INTO v_member FROM luminix.authorize_staff_clinic(v_identity, p_clinic,
    luminix.closure_permission(p_kind));
  IF p_professional IS NOT NULL THEN
    PERFORM 1 FROM luminix.professionals
      WHERE clinic_id = p_clinic AND id = p_professional AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid professional' USING ERRCODE = '22023'; END IF;
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO luminix.schedule_closures
      (clinic_id, professional_id, starts_on, ends_on, kind, note, created_by_membership_id)
    VALUES (p_clinic, p_professional, p_starts, p_ends, p_kind, nullif(trim(p_note), ''), v_member)
    RETURNING * INTO result;
    RETURN result;
  END IF;
  SELECT kind INTO v_previous FROM luminix.schedule_closures
    WHERE clinic_id = p_clinic AND id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Closure not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(v_identity, p_clinic,
    luminix.closure_permission(v_previous));
  UPDATE luminix.schedule_closures SET professional_id = p_professional, starts_on = p_starts,
      ends_on = p_ends, kind = p_kind, note = nullif(trim(p_note), ''), updated_at = now()
    WHERE clinic_id = p_clinic AND id = p_id
    RETURNING * INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION luminix.delete_schedule_closure(p_clinic uuid, p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_kind text;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid closure' USING ERRCODE = '22023';
  END IF;
  SELECT kind INTO v_kind FROM luminix.schedule_closures
    WHERE clinic_id = p_clinic AND id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic,
    luminix.closure_permission(v_kind));
  DELETE FROM luminix.schedule_closures WHERE clinic_id = p_clinic AND id = p_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION luminix.save_marketing_post(p_clinic uuid, p_post uuid, p_data jsonb, p_delete boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_id uuid; v_media uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_post IS NULL THEN
    RAISE EXCEPTION 'Invalid post' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'marketing:manage') a;
  IF p_delete THEN
    DELETE FROM luminix.marketing_posts WHERE clinic_id = p_clinic AND id = p_post;
    RETURN p_post;
  END IF;
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object'
    OR jsonb_typeof(coalesce(p_data->'channels', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Invalid post' USING ERRCODE = '22023';
  END IF;
  v_media := nullif(p_data->>'mediaItemId', '')::uuid;
  IF v_media IS NOT NULL THEN
    PERFORM 1 FROM luminix.media_items WHERE clinic_id = p_clinic AND id = v_media AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid media' USING ERRCODE = '22023'; END IF;
  END IF;
  INSERT INTO luminix.marketing_posts (id, clinic_id, title, caption, scheduled_on, scheduled_time,
      channels, format, status, media_item_id, created_by_membership_id)
    VALUES (p_post, p_clinic, btrim(p_data->>'title'), coalesce(p_data->>'caption', ''),
      nullif(p_data->>'scheduledOn', '')::date, nullif(p_data->>'scheduledTime', ''),
      ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'channels', '[]'::jsonb))),
      coalesce(p_data->>'format', 'post'), coalesce(p_data->>'status', 'planned'), v_media, v_member)
  ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, caption = EXCLUDED.caption,
      scheduled_on = EXCLUDED.scheduled_on, scheduled_time = EXCLUDED.scheduled_time,
      channels = EXCLUDED.channels, format = EXCLUDED.format, status = EXCLUDED.status,
      media_item_id = EXCLUDED.media_item_id, updated_at = now()
    WHERE luminix.marketing_posts.clinic_id = p_clinic
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid post' USING ERRCODE = '22023'; END IF;
  RETURN v_id;
END $$;

-- 4. Align every existing clinic (same pattern as 0025) ------------------------------------

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
