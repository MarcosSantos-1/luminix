-- Assinatura do Luminix (ADR-039): plano único mensal (R$ 99,90) ou anual (R$ 900), cartão
-- recorrente pela Stripe ou Pix avulso, 12 dias grátis sem cartão, 7 dias de carência e depois
-- só leitura. Os dados da clínica nunca são apagados por falta de pagamento.
--
-- "Pago até" (paid_until) é a única fonte de acesso pago: a assinatura no cartão escreve o fim do
-- período atual; cada Pix pago soma um mês ou um ano a partir do que já estava pago. A Stripe só
-- é chamada pela API; aqui ficam o estado, os eventos já processados e as regras de acesso.

CREATE TABLE luminix.clinic_subscriptions (
  clinic_id uuid PRIMARY KEY REFERENCES luminix.clinics(id),
  plan text CHECK (plan IS NULL OR plan IN ('monthly', 'annual')),
  payment_method text CHECK (payment_method IS NULL OR payment_method IN ('card', 'pix')),
  -- NULL: 12 dias a partir da conclusão do cadastro (ou da criação da clínica).
  trial_ends_at timestamptz,
  paid_until timestamptz,
  -- Cortesia (clínicas da casa, parceiros): conta como pago até a data.
  complimentary_until timestamptz,
  card_status text CHECK (card_status IS NULL OR card_status IN
    ('active', 'past_due', 'canceled', 'incomplete')),
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  stripe_customer_id text UNIQUE CHECK (stripe_customer_id IS NULL OR stripe_customer_id ~ '^cus_'),
  stripe_subscription_id text UNIQUE
    CHECK (stripe_subscription_id IS NULL OR stripe_subscription_id ~ '^sub_'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Webhooks Stripe já aplicados (idempotência). Guardamos só id, tipo e quando; nunca o payload.
CREATE TABLE luminix.billing_events (
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  event_id text NOT NULL UNIQUE CHECK (event_id ~ '^evt_'),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 80),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, event_id)
);

REVOKE ALL ON luminix.clinic_subscriptions, luminix.billing_events FROM PUBLIC, luminix_api;
GRANT SELECT ON luminix.clinic_subscriptions TO luminix_api;
ALTER TABLE luminix.clinic_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.clinic_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.clinic_subscriptions
  USING (clinic_id = luminix.current_clinic_id()) WITH CHECK (clinic_id = luminix.current_clinic_id());
ALTER TABLE luminix.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.billing_events FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.billing_events
  USING (clinic_id = luminix.current_clinic_id()) WITH CHECK (clinic_id = luminix.current_clinic_id());
CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.clinic_subscriptions
  FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.clinic_subscriptions
  FOR EACH ROW EXECUTE FUNCTION luminix.audit_change();

-- Clínicas que já existem antes do lançamento (só testes; sem clientes reais) ganham o teste até
-- 12 dias depois do lançamento previsto, para nenhuma ficar só leitura no dia do deploy.
INSERT INTO luminix.clinic_subscriptions (clinic_id, trial_ends_at)
SELECT c.id, greatest(coalesce(d.completed_at, c.created_at) + interval '12 days',
                      timestamptz '2026-12-22 23:59:59-03')
  FROM luminix.clinics c
  LEFT JOIN luminix.onboarding_drafts d ON d.clinic_id = c.id;

