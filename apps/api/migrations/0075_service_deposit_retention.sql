-- Sinal por serviço (herda o percentual da clínica, ou tem o seu) e a Stripe passa a
-- devolver só o que a regra de retenção manda. O que fica com o espaço nunca passa do sinal.

ALTER TABLE luminix.services
  ADD COLUMN deposit_percent_override integer
    CHECK (deposit_percent_override IS NULL OR deposit_percent_override BETWEEN 1 AND 100),
  ADD COLUMN deposit_fixed_cents integer
    CHECK (deposit_fixed_cents IS NULL OR deposit_fixed_cents BETWEEN 1 AND 100000000),
  ADD CONSTRAINT services_deposit_amount_exclusive
    CHECK (deposit_percent_override IS NULL OR deposit_fixed_cents IS NULL);

-- The service decides the share of a frozen price. Null service: the clinic percent.
CREATE FUNCTION luminix.deposit_share(p_clinic uuid, p_service uuid, p_price integer)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce((
    SELECT least(coalesce(p_price, 0),
      CASE WHEN s.deposit_fixed_cents IS NOT NULL THEN s.deposit_fixed_cents
           ELSE greatest(1, round(coalesce(p_price, 0)
             * coalesce(s.deposit_percent_override, b.deposit_percent) / 100.0)::integer)
      END)
      FROM luminix.booking_policies b
      LEFT JOIN luminix.services s ON s.clinic_id = b.clinic_id AND s.id = p_service
     WHERE b.clinic_id = p_clinic
  ), 0)
