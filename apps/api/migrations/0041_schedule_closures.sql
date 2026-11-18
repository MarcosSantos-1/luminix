-- Periods without attendance: the whole space (professional_id NULL: férias coletivas, luto,
-- manutenção…) or one professional (férias, licença). Unlike schedule_overrides (one date, one
-- set of hours), a closure keeps the period and its reason together so it can be edited or
-- removed as one thing. Existing appointments are never canceled automatically; the agenda
-- shows which ones fall inside the period.
CREATE TABLE luminix.schedule_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  professional_id uuid,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('vacation', 'collective_vacation', 'bereavement',
    'maintenance', 'renovation', 'sick_leave', 'training', 'event', 'other')),
  note text CHECK (note IS NULL OR length(trim(note)) BETWEEN 1 AND 240),
  created_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on AND ends_on - starts_on <= 366),
  UNIQUE (clinic_id, id),
  FOREIGN KEY (clinic_id, professional_id) REFERENCES luminix.professionals(clinic_id, id),
  FOREIGN KEY (clinic_id, created_by_membership_id)
    REFERENCES luminix.clinic_memberships(clinic_id, id)
);

CREATE INDEX schedule_closures_period ON luminix.schedule_closures (clinic_id, starts_on, ends_on);

ALTER TABLE luminix.schedule_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.schedule_closures FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.schedule_closures
  USING (clinic_id = luminix.current_clinic_id())
  WITH CHECK (clinic_id = luminix.current_clinic_id());
CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.schedule_closures
  FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.schedule_closures
  FOR EACH ROW EXECUTE FUNCTION luminix.audit_change();

-- A manager booking inside a closure confirms it like the other warnings (chave mestra).
ALTER TABLE luminix.appointments DROP CONSTRAINT appointments_override_reasons_check;
ALTER TABLE luminix.appointments ADD CONSTRAINT appointments_override_reasons_check
  CHECK (override_reasons <@ ARRAY['past', 'outside_availability', 'overlap', 'closure']::text[]);

-- Space closures need clinic:manage (same as the hours); a professional's leave needs
-- professional:manage (same as the team's hours). An edit is authorized for both scopes.
CREATE FUNCTION luminix.save_schedule_closure(
  p_clinic uuid, p_id uuid, p_professional uuid, p_starts date, p_ends date, p_kind text,
  p_note text
) RETURNS luminix.schedule_closures
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE result luminix.schedule_closures%ROWTYPE; v_member uuid; v_previous uuid;
  v_identity uuid := nullif(current_setting('luminix.identity_id', true), '')::uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid closure' USING ERRCODE = '22023';
  END IF;
  SELECT membership_id INTO v_member FROM luminix.authorize_staff_clinic(v_identity, p_clinic,
    CASE WHEN p_professional IS NULL THEN 'clinic:manage' ELSE 'professional:manage' END);
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
  SELECT professional_id INTO v_previous FROM luminix.schedule_closures
    WHERE clinic_id = p_clinic AND id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Closure not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(v_identity, p_clinic,
    CASE WHEN v_previous IS NULL THEN 'clinic:manage' ELSE 'professional:manage' END);
  UPDATE luminix.schedule_closures SET professional_id = p_professional, starts_on = p_starts,
      ends_on = p_ends, kind = p_kind, note = nullif(trim(p_note), ''), updated_at = now()
    WHERE clinic_id = p_clinic AND id = p_id
    RETURNING * INTO result;
  RETURN result;
END $$;

CREATE FUNCTION luminix.delete_schedule_closure(p_clinic uuid, p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_professional uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid closure' USING ERRCODE = '22023';
  END IF;
  SELECT professional_id INTO v_professional FROM luminix.schedule_closures
    WHERE clinic_id = p_clinic AND id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic,
    CASE WHEN v_professional IS NULL THEN 'clinic:manage' ELSE 'professional:manage' END);
  DELETE FROM luminix.schedule_closures WHERE clinic_id = p_clinic AND id = p_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION
  luminix.save_schedule_closure(uuid, uuid, uuid, date, date, text, text),
  luminix.delete_schedule_closure(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  luminix.save_schedule_closure(uuid, uuid, uuid, date, date, text, text),
  luminix.delete_schedule_closure(uuid, uuid) TO luminix_api;
GRANT SELECT ON luminix.schedule_closures TO luminix_api;
