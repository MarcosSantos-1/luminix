-- Rescheduling keeps the appointment (price snapshot, history, payments) and only moves it.
-- `previous_starts_at` remembers where it was, so the agenda can show "remarcado" on both days.
-- Additive: two nullable columns and one function.

ALTER TABLE luminix.appointments
  ADD COLUMN previous_starts_at timestamptz,
  ADD COLUMN rescheduled_at timestamptz;

CREATE INDEX appointments_previous_timeline
  ON luminix.appointments (clinic_id, previous_starts_at)
  WHERE previous_starts_at IS NOT NULL;

CREATE FUNCTION luminix.reschedule_appointment(
  p_clinic uuid, p_appointment uuid, p_starts_at timestamptz, p_ends_at timestamptz,
  p_override_reasons text[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'Invalid appointment time' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'agenda:manage');
  -- Only appointments still to happen can move; finished or canceled ones are history.
  UPDATE luminix.appointments
     SET previous_starts_at = starts_at, starts_at = p_starts_at, ends_at = p_ends_at,
         override_reasons = coalesce(p_override_reasons, '{}'), rescheduled_at = now(),
         updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment AND status IN ('scheduled', 'confirmed');
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found' USING ERRCODE = '22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.reschedule_appointment(uuid, uuid, timestamptz, timestamptz, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.reschedule_appointment(uuid, uuid, timestamptz, timestamptz, text[]) TO luminix_api;