$$;
REVOKE ALL ON FUNCTION luminix.deposit_share(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.deposit_share(uuid, uuid, integer) TO luminix_api;

CREATE OR REPLACE FUNCTION luminix.client_hold_for_online_payment(
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
    v_amount := luminix.deposit_share(p_clinic, v_row.service_id, v_row.price_cents);
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

CREATE OR REPLACE FUNCTION luminix.client_hold_for_deposit(p_clinic uuid, p_client uuid, p_appointment uuid)
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
  v_cents := luminix.deposit_share(p_clinic, v_row.service_id, v_row.price_cents);
  IF v_cents <= 0 THEN RETURN; END IF;
  v_due := least(now() + make_interval(mins => v_policy.deposit_hold_minutes), v_row.starts_at);
  UPDATE luminix.appointments
     SET deposit_cents = v_cents, deposit_status = 'awaiting', deposit_due_at = v_due,
         status = 'scheduled', updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment;
  RETURN QUERY SELECT v_cents, v_due;
END $$;

DROP FUNCTION luminix.deposit_share(uuid, integer);

-- What may be kept, frozen when the payment lands, so a later edit of the service
-- does not change money already collected. Percents are the rule the client was shown.
ALTER TABLE luminix.online_payments
  ADD COLUMN deposit_cap_cents integer NOT NULL DEFAULT 0
    CHECK (deposit_cap_cents >= 0),
  ADD COLUMN late_retention_percent integer NOT NULL DEFAULT 0
    CHECK (late_retention_percent BETWEEN 0 AND 100),
  ADD COLUMN no_show_retention_percent integer NOT NULL DEFAULT 0
    CHECK (no_show_retention_percent BETWEEN 0 AND 100),
  ADD COLUMN refunded_cents integer NOT NULL DEFAULT 0
    CHECK (refunded_cents >= 0),
  ADD COLUMN refund_cents integer
    CHECK (refund_cents IS NULL OR refund_cents >= 0);

ALTER TABLE luminix.online_payments DROP CONSTRAINT IF EXISTS online_payments_refund_status_check;
ALTER TABLE luminix.online_payments ADD CONSTRAINT online_payments_refund_status_check
  CHECK (refund_status IS NULL OR refund_status IN
    ('pending', 'refunded', 'failed', 'retained', 'partial'));
ALTER TABLE luminix.online_payments DROP CONSTRAINT IF EXISTS online_payments_refund_reason_check;
ALTER TABLE luminix.online_payments ADD CONSTRAINT online_payments_refund_reason_check
  CHECK (refund_reason IS NULL OR refund_reason IN ('canceled', 'paid_late', 'staff', 'no_show'));

ALTER TABLE luminix.appointments DROP CONSTRAINT appointments_online_payment_status_check;
ALTER TABLE luminix.appointments ADD CONSTRAINT appointments_online_payment_status_check
  CHECK (online_payment_status IS NULL OR online_payment_status IN
    ('awaiting', 'paid', 'expired', 'refunded', 'partially_refunded'));

CREATE FUNCTION luminix.snapshot_online_retention()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_service uuid; v_price integer; v_late integer; v_miss integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'paid' OR OLD.status = 'paid' OR NEW.kind = 'package' THEN
    RETURN NEW;
  END IF;
  SELECT service_id, price_cents INTO v_service, v_price FROM luminix.appointments
   WHERE clinic_id = NEW.clinic_id AND id = NEW.appointment_id;
  SELECT late_change_retention_percent, no_show_retention_percent
    INTO v_late, v_miss FROM luminix.booking_policies WHERE clinic_id = NEW.clinic_id;
  NEW.late_retention_percent := coalesce(v_late, 0);
  NEW.no_show_retention_percent := coalesce(v_miss, 0);
  NEW.deposit_cap_cents := CASE
    WHEN v_service IS NULL OR NOT luminix.service_requires_deposit(NEW.clinic_id, v_service) THEN 0
    ELSE least(NEW.amount_cents, luminix.deposit_share(NEW.clinic_id, v_service, v_price))
  END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION luminix.snapshot_online_retention() FROM PUBLIC;
CREATE TRIGGER snapshot_online_retention
  BEFORE UPDATE ON luminix.online_payments
  FOR EACH ROW EXECUTE FUNCTION luminix.snapshot_online_retention();

-- A cancel needs a stable clock. The panel and the client used to touch only updated_at.
CREATE OR REPLACE FUNCTION luminix.cancel_appointment(p_clinic uuid, p_appointment uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR length(coalesce(p_note, '')) > 300 THEN
    RAISE EXCEPTION 'Invalid appointment' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'agenda:manage');
  UPDATE luminix.appointments
     SET status = 'canceled', status_note = nullif(btrim(p_note), ''),
         canceled_at = coalesce(canceled_at, now()), updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found' USING ERRCODE = '22023'; END IF;
END $$;

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
  IF v_row.deposit_status IS DISTINCT FROM 'awaiting' AND FOUND AND (
    NOT v_policy.allow_client_cancellation
    OR v_row.starts_at - make_interval(
      mins => luminix.client_change_deadline_minutes(p_clinic, v_row.service_id)) < now()) THEN
    RAISE EXCEPTION 'Cancellation closed' USING ERRCODE = 'P0001';
  END IF;
  UPDATE luminix.appointments
     SET status = 'canceled', canceled_at = coalesce(canceled_at, now()), updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment;
END $$;

CREATE OR REPLACE FUNCTION luminix.update_booking_rules(p_clinic uuid, p_rules jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_item jsonb; v_scope text := coalesce(p_rules->>'depositScope', 'none'); v_mode text;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR jsonb_typeof(p_rules) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid rules' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  IF NOT EXISTS (SELECT 1 FROM luminix.clinics WHERE id = p_clinic AND status = 'active') THEN
    RAISE EXCEPTION 'Complete onboarding first' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_rules->>'bookingNoticeHours', '') !~ '^[0-9]{1,3}$' OR (p_rules->>'bookingNoticeHours')::integer > 168
    OR coalesce(p_rules->>'bookingWindowDays', '') !~ '^[0-9]{1,3}$' OR (p_rules->>'bookingWindowDays')::integer NOT BETWEEN 7 AND 365
    OR coalesce(p_rules->>'cancellationHours', '') !~ '^[0-9]{1,3}$' OR (p_rules->>'cancellationHours')::integer > 168
    OR coalesce(p_rules->>'specialCancellationHours', '') !~ '^[0-9]{1,3}$' OR (p_rules->>'specialCancellationHours')::integer > 336
    OR (jsonb_typeof(p_rules->'reschedulingHours') <> 'null' AND (coalesce(p_rules->>'reschedulingHours', '') !~ '^[0-9]{1,3}$' OR (p_rules->>'reschedulingHours')::integer > 336))
    OR length(coalesce(p_rules->>'clientInstructions', '')) > 500
    OR coalesce(p_rules->>'lateChangeRetentionPercent', '') !~ '^[0-9]{1,3}$' OR (p_rules->>'lateChangeRetentionPercent')::integer > 100
    OR coalesce(p_rules->>'noShowRetentionPercent', '') !~ '^[0-9]{1,3}$' OR (p_rules->>'noShowRetentionPercent')::integer > 100
    OR v_scope NOT IN ('none', 'all', 'threshold', 'special', 'selected')
    OR coalesce(p_rules->>'depositPercent', '') !~ '^[0-9]{1,3}$' OR (p_rules->>'depositPercent')::integer NOT BETWEEN 1 AND 100
    OR coalesce(p_rules->>'depositThresholdCents', '') !~ '^[0-9]{1,9}$' OR (p_rules->>'depositThresholdCents')::integer < 1
    OR jsonb_typeof(p_rules->'services') IS DISTINCT FROM 'array' OR jsonb_array_length(p_rules->'services') > 80 THEN
    RAISE EXCEPTION 'Invalid rules' USING ERRCODE = '22023';
  END IF;
  UPDATE luminix.booking_policies SET
      booking_notice_minutes = (p_rules->>'bookingNoticeHours')::integer * 60,
      booking_window_days = (p_rules->>'bookingWindowDays')::integer,
      cancellation_notice_minutes = (p_rules->>'cancellationHours')::integer * 60,
      special_cancellation_notice_minutes = (p_rules->>'specialCancellationHours')::integer * 60,
      rescheduling_notice_minutes = (p_rules->>'reschedulingHours')::integer * 60,
      client_instructions = coalesce(p_rules->>'clientInstructions', ''),
      late_change_retention_percent = (p_rules->>'lateChangeRetentionPercent')::integer,
      no_show_retention_percent = (p_rules->>'noShowRetentionPercent')::integer,
      deposit_scope = v_scope,
      deposit_percent = (p_rules->>'depositPercent')::integer,
      deposit_threshold_cents = (p_rules->>'depositThresholdCents')::integer,
      updated_at = now()
    WHERE clinic_id = p_clinic;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rules unavailable' USING ERRCODE = '22023'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rules->'services') LOOP
    v_mode := coalesce(v_item->>'depositMode', 'inherit');
    IF jsonb_typeof(v_item) <> 'object' OR coalesce(v_item->>'id', '') !~* '^[0-9a-f-]{36}$'
      OR jsonb_typeof(v_item->'depositRequired') IS DISTINCT FROM 'boolean'
      OR v_mode NOT IN ('inherit', 'percent', 'fixed')
      OR (v_mode = 'percent' AND (coalesce(v_item->>'depositPercent', '') !~ '^[0-9]{1,3}$'
        OR (v_item->>'depositPercent')::integer NOT BETWEEN 1 AND 100))
      OR (v_mode = 'fixed' AND (coalesce(v_item->>'depositCents', '') !~ '^[0-9]{1,9}$'
        OR (v_item->>'depositCents')::integer < 1))
      OR (jsonb_typeof(v_item->'lateChangeRetentionPercent') <> 'null'
        AND (coalesce(v_item->>'lateChangeRetentionPercent', '') !~ '^[0-9]{1,3}$' OR (v_item->>'lateChangeRetentionPercent')::integer > 100))
      OR (jsonb_typeof(v_item->'noShowRetentionPercent') <> 'null'
        AND (coalesce(v_item->>'noShowRetentionPercent', '') !~ '^[0-9]{1,3}$' OR (v_item->>'noShowRetentionPercent')::integer > 100)) THEN
      RAISE EXCEPTION 'Invalid service rule' USING ERRCODE = '22023';
    END IF;
    UPDATE luminix.services SET
        deposit_required = (v_item->>'depositRequired')::boolean,
        deposit_percent_override = CASE WHEN v_mode = 'percent' THEN (v_item->>'depositPercent')::integer END,
        deposit_fixed_cents = CASE WHEN v_mode = 'fixed' THEN (v_item->>'depositCents')::integer END,
        late_change_retention_percent = (v_item->>'lateChangeRetentionPercent')::integer,
        no_show_retention_percent = (v_item->>'noShowRetentionPercent')::integer
      WHERE clinic_id = p_clinic AND id = (v_item->>'id')::uuid AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid service rule' USING ERRCODE = '22023'; END IF;
  END LOOP;
END $$;

DROP FUNCTION luminix.claim_due_refunds(text);
CREATE FUNCTION luminix.claim_due_refunds(p_ref text)
RETURNS TABLE (clinic_id uuid, payment_id uuid, account_id text, session_id text,
  payment_intent_id text, amount_cents integer, refund_cents integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_clinic uuid := luminix.resolve_clinic_ref(p_ref); r record;
        v_give integer; v_reason text; v_when timestamptz; v_notice integer;
BEGIN
  IF v_clinic IS NULL THEN RETURN; END IF;
  FOR r IN
    SELECT p.id, p.clinic_id, p.account_id, p.session_id, p.payment_intent_id, p.amount_cents,
           p.refund_status, p.refund_cents, p.refund_reason, p.deposit_cap_cents,
           p.late_retention_percent, p.no_show_retention_percent, p.status AS pay_status,
           a.status AS visit_status, a.starts_at, a.canceled_at, a.updated_at, a.service_id
      FROM luminix.online_payments p
      JOIN luminix.appointments a ON a.clinic_id = p.clinic_id AND a.id = p.appointment_id
     WHERE p.clinic_id = v_clinic
       AND p.status IN ('paid', 'paid_late')
       AND p.kind <> 'package'
       AND ((p.refund_status IS NULL AND (p.status = 'paid_late' OR a.status IN ('canceled', 'no_show')))
         OR (p.refund_status = 'pending' AND p.refund_requested_at < now() - interval '10 minutes'))
     ORDER BY p.paid_at
     LIMIT 20
     FOR UPDATE OF p SKIP LOCKED
  LOOP
    IF r.refund_status = 'pending' THEN
      v_give := coalesce(r.refund_cents, r.amount_cents);
      v_reason := coalesce(r.refund_reason, 'canceled');
    ELSIF r.pay_status = 'paid_late' THEN
      v_give := r.amount_cents;
      v_reason := 'paid_late';
    ELSIF r.visit_status = 'no_show' THEN
      v_give := r.amount_cents - least(r.deposit_cap_cents,
        round(r.amount_cents * r.no_show_retention_percent / 100.0)::integer);
      v_reason := 'no_show';
    ELSE
      v_notice := luminix.client_change_deadline_minutes(r.clinic_id, r.service_id);
      v_when := coalesce(r.canceled_at, r.updated_at, now());
      IF v_when <= r.starts_at - make_interval(mins => v_notice) THEN
        v_give := r.amount_cents;
      ELSE
        v_give := r.amount_cents - least(r.deposit_cap_cents,
          round(r.amount_cents * r.late_retention_percent / 100.0)::integer);
      END IF;
      v_reason := 'canceled';
    END IF;
    v_give := greatest(0, least(v_give, r.amount_cents));
    IF v_give = 0 THEN
      UPDATE luminix.online_payments AS pay
         SET refund_status = 'retained', refund_cents = 0, refund_requested_at = now(),
             refund_reason = coalesce(pay.refund_reason, v_reason)
       WHERE pay.clinic_id = r.clinic_id AND pay.id = r.id;
    ELSE
      UPDATE luminix.online_payments AS pay
         SET refund_status = 'pending', refund_cents = v_give, refund_requested_at = now(),
             refund_reason = coalesce(pay.refund_reason, v_reason)
       WHERE pay.clinic_id = r.clinic_id AND pay.id = r.id;
      clinic_id := r.clinic_id;
      payment_id := r.id;
      account_id := r.account_id;
      session_id := r.session_id;
      payment_intent_id := r.payment_intent_id;
      amount_cents := r.amount_cents;
      refund_cents := v_give;
      RETURN NEXT;
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION luminix.claim_due_refunds(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.claim_due_refunds(text) TO luminix_api;

DROP FUNCTION luminix.staff_request_refund(uuid, uuid);
CREATE FUNCTION luminix.staff_request_refund(p_clinic uuid, p_appointment uuid)
RETURNS TABLE (clinic_id uuid, payment_id uuid, account_id text, session_id text,
  payment_intent_id text, amount_cents integer, refund_cents integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'finance:manage');
  RETURN QUERY
  UPDATE luminix.online_payments p
     SET refund_status = 'pending', refund_requested_at = now(), refund_reason = 'staff',
         refund_cents = p.amount_cents - p.refunded_cents
   WHERE p.clinic_id = p_clinic AND p.appointment_id = p_appointment
     AND p.status IN ('paid', 'paid_late')
     AND p.amount_cents > p.refunded_cents
     AND (p.refund_status IS NULL OR p.refund_status IN ('failed', 'retained', 'partial'))
  RETURNING p.clinic_id, p.id, p.account_id, p.session_id, p.payment_intent_id,
    p.amount_cents, p.refund_cents;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nothing to refund' USING ERRCODE = '55000'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.staff_request_refund(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.staff_request_refund(uuid, uuid) TO luminix_api;

CREATE OR REPLACE FUNCTION luminix.finish_refund(
  p_clinic uuid, p_payment uuid, p_refund text, p_ok boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_pay luminix.online_payments%ROWTYPE; v_give integer; v_done integer; v_keep integer;
BEGIN
  SELECT * INTO v_pay FROM luminix.online_payments
   WHERE clinic_id = p_clinic AND id = p_payment FOR UPDATE;
  IF NOT FOUND OR v_pay.refund_status IS DISTINCT FROM 'pending' THEN RETURN; END IF;
  IF NOT p_ok THEN
    UPDATE luminix.online_payments SET refund_status = 'failed'
     WHERE clinic_id = p_clinic AND id = p_payment;
    RETURN;
  END IF;
  v_give := least(coalesce(v_pay.refund_cents, v_pay.amount_cents),
    v_pay.amount_cents - v_pay.refunded_cents);
  v_done := v_pay.refunded_cents + v_give;
  v_keep := v_pay.amount_cents - v_done;
  UPDATE luminix.online_payments
     SET refund_status = CASE WHEN v_keep = 0 THEN 'refunded' ELSE 'partial' END,
         refund_id = p_refund, refunded_at = now(), refunded_cents = v_done
   WHERE clinic_id = p_clinic AND id = p_payment;
  IF v_keep = 0 THEN
    IF v_pay.finance_entry_id IS NOT NULL THEN
      UPDATE luminix.finance_entries SET status = 'void'
       WHERE clinic_id = p_clinic AND id = v_pay.finance_entry_id AND status = 'active';
    END IF;
    UPDATE luminix.appointments SET online_payment_status = 'refunded', updated_at = now()
     WHERE clinic_id = p_clinic AND id = v_pay.appointment_id
       AND online_payment_status IN ('paid', 'partially_refunded');
  ELSE
    IF v_pay.finance_entry_id IS NOT NULL THEN
      UPDATE luminix.finance_entries SET amount_cents = v_keep
       WHERE clinic_id = p_clinic AND id = v_pay.finance_entry_id AND status = 'active';
    END IF;
    UPDATE luminix.appointments SET online_payment_status = 'partially_refunded', updated_at = now()
     WHERE clinic_id = p_clinic AND id = v_pay.appointment_id
       AND online_payment_status = 'paid';
  END IF;
END $$;
