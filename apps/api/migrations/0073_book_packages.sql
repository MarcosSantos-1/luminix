-- Pacotes agendáveis pela área da cliente (ADR-044).
--
-- A cliente escolhe um pacote e agenda a primeira sessão. A forma de pagar segue a escolha do
-- espaço em `payment_preferences.package_payment_mode` (já existente desde o onboarding):
--   clinic_only  o pacote é contratado e pago no espaço; o horário leva o pedido do pacote
--   in_app       à vista pelo app (Pix ou cartão, sem parcelas); pago, o pacote nasce sozinho
--   both         a cliente escolhe
-- Parcelar pacote fica no espaço: as parcelas são cobradas mês a mês.

ALTER TABLE luminix.appointments
  ADD COLUMN requested_package_id uuid,
  ADD FOREIGN KEY (clinic_id, requested_package_id)
    REFERENCES luminix.service_packages(clinic_id, id);

ALTER TABLE luminix.appointments DROP CONSTRAINT appointments_online_payment_kind_check;
ALTER TABLE luminix.appointments ADD CONSTRAINT appointments_online_payment_kind_check
  CHECK (online_payment_kind IS NULL OR online_payment_kind IN ('full', 'deposit', 'package'));
ALTER TABLE luminix.online_payments DROP CONSTRAINT online_payments_kind_check;
ALTER TABLE luminix.online_payments ADD CONSTRAINT online_payments_kind_check
  CHECK (kind IN ('full', 'deposit', 'package'));

