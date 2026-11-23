-- Sinal por Pix do próprio espaço (ADR-037), sem Stripe.
--
-- Serviço com sinal agendado pela cliente: o horário fica reservado ("aguardando sinal") por um
-- prazo. A cliente paga com o Pix copia-e-cola do espaço e avisa ("Já paguei"); a equipe confere
-- no banco e confirma. Confirmado, o sinal vira um pagamento do atendimento (abatido do total).
-- Sem confirmação no prazo — e sem aviso da cliente — o horário é liberado.
-- O Luminix não recebe, não guarda e não devolve dinheiro: só organiza o combinado.

ALTER TABLE luminix.booking_policies
  ADD COLUMN pix_key text CHECK (pix_key IS NULL OR length(btrim(pix_key)) BETWEEN 1 AND 77),
  ADD COLUMN pix_key_type text
    CHECK (pix_key_type IS NULL OR pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')),
  ADD COLUMN pix_holder_name text
    CHECK (pix_holder_name IS NULL OR length(btrim(pix_holder_name)) BETWEEN 1 AND 60),
  ADD COLUMN deposit_hold_minutes integer NOT NULL DEFAULT 120
    CHECK (deposit_hold_minutes BETWEEN 15 AND 1440),
  ADD CONSTRAINT booking_policies_pix_complete
    CHECK ((pix_key IS NULL) = (pix_key_type IS NULL));

ALTER TABLE luminix.appointments
  ADD COLUMN deposit_cents integer CHECK (deposit_cents IS NULL OR deposit_cents > 0),
  ADD COLUMN deposit_status text CHECK (
    deposit_status IS NULL OR deposit_status IN ('awaiting', 'reported', 'confirmed', 'expired')),
  ADD COLUMN deposit_due_at timestamptz,
  ADD COLUMN deposit_reported_at timestamptz,
  ADD COLUMN deposit_confirmed_at timestamptz,
  ADD CONSTRAINT appointments_deposit_complete CHECK (
    (deposit_status IS NULL) = (deposit_cents IS NULL)
    AND (deposit_status IS NULL OR deposit_due_at IS NOT NULL));
CREATE INDEX appointments_deposit_holds ON luminix.appointments (clinic_id, deposit_due_at)
  WHERE deposit_status = 'awaiting';

ALTER TABLE luminix.appointments DROP CONSTRAINT appointments_cancellation_origin_check;
ALTER TABLE luminix.appointments ADD CONSTRAINT appointments_cancellation_origin_check
  CHECK (cancellation_origin IS NULL OR cancellation_origin IN ('schedule_change', 'deposit_expired'));

-- Whether a booking by the client for this service asks for a deposit right now.
CREATE FUNCTION luminix.service_requires_deposit(p_clinic uuid, p_service uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM luminix.booking_policies b
      JOIN luminix.services s ON s.clinic_id = b.clinic_id
     WHERE b.clinic_id = p_clinic AND s.id = p_service AND s.status = 'active'
       AND b.deposit_scope = 'selected' AND s.deposit_required
       AND s.price_type = 'fixed' AND s.price_cents > 0
       AND b.pix_key IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION luminix.service_requires_deposit(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.service_requires_deposit(uuid, uuid) TO luminix_api;

-- Right after the client books: reserve the slot until the deposit is paid. The amount is a
-- share of the price frozen on the appointment (promotion included), never more than it.
CREATE FUNCTION luminix.client_hold_for_deposit(p_clinic uuid, p_client uuid, p_appointment uuid)
RETURNS TABLE (deposit_cents integer, deposit_due_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_row luminix.appointments%ROWTYPE; v_policy luminix.booking_policies%ROWTYPE;
        v_cents integer; v_due timestamptz;
BEGIN
  IF NOT luminix.client_owns_record(p_clinic, p_client) THEN
    RAISE EXCEPTION 'Client access denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM luminix.appointments
   WHERE clinic_id = p_clinic AND id = p_appointment AND clinic_client_id = p_client
     AND booking_source = 'client' AND status IN ('scheduled', 'confirmed')
     AND deposit_status IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT luminix.service_requires_deposit(p_clinic, v_row.service_id) THEN RETURN; END IF;
  SELECT * INTO v_policy FROM luminix.booking_policies WHERE clinic_id = p_clinic;
  v_cents := least(coalesce(v_row.price_cents, 0),
    greatest(1, round(coalesce(v_row.price_cents, 0) * v_policy.deposit_percent / 100.0)::integer));
  IF v_cents <= 0 THEN RETURN; END IF;
  -- The hold never outlives the visit itself.
  v_due := least(now() + make_interval(mins => v_policy.deposit_hold_minutes), v_row.starts_at);
  UPDATE luminix.appointments
     SET deposit_cents = v_cents, deposit_status = 'awaiting', deposit_due_at = v_due,
         status = 'scheduled', updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment;
  RETURN QUERY SELECT v_cents, v_due;
END $$;
REVOKE ALL ON FUNCTION luminix.client_hold_for_deposit(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.client_hold_for_deposit(uuid, uuid, uuid) TO luminix_api;

-- "Já paguei": the hold no longer expires on its own; the team confirms or cancels.
CREATE FUNCTION luminix.client_report_deposit(p_clinic uuid, p_client uuid, p_appointment uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT luminix.client_owns_record(p_clinic, p_client) THEN
    RAISE EXCEPTION 'Client access denied' USING ERRCODE = '42501';
  END IF;
  UPDATE luminix.appointments
     SET deposit_status = 'reported', deposit_reported_at = now(), updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment AND clinic_client_id = p_client
     AND deposit_status = 'awaiting' AND deposit_due_at > now()
     AND status IN ('scheduled', 'confirmed');
  IF NOT FOUND THEN RAISE EXCEPTION 'Deposit unavailable' USING ERRCODE = '55000'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.client_report_deposit(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.client_report_deposit(uuid, uuid, uuid) TO luminix_api;

-- Lazy expiry, run before anyone reads free slots or the agenda: holds whose time ran out
-- without the client saying she paid free the slot. Only rows of the given clinic.
CREATE FUNCTION luminix.expire_deposit_holds(p_clinic uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_count integer;
BEGIN
  IF p_clinic IS NULL THEN RETURN 0; END IF;
  UPDATE luminix.appointments
     SET status = 'canceled', deposit_status = 'expired', cancellation_origin = 'deposit_expired',
         status_note = 'Sinal não confirmado no prazo', updated_at = now()
   WHERE clinic_id = p_clinic AND deposit_status = 'awaiting' AND deposit_due_at <= now()
     AND status IN ('scheduled', 'confirmed');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION luminix.expire_deposit_holds(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.expire_deposit_holds(uuid) TO luminix_api;

-- The team checked the bank: the deposit becomes a Pix payment of the visit and an instant
-- service is confirmed. Idempotent: a second confirmation changes nothing.
CREATE FUNCTION luminix.staff_confirm_deposit(p_clinic uuid, p_appointment uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_row luminix.appointments%ROWTYPE; v_mode text; v_client text;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  SELECT membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'agenda:manage');
  SELECT * INTO v_row FROM luminix.appointments
   WHERE clinic_id = p_clinic AND id = p_appointment FOR UPDATE;
  IF NOT FOUND OR v_row.deposit_status IS NULL THEN
    RAISE EXCEPTION 'Deposit unavailable' USING ERRCODE = '55000';
  END IF;
  IF v_row.deposit_status = 'confirmed' THEN RETURN; END IF;
  IF v_row.deposit_status = 'expired' OR v_row.status NOT IN ('scheduled', 'confirmed') THEN
    RAISE EXCEPTION 'Deposit unavailable' USING ERRCODE = '55000';
  END IF;
  SELECT booking_mode INTO v_mode FROM luminix.services
   WHERE clinic_id = p_clinic AND id = v_row.service_id;
  SELECT display_name INTO v_client FROM luminix.clinic_clients
   WHERE clinic_id = p_clinic AND id = v_row.clinic_client_id;
  UPDATE luminix.appointments
     SET deposit_status = 'confirmed', deposit_confirmed_at = now(),
         status = CASE WHEN v_mode = 'instant' THEN 'confirmed' ELSE status END, updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment;
  INSERT INTO luminix.finance_entries
    (clinic_id, kind, amount_cents, occurred_on, description, category, method, appointment_id,
     created_by_membership_id)
  VALUES (p_clinic, 'income', v_row.deposit_cents, luminix.clinic_today(),
    left('Sinal · ' || coalesce(v_client, 'Cliente'), 160), 'Atendimentos', 'pix', p_appointment,
    v_member);
END $$;
REVOKE ALL ON FUNCTION luminix.staff_confirm_deposit(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.staff_confirm_deposit(uuid, uuid) TO luminix_api;

-- Cancelling follows the deadline of the service when it has one, then the one for special
-- (rented equipment) services, then the clinic's. Rescheduling without its own deadline follows
-- the same cancellation deadline (TD-009).
CREATE OR REPLACE FUNCTION luminix.client_change_deadline_minutes(p_clinic uuid, p_service uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce(
    s.cancellation_notice_minutes,
    CASE WHEN s.booking_mode = 'manual_release' THEN b.special_cancellation_notice_minutes END,
    b.cancellation_notice_minutes, 0)
    FROM luminix.services s
    LEFT JOIN luminix.booking_policies b ON b.clinic_id = s.clinic_id
   WHERE s.clinic_id = p_clinic AND s.id = p_service
$$;
REVOKE ALL ON FUNCTION luminix.client_change_deadline_minutes(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.client_change_deadline_minutes(uuid, uuid) TO luminix_api;

CREATE OR REPLACE FUNCTION luminix.client_cancel_appointment(p_clinic uuid, p_client uuid, p_appointment uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_row luminix.appointments%ROWTYPE; v_policy luminix.booking_policies%ROWTYPE;
BEGIN
  IF NOT luminix.client_owns_record(p_clinic, p_client) THEN
    RAISE EXCEPTION 'Client access denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM luminix.appointments
   WHERE clinic_id = p_clinic AND id = p_appointment AND clinic_client_id = p_client
     AND status IN ('scheduled', 'confirmed') FOR UPDATE;
  IF NOT FOUND OR v_row.starts_at <= now() THEN
    RAISE EXCEPTION 'Appointment not found' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_policy FROM luminix.booking_policies WHERE clinic_id = p_clinic;
  -- A hold not paid yet can always be given up: nothing was paid, nothing to keep.
  IF v_row.deposit_status IS DISTINCT FROM 'awaiting' AND FOUND AND (
    NOT v_policy.allow_client_cancellation
    OR v_row.starts_at - make_interval(
      mins => luminix.client_change_deadline_minutes(p_clinic, v_row.service_id)) < now()) THEN
    RAISE EXCEPTION 'Cancellation closed' USING ERRCODE = 'P0001';
  END IF;
  UPDATE luminix.appointments SET status = 'canceled', updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment;
END $$;

CREATE OR REPLACE FUNCTION luminix.client_reschedule_appointment(
  p_clinic uuid, p_client uuid, p_appointment uuid, p_starts_at timestamptz, p_ends_at timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_row luminix.appointments%ROWTYPE; v_notice integer;
BEGIN
  IF NOT luminix.client_owns_record(p_clinic, p_client) THEN
    RAISE EXCEPTION 'Client access denied' USING ERRCODE = '42501';
  END IF;
  IF p_starts_at IS NULL OR p_ends_at <= p_starts_at OR p_starts_at <= now() THEN
    RAISE EXCEPTION 'Invalid appointment time' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM luminix.appointments
   WHERE clinic_id = p_clinic AND id = p_appointment AND clinic_client_id = p_client
     AND status IN ('scheduled', 'confirmed') FOR UPDATE;
  IF NOT FOUND OR v_row.starts_at <= now() THEN
    RAISE EXCEPTION 'Appointment not found' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(rescheduling_notice_minutes,
                  luminix.client_change_deadline_minutes(p_clinic, v_row.service_id))
    INTO v_notice FROM luminix.booking_policies WHERE clinic_id = p_clinic;
  IF v_notice IS NOT NULL AND v_row.starts_at - make_interval(mins => v_notice) < now() THEN
    RAISE EXCEPTION 'Rescheduling closed' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_clinic::text || coalesce(v_row.professional_id::text, ''), 0));
  IF EXISTS (
    SELECT 1 FROM luminix.appointments
     WHERE clinic_id = p_clinic AND id <> p_appointment AND status IN ('scheduled', 'confirmed')
       AND starts_at < p_ends_at AND ends_at > p_starts_at
       AND (v_row.professional_id IS NULL OR professional_id = v_row.professional_id)
  ) THEN
    RAISE EXCEPTION 'Slot taken' USING ERRCODE = '23P01';
  END IF;
  UPDATE luminix.appointments
     SET previous_starts_at = starts_at, starts_at = p_starts_at, ends_at = p_ends_at,
         rescheduled_at = now(), updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment;
END $$;

-- Settings → Regras e combinados: the space's Pix and how long an unpaid hold lasts.
-- A null key turns the deposit off for client bookings (nothing is held without a way to pay).
CREATE FUNCTION luminix.update_deposit_pix(
  p_clinic uuid, p_key_type text, p_key text, p_holder text, p_hold_minutes integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  UPDATE luminix.booking_policies
     SET pix_key = nullif(btrim(p_key), ''),
         pix_key_type = CASE WHEN nullif(btrim(p_key), '') IS NULL THEN NULL ELSE p_key_type END,
         pix_holder_name = nullif(btrim(p_holder), ''),
         deposit_hold_minutes = coalesce(p_hold_minutes, deposit_hold_minutes),
         updated_at = now()
   WHERE clinic_id = p_clinic;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rules unavailable' USING ERRCODE = '22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.update_deposit_pix(uuid, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.update_deposit_pix(uuid, text, text, text, integer) TO luminix_api;
