-- Sinal pelo app (ADR-042): num serviço com sinal, a cliente escolhe pagar pela Stripe só o sinal
-- ou o valor cheio. O sinal pago vira um pagamento do atendimento; o restante fica em aberto e
-- é pago no espaço, como qualquer valor pendente. O Pix do próprio espaço (ADR-037) continua
-- valendo para quem não recebe pelo app.

-- What the open hold charges: the whole visit or only the deposit, and how much.
ALTER TABLE luminix.appointments
  ADD COLUMN online_payment_kind text
    CHECK (online_payment_kind IS NULL OR online_payment_kind IN ('full', 'deposit')),
  ADD COLUMN online_payment_cents integer
    CHECK (online_payment_cents IS NULL OR online_payment_cents > 0);

ALTER TABLE luminix.online_payments
  ADD COLUMN kind text NOT NULL DEFAULT 'full' CHECK (kind IN ('full', 'deposit'));

-- A deposit is asked when the service has one and the space can collect it: its own Pix key
-- (ADR-037) or payments in the app with an approved Stripe account.
CREATE OR REPLACE FUNCTION luminix.service_requires_deposit(p_clinic uuid, p_service uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM luminix.booking_policies b
      JOIN luminix.services s ON s.clinic_id = b.clinic_id
     WHERE b.clinic_id = p_clinic AND s.id = p_service AND s.status = 'active'
       AND b.deposit_scope = 'selected' AND s.deposit_required
       AND s.price_type = 'fixed' AND s.price_cents > 0
       AND (b.pix_key IS NOT NULL OR luminix.clinic_online_ready(p_clinic)))
$$;

-- Deposit share of a frozen price: the clinic's percent, at least 1 cent, never above the price.
CREATE FUNCTION luminix.deposit_share(p_clinic uuid, p_price integer)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT least(coalesce(p_price, 0),
    greatest(1, round(coalesce(p_price, 0) * b.deposit_percent / 100.0)::integer))
    FROM luminix.booking_policies b WHERE b.clinic_id = p_clinic
$$;
REVOKE ALL ON FUNCTION luminix.deposit_share(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.deposit_share(uuid, integer) TO luminix_api;

-- Right after the client books with Pix/card in the app: hold the slot until paid. p_deposit
-- charges only the deposit of a service that asks for one. Amounts come from the price frozen
-- on the appointment, never from the browser.
CREATE FUNCTION luminix.client_hold_for_online_payment(
  p_clinic uuid, p_client uuid, p_appointment uuid, p_minutes integer, p_deposit boolean
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
     AND deposit_status IS NULL AND online_payment_status IS NULL FOR UPDATE;
  IF NOT FOUND OR coalesce(v_row.price_cents, 0) <= 0 OR v_row.client_package_id IS NOT NULL THEN
    RAISE EXCEPTION 'Payment unavailable' USING ERRCODE = '55000';
  END IF;
  IF p_deposit THEN
    IF NOT luminix.service_requires_deposit(p_clinic, v_row.service_id) THEN
      RAISE EXCEPTION 'Deposit unavailable' USING ERRCODE = '55000';
    END IF;
    v_amount := luminix.deposit_share(p_clinic, v_row.price_cents);
    -- Stripe does not charge less than R$ 0,50 in BRL.
    IF coalesce(v_amount, 0) < 50 THEN
      RAISE EXCEPTION 'Deposit unavailable' USING ERRCODE = '55000';
    END IF;
  ELSE
    v_amount := v_row.price_cents;
  END IF;
  v_due := least(now() + make_interval(mins => p_minutes), v_row.starts_at);
  UPDATE luminix.appointments
     SET online_payment_status = 'awaiting', online_payment_due_at = v_due,
         online_payment_kind = CASE WHEN p_deposit THEN 'deposit' ELSE 'full' END,
         online_payment_cents = v_amount, status = 'scheduled', updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment;
  RETURN QUERY SELECT v_amount, v_due;
END $$;
REVOKE ALL ON FUNCTION luminix.client_hold_for_online_payment(uuid, uuid, uuid, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.client_hold_for_online_payment(uuid, uuid, uuid, integer, boolean) TO luminix_api;

-- The previous signature (API still running the old code during a deploy): full price.
CREATE OR REPLACE FUNCTION luminix.client_hold_for_online_payment(
  p_clinic uuid, p_client uuid, p_appointment uuid, p_minutes integer
) RETURNS TABLE (amount_cents integer, due_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT * FROM luminix.client_hold_for_online_payment(p_clinic, p_client, p_appointment, p_minutes, false)
$$;

-- The Checkout Session created on the clinic's Connect account for that hold.
CREATE OR REPLACE FUNCTION luminix.client_open_online_payment(
  p_clinic uuid, p_client uuid, p_appointment uuid, p_account text, p_session text,
  p_method text, p_amount integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_row luminix.appointments%ROWTYPE;
BEGIN
  IF NOT luminix.client_owns_record(p_clinic, p_client) THEN
    RAISE EXCEPTION 'Client access denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM luminix.appointments
   WHERE clinic_id = p_clinic AND id = p_appointment AND clinic_client_id = p_client
     AND online_payment_status = 'awaiting' FOR UPDATE;
  IF NOT FOUND OR coalesce(v_row.online_payment_cents, v_row.price_cents) IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'Payment unavailable' USING ERRCODE = '55000';
  END IF;
  INSERT INTO luminix.online_payments
    (clinic_id, appointment_id, account_id, session_id, method, amount_cents, kind)
  VALUES (p_clinic, p_appointment, p_account, p_session, p_method, p_amount,
    coalesce(v_row.online_payment_kind, 'full'));
END $$;

-- Signed Connect webhook (the API checks the signature first). Each event applies once.
-- A paid deposit is recorded as the deposit of the visit (confirmed); the rest stays open.
CREATE OR REPLACE FUNCTION luminix.apply_connect_payment(
  p_event text, p_type text, p_account text, p_session text, p_intent text, p_outcome text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_pay luminix.online_payments%ROWTYPE; v_row luminix.appointments%ROWTYPE;
  v_mode text; v_client text; v_entry uuid;
BEGIN
  IF p_event !~ '^evt_' OR p_outcome NOT IN ('paid', 'expired') THEN
    RAISE EXCEPTION 'Invalid payment event' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_pay FROM luminix.online_payments WHERE session_id = p_session FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unknown'; END IF;
  -- A session of one connected account never pays a visit of another clinic.
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

  -- Paid after the slot was already released: keep the money record for a refund.
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
    left(CASE WHEN v_pay.kind = 'deposit' THEN 'Sinal pelo app · ' ELSE 'Pago pelo app · ' END
      || coalesce(v_client, 'Cliente'), 160), 'Atendimentos',
    CASE WHEN v_pay.method = 'pix' THEN 'pix' ELSE 'credit' END, v_row.id)
  RETURNING id INTO v_entry;
  UPDATE luminix.online_payments
     SET status = 'paid', paid_at = now(), finance_entry_id = v_entry,
         payment_intent_id = coalesce(p_intent, payment_intent_id)
   WHERE clinic_id = v_pay.clinic_id AND id = v_pay.id;
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
