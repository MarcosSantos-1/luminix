-- Quem faz um serviço, escolhido no próprio cadastro do serviço (antes só pela Equipe). Troca a
-- lista de profissionais ativas ligadas ao serviço; quem continua mantém o público já escolhido
-- (serviços sensíveis), quem entra recebe o público do serviço.
CREATE FUNCTION luminix.set_service_professionals(p_clinic uuid, p_service uuid, p_professionals uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_sensitive boolean; v_audience text; v_count integer;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_service IS NULL
    OR p_professionals IS NULL OR cardinality(p_professionals) > 100 THEN
    RAISE EXCEPTION 'Invalid service team' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  SELECT is_sensitive, audience INTO v_sensitive, v_audience FROM luminix.services
    WHERE clinic_id = p_clinic AND id = p_service AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid service' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_professionals) wanted(id)
      WHERE NOT EXISTS (SELECT 1 FROM luminix.professionals p
        WHERE p.clinic_id = p_clinic AND p.id = wanted.id AND p.status = 'active')) THEN
    RAISE EXCEPTION 'Invalid professional' USING ERRCODE = '22023';
  END IF;
  DELETE FROM luminix.professional_services ps
    USING luminix.professionals p
    WHERE ps.clinic_id = p_clinic AND ps.service_id = p_service
      AND p.clinic_id = ps.clinic_id AND p.id = ps.professional_id AND p.status = 'active'
      AND NOT (ps.professional_id = ANY (p_professionals));
  INSERT INTO luminix.professional_services (clinic_id, professional_id, service_id, audience)
    SELECT DISTINCT p_clinic, wanted.id, p_service, CASE WHEN v_sensitive THEN coalesce(v_audience, 'all') END
      FROM unnest(p_professionals) wanted(id)
    ON CONFLICT DO NOTHING;
  SELECT count(*) INTO v_count FROM luminix.professional_services
    WHERE clinic_id = p_clinic AND service_id = p_service;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION luminix.set_service_professionals(uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_service_professionals(uuid, uuid, uuid[]) TO luminix_api;
