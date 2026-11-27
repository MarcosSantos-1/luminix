CREATE TABLE luminix.finance_team_payments (
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  finance_entry_id uuid NOT NULL,
  professional_id uuid,
  membership_id uuid,
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  salary_cents integer NOT NULL CHECK (salary_cents BETWEEN 0 AND 100000000),
  commission_bps integer NOT NULL CHECK (commission_bps BETWEEN 0 AND 10000),
  commission_base_cents bigint NOT NULL CHECK (commission_base_cents >= 0),
  commission_cents integer NOT NULL CHECK (commission_cents >= 0),
  CHECK (num_nonnulls(professional_id, membership_id) = 1),
  PRIMARY KEY (clinic_id, id),
  UNIQUE (clinic_id, finance_entry_id),
  FOREIGN KEY (clinic_id, finance_entry_id) REFERENCES luminix.finance_entries(clinic_id, id),
  FOREIGN KEY (clinic_id, professional_id) REFERENCES luminix.professionals(clinic_id, id),
  FOREIGN KEY (clinic_id, membership_id) REFERENCES luminix.clinic_memberships(clinic_id, id)
);

ALTER TABLE luminix.finance_team_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.finance_team_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.finance_team_payments
  USING (clinic_id = luminix.current_clinic_id())
  WITH CHECK (clinic_id = luminix.current_clinic_id());
CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.finance_team_payments
  FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.finance_team_payments
  FOR EACH ROW EXECUTE FUNCTION luminix.audit_change();
REVOKE ALL ON luminix.finance_team_payments FROM PUBLIC;
GRANT SELECT ON luminix.finance_team_payments TO luminix_api;

CREATE FUNCTION luminix.finance_team_receipts(p_clinic uuid, p_month date)
RETURNS TABLE (professional_id uuid, cents bigint)
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT a.professional_id, sum(e.amount_cents)
    FROM luminix.finance_entries e
    LEFT JOIN luminix.client_package_payments pp
      ON pp.clinic_id = e.clinic_id AND pp.finance_entry_id = e.id
    JOIN luminix.appointments a
      ON a.clinic_id = e.clinic_id AND a.id = coalesce(e.appointment_id, pp.appointment_id)
   WHERE e.clinic_id = p_clinic AND a.professional_id IS NOT NULL AND a.status = 'completed'
     AND e.kind = 'income' AND e.status = 'active'
     AND e.occurred_on >= p_month AND e.occurred_on < p_month + interval '1 month'
   GROUP BY a.professional_id
$$;

CREATE FUNCTION luminix.record_team_payment(
  p_clinic uuid, p_recipient uuid, p_professional boolean, p_month date,
  p_salary integer, p_rate integer, p_expected integer, p_paid_on date, p_method text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_name text; v_base bigint := 0; v_commission bigint; v_amount bigint; v_entry uuid;
BEGIN
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'finance:manage');
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR p_recipient IS NULL OR p_professional IS NULL OR p_paid_on IS NULL OR p_month IS NULL
    OR extract(day FROM p_month) <> 1 OR p_salary IS NULL OR p_salary NOT BETWEEN 0 AND 100000000
    OR p_rate IS NULL OR p_rate NOT BETWEEN 0 AND 10000 OR (NOT p_professional AND p_rate <> 0) THEN
    RAISE EXCEPTION 'Invalid payroll' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_clinic::text || ':' || p_recipient::text || ':' || p_professional::text || ':' || p_month::text, 0));
  IF EXISTS (
    SELECT FROM luminix.finance_team_payments t JOIN luminix.finance_entries e
      ON e.clinic_id = t.clinic_id AND e.id = t.finance_entry_id
    WHERE t.clinic_id = p_clinic AND t.month = p_month AND e.status = 'active'
      AND ((p_professional AND t.professional_id = p_recipient)
        OR (NOT p_professional AND t.membership_id = p_recipient))
  ) THEN
    RAISE EXCEPTION 'O pagamento deste mês já foi lançado.' USING ERRCODE = '55000';
  END IF;

  IF p_professional THEN
    SELECT display_name INTO v_name FROM luminix.professionals
     WHERE clinic_id = p_clinic AND id = p_recipient AND status = 'active';
    SELECT cents INTO v_base FROM luminix.finance_team_receipts(p_clinic, p_month)
     WHERE professional_id = p_recipient;
  ELSE
    SELECT coalesce(nullif(btrim(m.display_name), ''), 'Pessoa da equipe') INTO v_name
      FROM luminix.clinic_memberships m
     WHERE m.clinic_id = p_clinic AND m.id = p_recipient AND m.status = 'active'
       AND NOT EXISTS (SELECT FROM luminix.professionals p
         WHERE p.clinic_id = m.clinic_id AND p.membership_id = m.id AND p.status = 'active');
  END IF;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Pessoa indisponível para lançamento.' USING ERRCODE = '55000';
  END IF;

  v_base := coalesce(v_base, 0);
  v_commission := round(v_base::numeric * p_rate / 10000);
  v_amount := p_salary + v_commission;
  IF v_amount IS DISTINCT FROM p_expected OR v_amount NOT BETWEEN 1 AND 100000000 THEN
    RAISE EXCEPTION 'O total mudou ou é inválido. Confira os valores novamente.' USING ERRCODE = '55000';
  END IF;
  v_entry := luminix.save_finance_entry(p_clinic, jsonb_build_object(
    'kind', 'expense', 'amountCents', v_amount, 'occurredOn', to_char(p_paid_on, 'YYYY-MM-DD'),
    'description', left('Remuneração ' || to_char(p_month, 'MM/YYYY') || ' · ' || v_name, 160),
    'category', 'Equipe', 'method', p_method));
  INSERT INTO luminix.finance_team_payments
    (clinic_id, finance_entry_id, professional_id, membership_id, month, salary_cents,
     commission_bps, commission_base_cents, commission_cents)
  VALUES (p_clinic, v_entry, CASE WHEN p_professional THEN p_recipient END,
    CASE WHEN NOT p_professional THEN p_recipient END, p_month, p_salary, p_rate, v_base, v_commission);
  RETURN v_entry;