-- Estado de acesso de uma clínica, calculado sempre no banco (nunca vem do navegador).
--   trial      dentro dos 12 dias grátis
--   active     pago (cartão em dia, Pix válido ou cortesia)
--   grace      venceu há menos de 7 dias: avisa, ainda edita
--   read_only  venceu há 7 dias ou mais: só leitura, agendamento online pausado
CREATE FUNCTION luminix.clinic_access_state(p_clinic uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_sub luminix.clinic_subscriptions%ROWTYPE; v_trial timestamptz; v_paid timestamptz;
  v_end timestamptz; v_state text; v_grace interval := interval '7 days';
BEGIN
  SELECT * INTO v_sub FROM luminix.clinic_subscriptions WHERE clinic_id = p_clinic;
  -- A space still in its first setup has not started the trial yet.
  IF NOT EXISTS (SELECT 1 FROM luminix.clinics WHERE id = p_clinic AND status = 'active') THEN
    RETURN jsonb_build_object('state', 'trial', 'trialEndsAt', NULL, 'paidUntil', NULL,
      'graceEndsAt', NULL, 'plan', NULL, 'paymentMethod', NULL, 'cardStatus', NULL,
      'cancelAtPeriodEnd', false, 'complimentary', false, 'hasCustomer', false);
  END IF;
  v_trial := coalesce(v_sub.trial_ends_at, (
    SELECT coalesce(d.completed_at, c.created_at) + interval '12 days'
      FROM luminix.clinics c LEFT JOIN luminix.onboarding_drafts d ON d.clinic_id = c.id
     WHERE c.id = p_clinic));
  v_paid := greatest(v_sub.paid_until, v_sub.complimentary_until);
  v_end := greatest(v_trial, v_paid);
  v_state := CASE
    WHEN v_paid IS NOT NULL AND v_paid > now() THEN 'active'
    WHEN v_trial IS NOT NULL AND v_trial > now() THEN 'trial'
    WHEN v_end IS NOT NULL AND v_end + v_grace > now() THEN 'grace'
    ELSE 'read_only' END;
  RETURN jsonb_build_object(
    'state', v_state,
    'trialEndsAt', v_trial,
    'paidUntil', v_paid,
    'graceEndsAt', CASE WHEN v_end IS NOT NULL THEN v_end + v_grace END,
    'plan', v_sub.plan,
    'paymentMethod', v_sub.payment_method,
    'cardStatus', v_sub.card_status,
    'cancelAtPeriodEnd', coalesce(v_sub.cancel_at_period_end, false),
    'complimentary', v_sub.complimentary_until IS NOT NULL AND v_sub.complimentary_until > now(),
    'hasCustomer', v_sub.stripe_customer_id IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION luminix.clinic_access_state(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.clinic_access_state(uuid) TO luminix_api;

-- Usado antes de cada escrita da equipe (aceita id ou código do espaço, como as rotas).
CREATE FUNCTION luminix.clinic_read_only(p_ref text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce(luminix.clinic_access_state(luminix.resolve_clinic_ref(p_ref))->>'state'
    = 'read_only', false)
$$;
REVOKE ALL ON FUNCTION luminix.clinic_read_only(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.clinic_read_only(text) TO luminix_api;

-- Cliente nova de uma clínica: começa o teste a partir da conclusão do cadastro.
CREATE FUNCTION luminix.ensure_clinic_subscription() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  INSERT INTO luminix.clinic_subscriptions (clinic_id) VALUES (NEW.id)
    ON CONFLICT (clinic_id) DO NOTHING;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION luminix.ensure_clinic_subscription() FROM PUBLIC;
CREATE TRIGGER ensure_subscription AFTER INSERT ON luminix.clinics
  FOR EACH ROW EXECUTE FUNCTION luminix.ensure_clinic_subscription();

-- A equipe (dona) liga a clínica ao cliente Stripe criado pela API antes do checkout.
CREATE FUNCTION luminix.staff_set_billing_customer(p_clinic uuid, p_customer text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_customer !~ '^cus_' THEN
    RAISE EXCEPTION 'Invalid billing customer' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  INSERT INTO luminix.clinic_subscriptions (clinic_id, stripe_customer_id)
    VALUES (p_clinic, p_customer)
  ON CONFLICT (clinic_id) DO UPDATE
    SET stripe_customer_id = coalesce(luminix.clinic_subscriptions.stripe_customer_id,
                                      excluded.stripe_customer_id),
        updated_at = now();
END $$;
REVOKE ALL ON FUNCTION luminix.staff_set_billing_customer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.staff_set_billing_customer(uuid, text) TO luminix_api;

-- Webhook Stripe assinado (a API confere a assinatura antes). Cada evento só vale uma vez.
-- p_kind:
--   pix_paid       Pix confirmado: soma 1 mês/1 ano a partir do maior entre agora e o já pago
--   card_period    assinatura no cartão: status e fim do período atual
--   card_canceled  assinatura encerrada (o que já foi pago continua valendo até o fim)
CREATE FUNCTION luminix.apply_billing_event(
  p_event text, p_type text, p_clinic uuid, p_kind text, p_plan text,
  p_card_status text, p_period_end timestamptz, p_cancel_at_end boolean,
  p_customer text, p_subscription text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_sub luminix.clinic_subscriptions%ROWTYPE; v_from timestamptz;
BEGIN
  IF p_event !~ '^evt_' OR p_kind NOT IN ('pix_paid', 'card_period', 'card_canceled')
     OR (p_plan IS NOT NULL AND p_plan NOT IN ('monthly', 'annual')) THEN
    RAISE EXCEPTION 'Invalid billing event' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.clinics WHERE id = p_clinic;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clinic not found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO luminix.billing_events (clinic_id, event_id, event_type)
    VALUES (p_clinic, p_event, left(p_type, 80))
  ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO luminix.clinic_subscriptions (clinic_id) VALUES (p_clinic)
    ON CONFLICT (clinic_id) DO NOTHING;
  SELECT * INTO v_sub FROM luminix.clinic_subscriptions WHERE clinic_id = p_clinic FOR UPDATE;
  -- Never move a customer or subscription from another clinic onto this one.
  IF (p_customer IS NOT NULL AND v_sub.stripe_customer_id IS NOT NULL
        AND v_sub.stripe_customer_id <> p_customer)
     OR (p_kind <> 'pix_paid' AND p_subscription IS NOT NULL
        AND v_sub.stripe_subscription_id IS NOT NULL
        AND v_sub.stripe_subscription_id <> p_subscription
        AND v_sub.card_status IN ('active', 'past_due')) THEN
    RAISE EXCEPTION 'Billing owner mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_kind = 'pix_paid' THEN
    v_from := greatest(now(), coalesce(v_sub.paid_until, now()));
    UPDATE luminix.clinic_subscriptions
       SET plan = p_plan, payment_method = 'pix',
           paid_until = v_from + CASE WHEN p_plan = 'annual' THEN interval '1 year'
                                      ELSE interval '1 month' END,
           stripe_customer_id = coalesce(stripe_customer_id, p_customer), updated_at = now()
     WHERE clinic_id = p_clinic;
  ELSIF p_kind = 'card_period' THEN
    UPDATE luminix.clinic_subscriptions
       SET plan = coalesce(p_plan, plan), payment_method = 'card', card_status = p_card_status,
           -- Only "active" moves the paid date; a failed renewal keeps the last paid period.
           paid_until = CASE WHEN p_card_status = 'active' AND p_period_end IS NOT NULL
                             THEN greatest(coalesce(paid_until, p_period_end), p_period_end)
                             ELSE paid_until END,
           cancel_at_period_end = coalesce(p_cancel_at_end, false),
           stripe_customer_id = coalesce(stripe_customer_id, p_customer),
           stripe_subscription_id = coalesce(p_subscription, stripe_subscription_id),
           updated_at = now()
     WHERE clinic_id = p_clinic;
  ELSE
    UPDATE luminix.clinic_subscriptions
       SET card_status = 'canceled', cancel_at_period_end = false, updated_at = now()
     WHERE clinic_id = p_clinic;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION luminix.apply_billing_event(text, text, uuid, text, text, text,
  timestamptz, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.apply_billing_event(text, text, uuid, text, text, text,
  timestamptz, boolean, text, text) TO luminix_api;
