-- Baixa do estoque em visita de combo: a receita de todos os tratamentos do combo, somada. Os
-- descartáveis de uso único da visita (luva, máscara, touca, avental, lençol…) entram uma vez só,
-- pela receita do serviço do agendamento, e não se repetem por tratamento.

CREATE FUNCTION luminix.inventory_item_per_visit(p_category text, p_catalog text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(p_category, '') ILIKE 'descart%'
    OR coalesce(p_catalog, '') IN ('luvas-descartaveis', 'mascara-descartavel', 'touca-descartavel',
      'avental-descartavel', 'lencol-descartavel', 'sapatilha-descartavel', 'protetor-bancada',
      'campo-esteril', 'papel-toalha', 'saco-descarte', 'papel-maca', 'manta-descartavel')
$$;

CREATE OR REPLACE FUNCTION luminix.appointment_supplies(p_clinic uuid, p_appointment uuid)
RETURNS TABLE (item_id uuid, name text, unit text, package_size numeric, package_label text,
  quantity numeric, stock numeric, consumed numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid appointment' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'agenda:manage');
  RETURN QUERY
    WITH visit AS (
      SELECT a.clinic_id, a.service_id, cp.id AS combo
        FROM luminix.appointments a
        LEFT JOIN luminix.client_packages cp ON cp.clinic_id = a.clinic_id
          AND cp.id = a.client_package_id AND cp.kind = 'combo'
       WHERE a.clinic_id = p_clinic AND a.id = p_appointment
    ), services AS (
      -- The appointment's own service, plus (combo) every other service of the combo.
      SELECT v.service_id, true AS own FROM visit v
      UNION
      SELECT i.service_id, false FROM visit v
        JOIN luminix.client_package_items i ON i.clinic_id = v.clinic_id
          AND i.client_package_id = v.combo
       WHERE v.combo IS NOT NULL AND i.service_id <> v.service_id
    ), lines AS (
      SELECT ss.item_id, ss.quantity
        FROM services s
        JOIN luminix.service_supplies ss ON ss.clinic_id = p_clinic AND ss.service_id = s.service_id
        JOIN luminix.inventory_items it ON it.clinic_id = ss.clinic_id AND it.id = ss.item_id
       WHERE s.own OR NOT luminix.inventory_item_per_visit(it.category, it.catalog_id)
    )
    SELECT i.id, i.name, i.unit, i.package_size, i.package_label, sum(l.quantity), i.quantity,
           (SELECT m.quantity FROM luminix.inventory_movements m WHERE m.clinic_id = p_clinic
              AND m.appointment_id = p_appointment AND m.item_id = i.id)
      FROM lines l
      JOIN luminix.inventory_items i ON i.clinic_id = p_clinic AND i.id = l.item_id AND i.status = 'active'
     GROUP BY i.id, i.name, i.unit, i.package_size, i.package_label, i.quantity
     ORDER BY lower(i.name);
END $$;
