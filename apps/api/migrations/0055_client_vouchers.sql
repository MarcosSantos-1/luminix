CREATE TABLE luminix.client_vouchers (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  clinic_client_id uuid NOT NULL,
  created_by_membership_id uuid NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('fixed', 'percent')),
  discount_value integer NOT NULL CHECK (
    (discount_type = 'fixed' AND discount_value BETWEEN 1 AND 100000000) OR
    (discount_type = 'percent' AND discount_value BETWEEN 1 AND 100)
  ),
  expires_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  appointment_id uuid,
  applied_discount_cents integer CHECK (applied_discount_cents > 0),
  CHECK ((appointment_id IS NULL) = (applied_discount_cents IS NULL)),
  UNIQUE (clinic_id, appointment_id),
  FOREIGN KEY (clinic_id, clinic_client_id) REFERENCES luminix.clinic_clients(clinic_id, id),
  FOREIGN KEY (clinic_id, created_by_membership_id) REFERENCES luminix.clinic_memberships(clinic_id, id),
  FOREIGN KEY (clinic_id, appointment_id) REFERENCES luminix.appointments(clinic_id, id)
);

CREATE INDEX client_vouchers_client ON luminix.client_vouchers (clinic_id, clinic_client_id, created_at DESC);
ALTER TABLE luminix.client_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.client_vouchers FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.client_vouchers
  USING (clinic_id = luminix.current_clinic_id())
  WITH CHECK (clinic_id = luminix.current_clinic_id());
CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.client_vouchers
  FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON luminix.client_vouchers
  FOR EACH ROW EXECUTE FUNCTION luminix.audit_change();

CREATE FUNCTION luminix.issue_client_voucher(
  p_clinic uuid, p_client uuid, p_id uuid, p_type text, p_value integer, p_expires date
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
  IF p_expires < v_today OR p_expires > v_today + 730 OR NOT EXISTS (
    SELECT 1 FROM luminix.clinic_clients WHERE clinic_id = p_clinic AND id = p_client AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Invalid voucher' USING ERRCODE = '22023';
  END IF;
  INSERT INTO luminix.client_vouchers (
    id, clinic_id, clinic_client_id, created_by_membership_id, discount_type, discount_value, expires_on
  ) VALUES (p_id, p_clinic, p_client, v_member, p_type, p_value, p_expires)
  ON CONFLICT (id) DO NOTHING RETURNING id INTO v_created;
  IF v_created IS NULL AND NOT EXISTS (
    SELECT 1 FROM luminix.client_vouchers
    WHERE clinic_id = p_clinic AND clinic_client_id = p_client AND id = p_id
      AND discount_type = p_type AND discount_value = p_value AND expires_on = p_expires
  ) THEN
    RAISE EXCEPTION 'Voucher identifier already in use' USING ERRCODE = '23505';
  END IF;
  RETURN v_created IS NOT NULL;
END $$;

CREATE FUNCTION luminix.redeem_client_voucher(p_clinic uuid, p_appointment uuid, p_voucher uuid)
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
    OR luminix.appointment_paid_cents(p_clinic, p_appointment) > 0 THEN
    RAISE EXCEPTION 'Voucher unavailable' USING ERRCODE = '55000';
  END IF;

  v_discount := CASE WHEN v_item.discount_type = 'percent'
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

CREATE FUNCTION luminix.client_voucher_notices(p_clinic uuid, p_client uuid)
RETURNS TABLE (id uuid, discount_type text, discount_value integer, expires_on date, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT v.id, v.discount_type, v.discount_value, v.expires_on, v.created_at
    FROM luminix.client_vouchers v
    JOIN luminix.clinic_clients c ON c.clinic_id = v.clinic_id AND c.id = v.clinic_client_id
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

REVOKE ALL ON FUNCTION luminix.issue_client_voucher(uuid, uuid, uuid, text, integer, date),
  luminix.redeem_client_voucher(uuid, uuid, uuid), luminix.client_voucher_notices(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.issue_client_voucher(uuid, uuid, uuid, text, integer, date),
  luminix.redeem_client_voucher(uuid, uuid, uuid), luminix.client_voucher_notices(uuid, uuid) TO luminix_api;
GRANT SELECT ON luminix.client_vouchers TO luminix_api;
