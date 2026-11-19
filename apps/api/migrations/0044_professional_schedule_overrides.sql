-- Horário de uma profissional numa data específica ("na quinta 27 a Ana entra às 13h"). Igual a
-- schedule_overrides, mas por profissional: substitui a semana dela naquele dia. A clínica
-- continua limitando (o dia da profissional nunca abre fora do horário do espaço).

CREATE TABLE luminix.professional_schedule_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  professional_id uuid NOT NULL,
  local_date date NOT NULL,
  is_available boolean NOT NULL DEFAULT false,
  periods jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    luminix.valid_schedule_periods(periods)
    AND (is_available OR periods = '[]'::jsonb)
  ),
  reason text CHECK (reason IS NULL OR length(trim(reason)) BETWEEN 1 AND 240),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  UNIQUE (clinic_id, professional_id, local_date),
  FOREIGN KEY (clinic_id, professional_id) REFERENCES luminix.professionals(clinic_id, id)
);

ALTER TABLE luminix.professional_schedule_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.professional_schedule_overrides FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.professional_schedule_overrides
  USING (clinic_id = luminix.current_clinic_id())
  WITH CHECK (clinic_id = luminix.current_clinic_id());
CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.professional_schedule_overrides
  FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.professional_schedule_overrides
  FOR EACH ROW EXECUTE FUNCTION luminix.audit_change();

-- Same permission as the team's weekly hours (professional:manage). p_use_default removes it.
CREATE FUNCTION luminix.save_professional_override(
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
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'professional:manage');
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

REVOKE ALL ON FUNCTION luminix.save_professional_override(uuid, uuid, date, boolean, boolean, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.save_professional_override(uuid, uuid, date, boolean, boolean, jsonb, text) TO luminix_api;
GRANT SELECT ON luminix.professional_schedule_overrides TO luminix_api;
