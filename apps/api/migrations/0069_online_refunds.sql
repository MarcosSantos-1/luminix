-- Estornos do pagamento pelo app (ADR-040, etapa 2).
--
-- Regra: todo pagamento pelo app de um atendimento cancelado volta inteiro para a cliente (ela só
-- consegue cancelar dentro do prazo; a clínica cancelar sempre devolve). Pagamento que chegou
-- depois de o horário ser liberado (paid_late) também volta. A equipe pode estornar por conta
-- própria (falta, cortesia) e repetir um estorno que falhou. Estorno é sempre do valor cheio.
--
-- Fila: claim_due_refunds marca "pending" (com SKIP LOCKED) e devolve o que a API deve estornar
-- na Stripe; finish_refund grava o resultado. A chave de idempotência da Stripe é por pagamento,
-- então repetir um "pending" travado nunca devolve duas vezes.

ALTER TABLE luminix.online_payments
  ADD COLUMN refund_status text CHECK (refund_status IS NULL OR refund_status IN
    ('pending', 'refunded', 'failed')),
  ADD COLUMN refund_requested_at timestamptz,
  ADD COLUMN refund_id text CHECK (refund_id IS NULL OR refund_id ~ '^(re|pyr)_'),
  ADD COLUMN refunded_at timestamptz,
  ADD COLUMN refund_reason text CHECK (refund_reason IS NULL OR refund_reason IN
    ('canceled', 'paid_late', 'staff'));
CREATE INDEX online_payments_refund_queue ON luminix.online_payments (clinic_id)
  WHERE status IN ('paid', 'paid_late') AND (refund_status IS NULL OR refund_status = 'pending');

ALTER TABLE luminix.appointments DROP CONSTRAINT appointments_online_payment_status_check;
ALTER TABLE luminix.appointments ADD CONSTRAINT appointments_online_payment_status_check
  CHECK (online_payment_status IS NULL OR online_payment_status IN
    ('awaiting', 'paid', 'expired', 'refunded'));

-- What the API must refund now for one clinic (id or space code, as the routes receive it).
-- Also picks a "pending" left behind for 10 minutes (crash between claim and finish).
CREATE FUNCTION luminix.claim_due_refunds(p_ref text)
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
       AND ((p.refund_status IS NULL AND (p.status = 'paid_late' OR a.status = 'canceled'))
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
REVOKE ALL ON FUNCTION luminix.claim_due_refunds(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.claim_due_refunds(text) TO luminix_api;

-- "Estornar" by the team (finance:manage): any paid visit, or a refund that failed. Full amount.
CREATE FUNCTION luminix.staff_request_refund(p_clinic uuid, p_appointment uuid)
RETURNS TABLE (clinic_id uuid, payment_id uuid, account_id text, session_id text,
  payment_intent_id text, amount_cents integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'finance:manage');
  RETURN QUERY
  UPDATE luminix.online_payments p
     SET refund_status = 'pending', refund_requested_at = now(),
         refund_reason = coalesce(p.refund_reason, 'staff')
   WHERE p.clinic_id = p_clinic AND p.appointment_id = p_appointment
     AND p.status IN ('paid', 'paid_late')
     AND (p.refund_status IS NULL OR p.refund_status = 'failed')
  RETURNING p.clinic_id, p.id, p.account_id, p.session_id, p.payment_intent_id, p.amount_cents;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nothing to refund' USING ERRCODE = '55000'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.staff_request_refund(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.staff_request_refund(uuid, uuid) TO luminix_api;

-- Result from Stripe. Refunded: the income of the visit is voided in the Financeiro (the Stripe
-- fee stays with the clinic, as Stripe keeps it) and the visit shows "valor devolvido".
CREATE FUNCTION luminix.finish_refund(
  p_clinic uuid, p_payment uuid, p_refund text, p_ok boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_pay luminix.online_payments%ROWTYPE;
BEGIN
  SELECT * INTO v_pay FROM luminix.online_payments
   WHERE clinic_id = p_clinic AND id = p_payment FOR UPDATE;
  IF NOT FOUND OR v_pay.refund_status IS DISTINCT FROM 'pending' THEN RETURN; END IF;
  IF NOT p_ok THEN
    UPDATE luminix.online_payments SET refund_status = 'failed'
     WHERE clinic_id = p_clinic AND id = p_payment;
    RETURN;
  END IF;
  UPDATE luminix.online_payments
     SET refund_status = 'refunded', refund_id = p_refund, refunded_at = now()
   WHERE clinic_id = p_clinic AND id = p_payment;
  IF v_pay.finance_entry_id IS NOT NULL THEN
    UPDATE luminix.finance_entries SET status = 'void'
     WHERE clinic_id = p_clinic AND id = v_pay.finance_entry_id AND status = 'active';
  END IF;
  UPDATE luminix.appointments SET online_payment_status = 'refunded', updated_at = now()
   WHERE clinic_id = p_clinic AND id = v_pay.appointment_id
     AND online_payment_status = 'paid';
END $$;
REVOKE ALL ON FUNCTION luminix.finish_refund(uuid, uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.finish_refund(uuid, uuid, text, boolean) TO luminix_api;

-- The clinic of a Checkout Session (the Connect webhook has no clinic context).
CREATE FUNCTION luminix.online_payment_clinic(p_session text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT clinic_id FROM luminix.online_payments WHERE session_id = p_session
$$;
REVOKE ALL ON FUNCTION luminix.online_payment_clinic(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.online_payment_clinic(text) TO luminix_api;
