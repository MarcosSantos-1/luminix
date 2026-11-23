-- Tipo do espaço (Studio, Clínica, Salão, SPA, Espaço) e serviços de avaliação/consulta.
--
-- space_kind define como o painel se refere ao negócio ("seu Studio", "sua clínica") e entra
-- no nome exibido: escolhido "Studio" com o nome "Luniere", o espaço fica "Studio Luniere".
-- is_evaluation marca a avaliação ou consulta de primeira visita (avaliação facial, consulta
-- para tatuagem...): continua agendável, mas sai da listagem de serviços do painel e, no site,
-- será a porta de entrada para quem ainda não conhece o espaço.

ALTER TABLE luminix.clinics ADD COLUMN space_kind text
  CHECK (space_kind IN ('studio', 'clinica', 'salao', 'spa', 'espaco'));

ALTER TABLE luminix.services ADD COLUMN is_evaluation boolean NOT NULL DEFAULT false;

CREATE FUNCTION luminix.space_kind_label(p_kind text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE p_kind
    WHEN 'studio' THEN 'Studio' WHEN 'clinica' THEN 'Clínica' WHEN 'salao' THEN 'Salão'
    WHEN 'spa' THEN 'SPA' WHEN 'espaco' THEN 'Espaço' END
$$;

-- "Luniere" + studio -> "Studio Luniere"; a name that already starts with the label is kept.
CREATE FUNCTION luminix.space_display_name(p_kind text, p_name text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE v_label text := luminix.space_kind_label(p_kind); v_name text := btrim(p_name);
BEGIN
  IF v_label IS NULL OR v_name IS NULL OR v_name = '' THEN RETURN v_name; END IF;
  IF lower(v_name) = lower(v_label) OR lower(v_name) LIKE lower(v_label) || ' %' THEN
    RETURN v_name;
  END IF;
  RETURN left(v_label || ' ' || v_name, 160);
END $$;

-- The draft carries the choice while onboarding; the clinic row follows it (like the theme).
CREATE FUNCTION luminix.persist_onboarding_space_kind()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_kind text := NEW.payload->'clinic'->>'spaceKind';
BEGIN
  IF v_kind IN ('studio', 'clinica', 'salao', 'spa', 'espaco') THEN
    UPDATE luminix.clinics SET space_kind = v_kind
      WHERE id = NEW.clinic_id AND status = 'draft' AND space_kind IS DISTINCT FROM v_kind;
  END IF;
  -- Completion: the services created from the draft keep the evaluation mark.
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    UPDATE luminix.services s SET is_evaluation = true
      WHERE s.clinic_id = NEW.clinic_id AND NOT s.is_evaluation
        AND s.name IN (
          SELECT btrim(item->>'name') FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(NEW.payload->'services') = 'array'
              THEN NEW.payload->'services' ELSE '[]'::jsonb END) item
           WHERE item->>'evaluation' = 'true');
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION luminix.persist_onboarding_space_kind() FROM PUBLIC;
CREATE TRIGGER persist_onboarding_space_kind AFTER INSERT OR UPDATE ON luminix.onboarding_drafts
  FOR EACH ROW EXECUTE FUNCTION luminix.persist_onboarding_space_kind();

-- Activation writes the plain name typed in the onboarding; the kind goes in front of it.
CREATE FUNCTION luminix.compose_active_clinic_name()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status = 'draft' AND NEW.space_kind IS NOT NULL THEN
    NEW.name := luminix.space_display_name(NEW.space_kind, NEW.name);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compose_active_clinic_name BEFORE UPDATE OF status ON luminix.clinics
  FOR EACH ROW EXECUTE FUNCTION luminix.compose_active_clinic_name();

-- Settings: change the kind of an active space. The old label in front of the name is swapped
-- for the new one ("Studio Luniere" -> "Clínica Luniere"); without one, the new label is added.
CREATE FUNCTION luminix.set_clinic_space_kind(p_clinic uuid, p_kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_old text; v_name text; v_old_label text;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR p_kind IS NULL OR p_kind NOT IN ('studio', 'clinica', 'salao', 'spa', 'espaco') THEN
    RAISE EXCEPTION 'Invalid space kind' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  SELECT space_kind, name INTO v_old, v_name FROM luminix.clinics WHERE id = p_clinic FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clinic unavailable' USING ERRCODE = '22023'; END IF;
  v_old_label := luminix.space_kind_label(v_old);
  IF v_old_label IS NOT NULL AND lower(v_name) LIKE lower(v_old_label) || ' %' THEN
    v_name := btrim(substr(v_name, length(v_old_label) + 2));
  END IF;
  v_name := luminix.space_display_name(p_kind, v_name);
  UPDATE luminix.clinics SET space_kind = p_kind,
      name = CASE WHEN status = 'active' THEN v_name ELSE name END
    WHERE id = p_clinic;
  UPDATE luminix.onboarding_drafts
    SET payload = jsonb_set(payload, '{clinic}',
          coalesce(payload->'clinic', '{}'::jsonb) || jsonb_build_object('spaceKind', p_kind)),
        version = version + 1
    WHERE clinic_id = p_clinic AND status = 'draft';
  RETURN (SELECT name FROM luminix.clinics WHERE id = p_clinic);
END $$;
REVOKE ALL ON FUNCTION luminix.set_clinic_space_kind(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_clinic_space_kind(uuid, text) TO luminix_api;
