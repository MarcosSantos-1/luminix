-- Pagamento do atendimento pelo app (ADR-040), etapa 1: a cliente paga o valor cheio por Pix ou
-- cartão no Checkout da Stripe, cobrado direto na conta Connect da clínica (direct charge, sem
-- comissão do Luminix). O horário fica segurado até o prazo; sem pagamento, é liberado.
-- Só webhooks assinados da conta Connect confirmam o pagamento; o navegador nunca marca "pago".

ALTER TABLE luminix.appointments
  ADD COLUMN online_payment_status text
    CHECK (online_payment_status IS NULL OR online_payment_status IN ('awaiting', 'paid', 'expired')),
  ADD COLUMN online_payment_due_at timestamptz,
  ADD CONSTRAINT appointments_online_payment_complete CHECK (
    online_payment_status IS NULL OR online_payment_status <> 'awaiting'
    OR online_payment_due_at IS NOT NULL);
CREATE INDEX appointments_online_payment_holds ON luminix.appointments (clinic_id, online_payment_due_at)
  WHERE online_payment_status = 'awaiting';

ALTER TABLE luminix.appointments DROP CONSTRAINT appointments_cancellation_origin_check;
ALTER TABLE luminix.appointments ADD CONSTRAINT appointments_cancellation_origin_check
  CHECK (cancellation_origin IS NULL OR cancellation_origin IN
    ('schedule_change', 'deposit_expired', 'payment_expired'));

-- One Checkout Session per attempt. paid_late: the money arrived after the slot was released
-- (needs a refund; etapa 2).
CREATE TABLE luminix.online_payments (
  clinic_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL,
  account_id text NOT NULL CHECK (account_id ~ '^acct_'),
  session_id text NOT NULL UNIQUE CHECK (session_id ~ '^cs_'),
  payment_intent_id text CHECK (payment_intent_id IS NULL OR payment_intent_id ~ '^pi_'),
  method text NOT NULL CHECK (method IN ('pix', 'card')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'expired', 'paid_late')),
  finance_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  PRIMARY KEY (clinic_id, id),
  FOREIGN KEY (clinic_id, appointment_id) REFERENCES luminix.appointments(clinic_id, id),
  FOREIGN KEY (clinic_id, finance_entry_id) REFERENCES luminix.finance_entries(clinic_id, id)
);
CREATE INDEX online_payments_appointment ON luminix.online_payments (clinic_id, appointment_id);

-- Connect webhooks already applied (idempotency); id and type only, never the payload.
CREATE TABLE luminix.connect_events (
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  event_id text NOT NULL UNIQUE CHECK (event_id ~ '^evt_'),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 80),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, event_id)
);

REVOKE ALL ON luminix.online_payments, luminix.connect_events FROM PUBLIC, luminix_api;
GRANT SELECT ON luminix.online_payments TO luminix_api;
ALTER TABLE luminix.online_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.online_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.online_payments
  USING (clinic_id = luminix.current_clinic_id()) WITH CHECK (clinic_id = luminix.current_clinic_id());
ALTER TABLE luminix.connect_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.connect_events FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.connect_events
  USING (clinic_id = luminix.current_clinic_id()) WITH CHECK (clinic_id = luminix.current_clinic_id());
CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.online_payments
  FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.online_payments
  FOR EACH ROW EXECUTE FUNCTION luminix.audit_change();

