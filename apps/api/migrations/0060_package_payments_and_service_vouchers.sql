-- 1. Pagamento de pacotes: pago na venda, a cada sessão ("pedalada") ou depois. Cada parcela é
--    uma receita no Financeiro ligada ao pacote; o saldo devedor = preço − parcelas ativas.
-- 2. Voucher "Serviço grátis": vale um serviço específico; ao usar, o atendimento fica sem custo.

ALTER TABLE luminix.client_packages
  ADD COLUMN payment_plan text NOT NULL DEFAULT 'paid'
    CHECK (payment_plan IN ('paid', 'per_visit', 'later'));
UPDATE luminix.client_packages SET payment_plan = 'later' WHERE finance_entry_id IS NULL;

CREATE TABLE luminix.client_package_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  client_package_id uuid NOT NULL,
  finance_entry_id uuid NOT NULL,
  appointment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  UNIQUE (clinic_id, finance_entry_id),
  FOREIGN KEY (clinic_id, client_package_id) REFERENCES luminix.client_packages(clinic_id, id),
  FOREIGN KEY (clinic_id, finance_entry_id) REFERENCES luminix.finance_entries(clinic_id, id),
  FOREIGN KEY (clinic_id, appointment_id) REFERENCES luminix.appointments(clinic_id, id)
);
CREATE INDEX client_package_payments_package
  ON luminix.client_package_payments (clinic_id, client_package_id);
ALTER TABLE luminix.client_package_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.client_package_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.client_package_payments
  USING (clinic_id = luminix.current_clinic_id())
  WITH CHECK (clinic_id = luminix.current_clinic_id());
CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.client_package_payments
  FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.client_package_payments
  FOR EACH ROW EXECUTE FUNCTION luminix.audit_change();
REVOKE ALL ON luminix.client_package_payments FROM PUBLIC;
GRANT SELECT ON luminix.client_package_payments TO luminix_api;

-- Sales already registered in the Financeiro become the package's first payment.
INSERT INTO luminix.client_package_payments (clinic_id, client_package_id, finance_entry_id)
  SELECT clinic_id, id, finance_entry_id FROM luminix.client_packages
   WHERE finance_entry_id IS NOT NULL
  ON CONFLICT DO NOTHING;

