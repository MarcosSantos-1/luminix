-- Excluir aparelho alugado (substitui "Arquivar" no painel).
-- Remove o aparelho, a ligação com os serviços e os dias de aluguel. As despesas já lançadas no
-- Financeiro continuam lá (dinheiro gasto é histórico); a API anula só as de aluguéis que ainda
-- não começaram, como faz ao remover um aluguel, e só para quem pode mexer no Financeiro.
-- Retorna os lançamentos desses aluguéis futuros.

CREATE FUNCTION luminix.delete_rented_equipment(p_clinic uuid, p_equipment uuid)
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_entries uuid[];
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid equipment' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  PERFORM 1 FROM luminix.resources
   WHERE clinic_id = p_clinic AND id = p_equipment AND type = 'equipment'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Equipment not found' USING ERRCODE = 'P0002'; END IF;

  SELECT coalesce(array_agg(finance_entry_id), '{}') INTO v_entries
    FROM luminix.resource_rentals
   WHERE clinic_id = p_clinic AND resource_id = p_equipment
     AND finance_entry_id IS NOT NULL AND starts_on > luminix.clinic_today();

  DELETE FROM luminix.resource_rentals WHERE clinic_id = p_clinic AND resource_id = p_equipment;
  DELETE FROM luminix.service_resources WHERE clinic_id = p_clinic AND resource_id = p_equipment;
  DELETE FROM luminix.resources
   WHERE clinic_id = p_clinic AND id = p_equipment AND type = 'equipment';
  RETURN v_entries;
END $$;
REVOKE ALL ON FUNCTION luminix.delete_rented_equipment(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.delete_rented_equipment(uuid, uuid) TO luminix_api;
