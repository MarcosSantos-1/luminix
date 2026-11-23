-- "A combinar" e "a partir de": o valor final é definido pelo espaço na hora do atendimento
-- (no check-in ou ao concluir). price_agreed_at marca que o valor já foi acertado; o pagamento
-- desses serviços é sempre no espaço (sem cobrança no app de um valor ainda desconhecido).

ALTER TABLE luminix.appointments ADD COLUMN price_agreed_at timestamptz;

CREATE FUNCTION luminix.set_appointment_agreed_price(p_clinic uuid, p_appointment uuid, p_price integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR p_price IS NULL OR p_price NOT BETWEEN 0 AND 100000000 THEN
    RAISE EXCEPTION 'Invalid price' USING ERRCODE = '22023';
  END IF;
  -- Setting a price is a money decision: finance:manage.
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'finance:manage');
  UPDATE luminix.appointments a SET price_cents = p_price, price_agreed_at = now(),
      updated_at = now()
    FROM luminix.services s
   WHERE a.clinic_id = p_clinic AND a.id = p_appointment
     AND s.clinic_id = a.clinic_id AND s.id = a.service_id
     AND s.price_type IN ('quote', 'from')
     AND a.client_package_id IS NULL
     AND a.status IN ('scheduled', 'confirmed', 'completed')
     -- Never below what was already received for this visit.
     AND p_price >= luminix.appointment_paid_cents(p_clinic, p_appointment);
  IF NOT FOUND THEN RAISE EXCEPTION 'Price unavailable' USING ERRCODE = '55000'; END IF;
END $$;

REVOKE ALL ON FUNCTION luminix.set_appointment_agreed_price(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_appointment_agreed_price(uuid, uuid, integer) TO luminix_api;