-- How packages are paid, changed by the owner (settings:manage). In the app needs payments in
-- the app switched on; otherwise only "at the space" is accepted.
CREATE FUNCTION luminix.set_package_payment_mode(p_clinic uuid, p_mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
     OR p_mode IS NULL OR p_mode NOT IN ('clinic_only', 'in_app', 'both') THEN
    RAISE EXCEPTION 'Invalid mode' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  IF p_mode <> 'clinic_only' AND NOT EXISTS (
    SELECT 1 FROM luminix.payment_preferences WHERE clinic_id = p_clinic AND accept_in_app) THEN
    RAISE EXCEPTION 'In-app payments off' USING ERRCODE = '55000';
  END IF;
  INSERT INTO luminix.payment_preferences (clinic_id, package_payment_mode)
    VALUES (p_clinic, p_mode)
  ON CONFLICT (clinic_id) DO UPDATE
    SET package_payment_mode = excluded.package_payment_mode, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION luminix.set_package_payment_mode(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_package_payment_mode(uuid, text) TO luminix_api;

-- Where a package can be paid right now: at the space and/or in the app (approved account).
CREATE FUNCTION luminix.package_payment_options(p_clinic uuid)
RETURNS TABLE (clinic boolean, app boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce(p.package_payment_mode, 'clinic_only') IN ('clinic_only', 'both')
           OR NOT luminix.clinic_online_ready(p_clinic),
         coalesce(p.package_payment_mode, 'clinic_only') IN ('in_app', 'both')
           AND luminix.clinic_online_ready(p_clinic)
    FROM (SELECT p_clinic AS clinic_id) c
    LEFT JOIN luminix.payment_preferences p ON p.clinic_id = c.clinic_id
$$;
REVOKE ALL ON FUNCTION luminix.package_payment_options(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.package_payment_options(uuid) TO luminix_api;

-- Right after the client books: the visit is the first session of the package she chose.
CREATE FUNCTION luminix.client_request_package(
  p_clinic uuid, p_client uuid, p_appointment uuid, p_package uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_row luminix.appointments%ROWTYPE;
BEGIN
  IF NOT luminix.client_owns_record(p_clinic, p_client) THEN
    RAISE EXCEPTION 'Client access denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM luminix.appointments
   WHERE clinic_id = p_clinic AND id = p_appointment AND clinic_client_id = p_client
     AND booking_source = 'client' AND status IN ('scheduled', 'confirmed') FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM luminix.service_packages p
      JOIN luminix.service_package_items i ON i.clinic_id = p.clinic_id AND i.package_id = p.id
     WHERE p.clinic_id = p_clinic AND p.id = p_package AND p.status = 'active'
       AND i.service_id = v_row.service_id) THEN
    RAISE EXCEPTION 'Package unavailable' USING ERRCODE = '55000';
  END IF;
  UPDATE luminix.appointments SET requested_package_id = p_package, updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment;
END $$;
REVOKE ALL ON FUNCTION luminix.client_request_package(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.client_request_package(uuid, uuid, uuid, uuid) TO luminix_api;

-- Paying the package in the app: the slot is held for the package price (cash, no installments).
CREATE FUNCTION luminix.client_hold_for_package_payment(
  p_clinic uuid, p_client uuid, p_appointment uuid, p_minutes integer
) RETURNS TABLE (amount_cents integer, due_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_row luminix.appointments%ROWTYPE; v_due timestamptz; v_amount integer;
BEGIN
  IF NOT luminix.client_owns_record(p_clinic, p_client) THEN
    RAISE EXCEPTION 'Client access denied' USING ERRCODE = '42501';
  END IF;
  IF p_minutes NOT BETWEEN 10 AND 120 THEN
    RAISE EXCEPTION 'Invalid hold' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM luminix.appointments
   WHERE clinic_id = p_clinic AND id = p_appointment AND clinic_client_id = p_client
     AND booking_source = 'client' AND status IN ('scheduled', 'confirmed')
     AND requested_package_id IS NOT NULL AND online_payment_status IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT (SELECT app FROM luminix.package_payment_options(p_clinic)) THEN
    RAISE EXCEPTION 'Payment unavailable' USING ERRCODE = '55000';
  END IF;
  SELECT price_cents INTO v_amount FROM luminix.service_packages
   WHERE clinic_id = p_clinic AND id = v_row.requested_package_id AND status = 'active';
  IF coalesce(v_amount, 0) < 50 THEN
    RAISE EXCEPTION 'Payment unavailable' USING ERRCODE = '55000';
  END IF;
  v_due := least(now() + make_interval(mins => p_minutes), v_row.starts_at);
  UPDATE luminix.appointments
     SET online_payment_status = 'awaiting', online_payment_due_at = v_due,
         online_payment_kind = 'package', online_payment_cents = v_amount,
         status = 'scheduled', updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment;
  RETURN QUERY SELECT v_amount, v_due;
END $$;
REVOKE ALL ON FUNCTION luminix.client_hold_for_package_payment(uuid, uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.client_hold_for_package_payment(uuid, uuid, uuid, integer) TO luminix_api;

-- Signed Connect webhook. A paid package becomes the client's package (sold by the app), the
-- income is linked to it and the visit uses its first session.
CREATE OR REPLACE FUNCTION luminix.apply_connect_payment(
  p_event text, p_type text, p_account text, p_session text, p_intent text, p_outcome text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_pay luminix.online_payments%ROWTYPE; v_row luminix.appointments%ROWTYPE;
  v_mode text; v_client text; v_entry uuid; v_package luminix.service_packages%ROWTYPE;
  v_owned uuid;
BEGIN
  IF p_event !~ '^evt_' OR p_outcome NOT IN ('paid', 'expired') THEN
    RAISE EXCEPTION 'Invalid payment event' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_pay FROM luminix.online_payments WHERE session_id = p_session FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unknown'; END IF;
  IF v_pay.account_id IS DISTINCT FROM p_account THEN
    RAISE EXCEPTION 'Payment owner mismatch' USING ERRCODE = '42501';
  END IF;
  INSERT INTO luminix.connect_events (clinic_id, event_id, event_type)
    VALUES (v_pay.clinic_id, p_event, left(p_type, 80))
  ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN 'duplicate'; END IF;
  IF v_pay.status IN ('paid', 'paid_late') THEN RETURN 'already_paid'; END IF;

  SELECT * INTO v_row FROM luminix.appointments
   WHERE clinic_id = v_pay.clinic_id AND id = v_pay.appointment_id FOR UPDATE;

  IF p_outcome = 'expired' THEN
    UPDATE luminix.online_payments SET status = 'expired'
     WHERE clinic_id = v_pay.clinic_id AND id = v_pay.id;
    IF v_row.online_payment_status = 'awaiting' AND v_row.status IN ('scheduled', 'confirmed') THEN
      UPDATE luminix.appointments
         SET status = 'canceled', online_payment_status = 'expired',
             cancellation_origin = 'payment_expired', canceled_at = now(),
             status_note = 'Pagamento pelo app não concluído', updated_at = now()
       WHERE clinic_id = v_row.clinic_id AND id = v_row.id;
    END IF;
    RETURN 'expired';
  END IF;

  IF v_row.status NOT IN ('scheduled', 'confirmed') OR v_row.online_payment_status = 'expired' THEN
    UPDATE luminix.online_payments
       SET status = 'paid_late', payment_intent_id = coalesce(p_intent, payment_intent_id),
           paid_at = now()
     WHERE clinic_id = v_pay.clinic_id AND id = v_pay.id;
    RETURN 'paid_late';
  END IF;

  SELECT booking_mode INTO v_mode FROM luminix.services
   WHERE clinic_id = v_row.clinic_id AND id = v_row.service_id;
  SELECT display_name INTO v_client FROM luminix.clinic_clients
   WHERE clinic_id = v_row.clinic_id AND id = v_row.clinic_client_id;
  INSERT INTO luminix.finance_entries
    (clinic_id, kind, amount_cents, occurred_on, description, category, method, appointment_id)
  VALUES (v_row.clinic_id, 'income', v_pay.amount_cents, luminix.clinic_today(),
    left(CASE v_pay.kind WHEN 'deposit' THEN 'Sinal pelo app · '
                         WHEN 'package' THEN 'Pacote pelo app · '
                         ELSE 'Pago pelo app · ' END
      || coalesce(v_client, 'Cliente'), 160),
    CASE WHEN v_pay.kind = 'package' THEN 'Pacotes' ELSE 'Atendimentos' END,
    CASE WHEN v_pay.method = 'pix' THEN 'pix' ELSE 'credit' END,
    -- A package's money belongs to the package (linked below), not to one visit.
    CASE WHEN v_pay.kind = 'package' THEN NULL ELSE v_row.id END)
  RETURNING id INTO v_entry;
  UPDATE luminix.online_payments
     SET status = 'paid', paid_at = now(), finance_entry_id = v_entry,
         payment_intent_id = coalesce(p_intent, payment_intent_id)
   WHERE clinic_id = v_pay.clinic_id AND id = v_pay.id;

  IF v_pay.kind = 'package' THEN
    SELECT * INTO v_package FROM luminix.service_packages
     WHERE clinic_id = v_row.clinic_id AND id = v_row.requested_package_id;
    INSERT INTO luminix.client_packages (clinic_id, clinic_client_id, package_id, service_id, name,
        sessions_total, price_cents, sold_on, expires_on, finance_entry_id, kind, duration_minutes)
      VALUES (v_row.clinic_id, v_row.clinic_client_id, v_package.id, v_package.service_id,
        v_package.name, v_package.sessions, v_pay.amount_cents, luminix.clinic_today(),
        CASE WHEN v_package.validity_days IS NULL THEN NULL
             ELSE luminix.clinic_today() + v_package.validity_days END,
        v_entry, v_package.kind, v_package.duration_minutes)
      RETURNING id INTO v_owned;
    INSERT INTO luminix.client_package_items (clinic_id, client_package_id, service_id, sessions, position)
      SELECT v_row.clinic_id, v_owned, service_id, sessions, position
        FROM luminix.service_package_items
       WHERE clinic_id = v_row.clinic_id AND package_id = v_package.id;
    UPDATE luminix.appointments
       SET client_package_id = v_owned, price_cents = 0
     WHERE clinic_id = v_row.clinic_id AND id = v_row.id;
    INSERT INTO luminix.client_package_payments (clinic_id, client_package_id, finance_entry_id,
        appointment_id)
      VALUES (v_row.clinic_id, v_owned, v_entry, v_row.id);
  END IF;

  UPDATE luminix.appointments
     SET online_payment_status = 'paid',
         deposit_cents = CASE WHEN v_pay.kind = 'deposit' THEN v_pay.amount_cents ELSE deposit_cents END,
         deposit_status = CASE WHEN v_pay.kind = 'deposit' THEN 'confirmed' ELSE deposit_status END,
         deposit_due_at = CASE WHEN v_pay.kind = 'deposit' THEN now() ELSE deposit_due_at END,
         deposit_confirmed_at = CASE WHEN v_pay.kind = 'deposit' THEN now() ELSE deposit_confirmed_at END,
         status = CASE WHEN v_mode = 'instant' THEN 'confirmed' ELSE status END,
         updated_at = now()
   WHERE clinic_id = v_row.clinic_id AND id = v_row.id;
  RETURN 'paid';
END $$;

-- A package paid in the app stays the client's when its first visit is canceled: the session
-- is not used and the package keeps every session. Only money that never became a package
-- (paid after the slot was released) goes back on its own.
CREATE OR REPLACE FUNCTION luminix.claim_due_refunds(p_ref text)
RETURNS TABLE (clinic_id uuid, payment_id uuid, account_id text, session_id text,
  payment_intent_id text, amount_cents integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_clinic uuid := luminix.resolve_clinic_ref(p_ref);
BEGIN
  IF v_clinic IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH due AS (
    SELECT p.clinic_id, p.id,
           CASE WHEN p.status = 'paid_late' THEN 'paid_late' ELSE 'canceled' END AS reason
      FROM luminix.online_payments p
      JOIN luminix.appointments a ON a.clinic_id = p.clinic_id AND a.id = p.appointment_id
     WHERE p.clinic_id = v_clinic
       AND p.status IN ('paid', 'paid_late')
       AND ((p.refund_status IS NULL AND (p.status = 'paid_late'
              OR (a.status = 'canceled' AND p.kind <> 'package')))
         OR (p.refund_status = 'pending' AND p.refund_requested_at < now() - interval '10 minutes'))
     ORDER BY p.paid_at
     LIMIT 20
     FOR UPDATE OF p SKIP LOCKED
  )
  UPDATE luminix.online_payments p
     SET refund_status = 'pending', refund_requested_at = now(),
         refund_reason = coalesce(p.refund_reason, due.reason)
    FROM due
   WHERE p.clinic_id = due.clinic_id AND p.id = due.id
  RETURNING p.clinic_id, p.id, p.account_id, p.session_id, p.payment_intent_id, p.amount_cents;
END $$;