-- Right after the client books with Pix/card in the app: hold the slot until paid. The amount
-- is the price frozen on the appointment (promotion included); never a value from the browser.
CREATE FUNCTION luminix.client_hold_for_online_payment(
  p_clinic uuid, p_client uuid, p_appointment uuid, p_minutes integer
) RETURNS TABLE (amount_cents integer, due_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_row luminix.appointments%ROWTYPE; v_due timestamptz;
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
  v_due := least(now() + make_interval(mins => p_minutes), v_row.starts_at);
  UPDATE luminix.appointments
     SET online_payment_status = 'awaiting', online_payment_due_at = v_due,
         status = 'scheduled', updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment;
  RETURN QUERY SELECT v_row.price_cents, v_due;
END $$;
REVOKE ALL ON FUNCTION luminix.client_hold_for_online_payment(uuid, uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.client_hold_for_online_payment(uuid, uuid, uuid, integer) TO luminix_api;

-- The Checkout Session created on the clinic's Connect account for that hold.
CREATE FUNCTION luminix.client_open_online_payment(
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
  IF NOT FOUND OR v_row.price_cents IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'Payment unavailable' USING ERRCODE = '55000';
  END IF;
  INSERT INTO luminix.online_payments
    (clinic_id, appointment_id, account_id, session_id, method, amount_cents)
  VALUES (p_clinic, p_appointment, p_account, p_session, p_method, p_amount);
END $$;
REVOKE ALL ON FUNCTION luminix.client_open_online_payment(uuid, uuid, uuid, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.client_open_online_payment(uuid, uuid, uuid, text, text, text, integer) TO luminix_api;

-- Signed Connect webhook (the API checks the signature first). Each event applies once.
--   paid     the payment of the session succeeded (card at once, Pix when confirmed)
--   expired  the session expired or the Pix failed: the slot is released if still held
CREATE FUNCTION luminix.apply_connect_payment(
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

  -- Paid after the slot was already released: keep the money record for a refund (etapa 2).
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
    left('Pago pelo app · ' || coalesce(v_client, 'Cliente'), 160), 'Atendimentos',
    CASE WHEN v_pay.method = 'pix' THEN 'pix' ELSE 'credit' END, v_row.id)
  RETURNING id INTO v_entry;
  UPDATE luminix.online_payments
     SET status = 'paid', paid_at = now(), finance_entry_id = v_entry,
         payment_intent_id = coalesce(p_intent, payment_intent_id)
   WHERE clinic_id = v_pay.clinic_id AND id = v_pay.id;
  UPDATE luminix.appointments
     SET online_payment_status = 'paid',
         status = CASE WHEN v_mode = 'instant' THEN 'confirmed' ELSE status END,
         updated_at = now()
   WHERE clinic_id = v_row.clinic_id AND id = v_row.id;
  RETURN 'paid';
END $$;
REVOKE ALL ON FUNCTION luminix.apply_connect_payment(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.apply_connect_payment(text, text, text, text, text, text) TO luminix_api;

-- Lazy expiry (same callers as before): Pix deposits not reported and online payments not made
-- in time free the slot.
CREATE OR REPLACE FUNCTION luminix.expire_deposit_holds(p_clinic uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_count integer; v_online integer;
BEGIN
  IF p_clinic IS NULL THEN RETURN 0; END IF;
  UPDATE luminix.appointments
     SET status = 'canceled', deposit_status = 'expired', cancellation_origin = 'deposit_expired',
         status_note = 'Sinal não confirmado no prazo', updated_at = now()
   WHERE clinic_id = p_clinic AND deposit_status = 'awaiting' AND deposit_due_at <= now()
     AND status IN ('scheduled', 'confirmed');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE luminix.appointments
     SET status = 'canceled', online_payment_status = 'expired',
         cancellation_origin = 'payment_expired', canceled_at = now(),
         status_note = 'Pagamento pelo app não concluído', updated_at = now()
   WHERE clinic_id = p_clinic AND online_payment_status = 'awaiting'
     AND online_payment_due_at <= now() AND status IN ('scheduled', 'confirmed');
  GET DIAGNOSTICS v_online = ROW_COUNT;
  RETURN v_count + v_online;
END $$;

-- The clinic's connected account for the platform/mode the API runs on (null when none).
CREATE FUNCTION luminix.clinic_online_account(p_clinic uuid, p_platform text, p_livemode boolean)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT a.account_id FROM luminix.stripe_connect_accounts a
    JOIN luminix.payment_preferences p ON p.clinic_id = a.clinic_id AND p.accept_in_app
   WHERE a.clinic_id = p_clinic AND a.platform_account_id = p_platform
     AND a.livemode = p_livemode AND a.account_id IS NOT NULL
$$;
REVOKE ALL ON FUNCTION luminix.clinic_online_account(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.clinic_online_account(uuid, text, boolean) TO luminix_api;

-- Stripe refused to open the payment: free the slot at once instead of holding it in vain.
CREATE FUNCTION luminix.client_release_online_hold(p_clinic uuid, p_client uuid, p_appointment uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT luminix.client_owns_record(p_clinic, p_client) THEN
    RAISE EXCEPTION 'Client access denied' USING ERRCODE = '42501';
  END IF;
  UPDATE luminix.appointments
     SET status = 'canceled', online_payment_status = 'expired',
         cancellation_origin = 'payment_expired', canceled_at = now(),
         status_note = 'Pagamento pelo app não aberto', updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment AND clinic_client_id = p_client
     AND online_payment_status = 'awaiting' AND status IN ('scheduled', 'confirmed');
END $$;
REVOKE ALL ON FUNCTION luminix.client_release_online_hold(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.client_release_online_hold(uuid, uuid, uuid) TO luminix_api;
