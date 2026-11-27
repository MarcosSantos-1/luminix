ALTER TABLE luminix.client_packages DROP CONSTRAINT client_packages_payment_plan_check;
ALTER TABLE luminix.client_packages ADD CHECK (payment_plan IN ('paid', 'per_visit', 'later', 'installments'));

CREATE FUNCTION luminix.set_first_visit_package_plan(p_clinic uuid, p_appointment uuid, p_plan text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_package uuid; v_price integer;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR p_plan IS NULL OR p_plan NOT IN ('paid', 'installments', 'per_visit') THEN
    RAISE EXCEPTION 'Invalid plan' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'finance:manage');
  SELECT cp.id, cp.price_cents INTO v_package, v_price
    FROM luminix.appointments a JOIN luminix.client_packages cp
      ON cp.clinic_id = a.clinic_id AND cp.id = a.client_package_id
   WHERE a.clinic_id = p_clinic AND a.id = p_appointment
     AND a.status IN ('scheduled', 'confirmed') AND cp.status = 'active'
   FOR UPDATE OF cp;
  IF NOT FOUND OR luminix.client_package_paid(p_clinic, v_package) >= v_price OR EXISTS (
    SELECT FROM luminix.appointments WHERE clinic_id = p_clinic
      AND client_package_id = v_package AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'O pacote já foi quitado ou teve a primeira sessão concluída. Atualize o atendimento.'
      USING ERRCODE = '55000';
  END IF;
  UPDATE luminix.client_packages SET payment_plan = p_plan WHERE clinic_id = p_clinic AND id = v_package;
END $$;
REVOKE ALL ON FUNCTION luminix.set_first_visit_package_plan(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_first_visit_package_plan(uuid, uuid, text) TO luminix_api;
