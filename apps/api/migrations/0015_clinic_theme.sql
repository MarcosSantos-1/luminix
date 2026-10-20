-- Additive: existing spaces retain the current pink appearance.
ALTER TABLE luminix.clinic_settings ADD COLUMN theme text NOT NULL DEFAULT 'rosa'
  CHECK (theme IN ('rosa', 'grafite', 'violeta', 'dourado', 'esmeralda', 'azul'));

CREATE FUNCTION luminix.set_clinic_theme(p_clinic uuid, p_theme text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_theme IS NULL
    OR p_theme NOT IN ('rosa', 'grafite', 'violeta', 'dourado', 'esmeralda', 'azul') THEN
    RAISE EXCEPTION 'Invalid clinic theme' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  -- Invalidate open draft versions so another tab cannot silently restore an old theme.
  UPDATE luminix.onboarding_drafts
    SET payload = jsonb_set(payload, '{clinic}', coalesce(payload->'clinic', '{}'::jsonb) || jsonb_build_object('theme', p_theme)),
        version = version + 1
    WHERE clinic_id = p_clinic AND status = 'draft';
  UPDATE luminix.clinic_settings SET theme = p_theme WHERE clinic_id = p_clinic;
END $$;
REVOKE ALL ON FUNCTION luminix.set_clinic_theme(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_clinic_theme(uuid, text) TO luminix_api;

-- Saving a draft already checks onboarding authorization and optimistic versioning.
-- Old clients that omit the theme must not reset an existing selection.
CREATE FUNCTION luminix.persist_onboarding_theme()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.payload->'clinic'->>'theme' IS NOT NULL THEN
    UPDATE luminix.clinic_settings SET theme = NEW.payload->'clinic'->>'theme'
      WHERE clinic_id = NEW.clinic_id
        AND theme IS DISTINCT FROM NEW.payload->'clinic'->>'theme';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION luminix.persist_onboarding_theme() FROM PUBLIC;
CREATE TRIGGER persist_onboarding_theme AFTER INSERT OR UPDATE ON luminix.onboarding_drafts
  FOR EACH ROW EXECUTE FUNCTION luminix.persist_onboarding_theme();