END $$;

REVOKE ALL ON FUNCTION luminix.finance_team_receipts(uuid, date),
  luminix.record_team_payment(uuid, uuid, boolean, date, integer, integer, integer, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.finance_team_receipts(uuid, date),
  luminix.record_team_payment(uuid, uuid, boolean, date, integer, integer, integer, date, text) TO luminix_api;

CREATE FUNCTION luminix.finance_team_month(p_clinic uuid, p_month date)
RETURNS TABLE (recipient_id uuid, name text, professional boolean, base_cents bigint,
  entry_id uuid, salary_cents integer, commission_cents integer, commission_bps integer, paid_on date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'finance:manage');
  RETURN QUERY
  WITH paid AS (
    SELECT t.*, e.occurred_on
      FROM luminix.finance_team_payments t
      JOIN luminix.finance_entries e ON e.clinic_id = t.clinic_id AND e.id = t.finance_entry_id
     WHERE t.clinic_id = p_clinic AND t.month = p_month AND e.status = 'active'
  ), recipients AS (
    SELECT p.id, p.display_name, true AS is_professional
      FROM luminix.professionals p WHERE p.clinic_id = p_clinic
        AND (p.status = 'active' OR EXISTS (SELECT FROM paid WHERE paid.professional_id = p.id))
    UNION ALL
    SELECT m.id, coalesce(nullif(btrim(m.display_name), ''), 'Pessoa da equipe'), false
      FROM luminix.clinic_memberships m WHERE m.clinic_id = p_clinic
        AND (EXISTS (SELECT FROM paid WHERE membership_id = m.id) OR (
          m.status = 'active' AND NOT EXISTS (SELECT FROM luminix.professionals p
           WHERE p.clinic_id = m.clinic_id AND p.membership_id = m.id AND p.status = 'active')))
  )
  SELECT r.id, r.display_name, r.is_professional, coalesce(t.commission_base_cents, f.cents, 0),
    t.finance_entry_id, t.salary_cents, t.commission_cents, t.commission_bps, t.occurred_on
    FROM recipients r
    LEFT JOIN luminix.finance_team_receipts(p_clinic, p_month) f ON r.is_professional AND f.professional_id = r.id
    LEFT JOIN paid t ON (r.is_professional AND t.professional_id = r.id)
                    OR (NOT r.is_professional AND t.membership_id = r.id)
   ORDER BY lower(r.display_name), r.id;
END $$;
REVOKE ALL ON FUNCTION luminix.finance_team_month(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.finance_team_month(uuid, date) TO luminix_api;