CREATE FUNCTION luminix.client_package_paid(p_clinic uuid, p_package uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(sum(f.amount_cents), 0)::integer
    FROM luminix.client_package_payments pp
    JOIN luminix.finance_entries f ON f.clinic_id = pp.clinic_id AND f.id = pp.finance_entry_id
   WHERE pp.clinic_id = p_clinic AND pp.client_package_id = p_package AND f.status = 'active'
$$;

-- Links an income already created (same transaction) to the package. finance:manage.
CREATE FUNCTION luminix.add_client_package_payment(
  p_clinic uuid, p_package uuid, p_finance_entry uuid, p_appointment uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_id uuid; v_price integer; v_amount integer;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid payment' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'finance:manage');
  SELECT price_cents INTO v_price FROM luminix.client_packages
   WHERE clinic_id = p_clinic AND id = p_package AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid package' USING ERRCODE = '22023'; END IF;
  SELECT amount_cents INTO v_amount FROM luminix.finance_entries
   WHERE clinic_id = p_clinic AND id = p_finance_entry AND kind = 'income' AND status = 'active';
  IF NOT FOUND OR luminix.client_package_paid(p_clinic, p_package) + v_amount > v_price THEN
    RAISE EXCEPTION 'Invalid payment' USING ERRCODE = '22023';
  END IF;
  IF p_appointment IS NOT NULL THEN
    PERFORM 1 FROM luminix.appointments
     WHERE clinic_id = p_clinic AND id = p_appointment AND client_package_id = p_package;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid appointment' USING ERRCODE = '22023'; END IF;
  END IF;
  INSERT INTO luminix.client_package_payments (clinic_id, client_package_id, finance_entry_id,
      appointment_id)
    VALUES (p_clinic, p_package, p_finance_entry, p_appointment) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE FUNCTION luminix.set_client_package_plan(p_clinic uuid, p_package uuid, p_plan text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR p_plan IS NULL OR p_plan NOT IN ('paid', 'per_visit', 'later') THEN
    RAISE EXCEPTION 'Invalid plan' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'client:manage');
  UPDATE luminix.client_packages SET payment_plan = p_plan
   WHERE clinic_id = p_clinic AND id = p_package;
  IF NOT FOUND THEN RAISE EXCEPTION 'Package not found' USING ERRCODE = 'P0002'; END IF;
END $$;

REVOKE ALL ON FUNCTION luminix.client_package_paid(uuid, uuid),
  luminix.add_client_package_payment(uuid, uuid, uuid, uuid),
  luminix.set_client_package_plan(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.client_package_paid(uuid, uuid),
  luminix.add_client_package_payment(uuid, uuid, uuid, uuid),
  luminix.set_client_package_plan(uuid, uuid, text) TO luminix_api;

-- ---------- Voucher "Serviço grátis" ----------
ALTER TABLE luminix.client_vouchers ADD COLUMN service_id uuid;
ALTER TABLE luminix.client_vouchers
  ADD FOREIGN KEY (clinic_id, service_id) REFERENCES luminix.services(clinic_id, id);
-- The old type/value checks (names chosen by PostgreSQL) give way to ones that know 'service'.
DO $$
DECLARE v_name text;
BEGIN
  FOR v_name IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'luminix.client_vouchers'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ~ 'discount_(type|value)'
  LOOP
    EXECUTE format('ALTER TABLE luminix.client_vouchers DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;
ALTER TABLE luminix.client_vouchers ADD CONSTRAINT client_vouchers_discount_type_check
  CHECK (discount_type IN ('fixed', 'percent', 'service'));
ALTER TABLE luminix.client_vouchers ADD CONSTRAINT client_vouchers_value_check CHECK (
  (discount_type = 'fixed' AND discount_value BETWEEN 1 AND 100000000 AND service_id IS NULL) OR
  (discount_type = 'percent' AND discount_value BETWEEN 1 AND 100 AND service_id IS NULL) OR
  (discount_type = 'service' AND discount_value = 100 AND service_id IS NOT NULL)
);

CREATE FUNCTION luminix.issue_service_voucher(
  p_clinic uuid, p_client uuid, p_id uuid, p_service uuid, p_expires date
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_today date; v_created uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid voucher' USING ERRCODE = '22023';
  END IF;
  SELECT membership_id INTO STRICT v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'finance:manage');
  SELECT (now() AT TIME ZONE timezone)::date INTO v_today
    FROM luminix.clinic_settings WHERE clinic_id = p_clinic;
  IF p_expires < v_today OR p_expires > v_today + 730
    OR NOT EXISTS (SELECT 1 FROM luminix.clinic_clients
      WHERE clinic_id = p_clinic AND id = p_client AND status = 'active')
    OR NOT EXISTS (SELECT 1 FROM luminix.services
      WHERE clinic_id = p_clinic AND id = p_service AND status = 'active') THEN
    RAISE EXCEPTION 'Invalid voucher' USING ERRCODE = '22023';
  END IF;
  INSERT INTO luminix.client_vouchers (id, clinic_id, clinic_client_id, created_by_membership_id,
      discount_type, discount_value, expires_on, service_id)
    VALUES (p_id, p_clinic, p_client, v_member, 'service', 100, p_expires, p_service)
  ON CONFLICT (id) DO NOTHING RETURNING id INTO v_created;
  IF v_created IS NULL AND NOT EXISTS (
    SELECT 1 FROM luminix.client_vouchers
     WHERE clinic_id = p_clinic AND clinic_client_id = p_client AND id = p_id
       AND discount_type = 'service' AND service_id = p_service AND expires_on = p_expires
  ) THEN
    RAISE EXCEPTION 'Voucher identifier already in use' USING ERRCODE = '23505';
  END IF;
  RETURN v_created IS NOT NULL;
END $$;

-- Same rules as before; a service voucher only fits its service and makes it free.
CREATE OR REPLACE FUNCTION luminix.redeem_client_voucher(p_clinic uuid, p_appointment uuid, p_voucher uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_item luminix.client_vouchers%ROWTYPE; v_visit luminix.appointments%ROWTYPE;
  v_zone text; v_price_type text; v_discount integer;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid voucher' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'agenda:manage');
  SELECT * INTO v_item FROM luminix.client_vouchers
    WHERE clinic_id = p_clinic AND id = p_voucher FOR UPDATE;
  SELECT * INTO v_visit FROM luminix.appointments
    WHERE clinic_id = p_clinic AND id = p_appointment FOR UPDATE;
  SELECT timezone INTO v_zone FROM luminix.clinic_settings WHERE clinic_id = p_clinic;
  SELECT price_type INTO v_price_type FROM luminix.services
    WHERE clinic_id = p_clinic AND id = v_visit.service_id;

  IF v_item.id IS NULL OR v_visit.id IS NULL OR v_item.appointment_id IS NOT NULL
    OR v_item.clinic_client_id <> v_visit.clinic_client_id
    OR v_item.expires_on < (now() AT TIME ZONE v_zone)::date
    OR v_item.expires_on < (v_visit.starts_at AT TIME ZONE v_zone)::date
    OR v_visit.status NOT IN ('scheduled', 'confirmed')
    OR v_visit.booking_source <> 'manager'
    OR v_visit.client_package_id IS NOT NULL OR v_price_type <> 'fixed'
    OR coalesce(v_visit.price_cents, 0) <= 0
    OR (v_item.discount_type = 'service' AND v_item.service_id <> v_visit.service_id)
    OR luminix.appointment_paid_cents(p_clinic, p_appointment) > 0 THEN
    RAISE EXCEPTION 'Voucher unavailable' USING ERRCODE = '55000';
  END IF;

  v_discount := CASE
    WHEN v_item.discount_type = 'service' THEN v_visit.price_cents
    WHEN v_item.discount_type = 'percent'
      THEN round(v_visit.price_cents::numeric * v_item.discount_value / 100)::integer
    ELSE least(v_visit.price_cents, v_item.discount_value) END;
  IF v_discount <= 0 THEN
    RAISE EXCEPTION 'Voucher unavailable' USING ERRCODE = '55000';
  END IF;
  UPDATE luminix.client_vouchers SET appointment_id = p_appointment, applied_discount_cents = v_discount
    WHERE clinic_id = p_clinic AND id = p_voucher;
  UPDATE luminix.appointments SET price_cents = price_cents - v_discount, updated_at = now()
    WHERE clinic_id = p_clinic AND id = p_appointment;
END $$;

REVOKE ALL ON FUNCTION luminix.issue_service_voucher(uuid, uuid, uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.issue_service_voucher(uuid, uuid, uuid, uuid, date) TO luminix_api;

-- Client area notice also names the free service.
DROP FUNCTION luminix.client_voucher_notices(uuid, uuid);
CREATE FUNCTION luminix.client_voucher_notices(p_clinic uuid, p_client uuid)
RETURNS TABLE (id uuid, discount_type text, discount_value integer, expires_on date,
  created_at timestamptz, service_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT v.id, v.discount_type, v.discount_value, v.expires_on, v.created_at, s.name
    FROM luminix.client_vouchers v
    JOIN luminix.clinic_clients c ON c.clinic_id = v.clinic_id AND c.id = v.clinic_client_id
    LEFT JOIN luminix.services s ON s.clinic_id = v.clinic_id AND s.id = v.service_id
   WHERE v.clinic_id = p_clinic AND v.clinic_client_id = p_client
     AND p_clinic = luminix.current_clinic_id()
     AND c.client_profile_id = luminix.client_profile_id()
     AND c.status = 'active' AND c.client_removed_at IS NULL
     AND v.appointment_id IS NULL
     AND v.expires_on >= (now() AT TIME ZONE (
       SELECT timezone FROM luminix.clinic_settings WHERE clinic_id = p_clinic
     ))::date
   ORDER BY v.created_at DESC LIMIT 50
$$;
REVOKE ALL ON FUNCTION luminix.client_voucher_notices(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.client_voucher_notices(uuid, uuid) TO luminix_api;
