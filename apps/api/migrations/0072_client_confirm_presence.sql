-- Confirmar presença pela área da cliente (ADR-043): um horário que a equipe marcou fica "a
-- confirmar" até a cliente dizer que vai. Antes, só o link de confirmação (ADR-038) fazia isso;
-- agora a própria área logada também. A agenda do painel lê a resposta mais recente.

ALTER TABLE luminix.appointments
  ADD COLUMN client_confirmed_at timestamptz;

-- The client says she is coming. A visit "a confirmar" becomes confirmed, except while a deposit
-- or a payment in the app is still pending (that one confirms itself when paid).
CREATE FUNCTION luminix.client_confirm_presence(p_clinic uuid, p_client uuid, p_appointment uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_row luminix.appointments%ROWTYPE;
BEGIN
  IF NOT luminix.client_owns_record(p_clinic, p_client) THEN
    RAISE EXCEPTION 'Client access denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM luminix.appointments
   WHERE clinic_id = p_clinic AND id = p_appointment AND clinic_client_id = p_client FOR UPDATE;
  IF NOT FOUND OR v_row.status NOT IN ('scheduled', 'confirmed') OR v_row.starts_at <= now() THEN
    RAISE EXCEPTION 'Appointment closed' USING ERRCODE = '55000';
  END IF;
  UPDATE luminix.appointments
     SET client_confirmed_at = now(),
         status = CASE
           WHEN status = 'scheduled'
            AND deposit_status IS DISTINCT FROM 'awaiting' AND deposit_status IS DISTINCT FROM 'reported'
            AND online_payment_status IS DISTINCT FROM 'awaiting'
           THEN 'confirmed' ELSE status END,
         updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment;
END $$;
REVOKE ALL ON FUNCTION luminix.client_confirm_presence(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.client_confirm_presence(uuid, uuid, uuid) TO luminix_api;
