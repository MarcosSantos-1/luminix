-- Situação da conta Stripe Connect guardada e avisos (ADR-041).
--
-- A Stripe analisa o cadastro da clínica no tempo dela. A API guarda a última situação vista
-- (pelo painel ou pelos eventos da Stripe) para: mostrar um status claro sem depender da Stripe,
-- avisar a dona por e-mail uma única vez quando houver resposta, oferecer Pix/cartão às clientes
-- só com a conta pronta e deixar o cadastro do espaço seguir enquanto a Stripe analisa.
--
-- Situação para a dona (notice_state):
--   filling      o formulário ainda tem campos pendentes (nunca envia e-mail)
--   reviewing    enviado, sem pendência, a Stripe ainda não liberou
--   approved     pronto para receber (ready = connectReady na API)
--   needs_info   a Stripe pediu algo depois de o cadastro ter sido enviado
--   restricted   a Stripe não aprovou ou restringiu a conta

ALTER TABLE luminix.stripe_connect_accounts
  ADD COLUMN status_state text CHECK (status_state IS NULL OR status_state IN
    ('not_started', 'pending', 'active', 'restricted', 'reviewing')),
  ADD COLUMN ready boolean NOT NULL DEFAULT false,
  ADD COLUMN requirements_due integer NOT NULL DEFAULT 0 CHECK (requirements_due >= 0),
  ADD COLUMN notice_state text CHECK (notice_state IS NULL OR notice_state IN
    ('filling', 'reviewing', 'approved', 'needs_info', 'restricted')),
  ADD COLUMN notified_state text CHECK (notified_state IS NULL OR notified_state IN
    ('approved', 'needs_info', 'restricted')),
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN status_checked_at timestamptz;

-- "E agora?" (próximos passos depois da aprovação) concluído pela dona.
ALTER TABLE luminix.payment_preferences ADD COLUMN guide_done_at timestamptz;

-- Records what Stripe said about an account and decides, once, whether to e-mail the owner.
-- Called by the API after reading the account on Stripe (panel or signed event); no tenant.
CREATE FUNCTION luminix.record_connect_status(
  p_account text, p_state text, p_ready boolean, p_due integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_row luminix.stripe_connect_accounts%ROWTYPE; v_notice text; v_send text;
  v_clinic luminix.clinics%ROWTYPE; v_profile luminix.clinic_profiles%ROWTYPE;
BEGIN
  IF p_account !~ '^acct_' OR p_state NOT IN ('not_started', 'pending', 'active', 'restricted', 'reviewing')
     OR p_due < 0 THEN
    RAISE EXCEPTION 'Invalid Connect status' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM luminix.stripe_connect_accounts WHERE account_id = p_account FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_notice := CASE
    WHEN p_ready THEN 'approved'
    WHEN p_state = 'restricted' AND v_row.submitted_at IS NOT NULL THEN 'restricted'
    WHEN p_due > 0 AND v_row.submitted_at IS NOT NULL THEN 'needs_info'
    WHEN p_due > 0 OR p_state = 'restricted' THEN 'filling'
    ELSE 'reviewing' END;
  -- An answer worth an e-mail, never twice for the same answer.
  v_send := CASE WHEN v_notice IN ('approved', 'needs_info', 'restricted')
                  AND v_notice IS DISTINCT FROM v_row.notified_state THEN v_notice END;
  UPDATE luminix.stripe_connect_accounts
     SET status_state = p_state, ready = p_ready, requirements_due = p_due,
         notice_state = v_notice, status_checked_at = now(),
         submitted_at = CASE WHEN v_row.submitted_at IS NULL
                              AND v_notice IN ('reviewing', 'approved') THEN now()
                             ELSE v_row.submitted_at END,
         notified_state = coalesce(v_send,
           CASE WHEN v_notice IN ('reviewing', 'filling') THEN NULL ELSE v_row.notified_state END)
   WHERE clinic_id = v_row.clinic_id AND platform_account_id = v_row.platform_account_id
     AND livemode = v_row.livemode;
  IF v_send IS NULL THEN
    RETURN jsonb_build_object('clinicId', v_row.clinic_id, 'notice', v_notice, 'send', NULL);
  END IF;
  SELECT * INTO v_clinic FROM luminix.clinics WHERE id = v_row.clinic_id;
  SELECT * INTO v_profile FROM luminix.clinic_profiles WHERE clinic_id = v_row.clinic_id;
  RETURN jsonb_build_object(
    'clinicId', v_row.clinic_id, 'notice', v_notice, 'send', v_send,
    'clinicName', v_clinic.name, 'clinicRef', coalesce(v_clinic.share_code, v_clinic.id::text),
    'ownerName', v_profile.owner_name, 'ownerEmail', v_profile.contact_email);
END $$;
REVOKE ALL ON FUNCTION luminix.record_connect_status(text, text, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.record_connect_status(text, text, boolean, integer) TO luminix_api;

-- Pix/card offered to clients only with the switch on AND the account last seen ready.
CREATE FUNCTION luminix.clinic_online_ready(p_clinic uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce((
    SELECT p.accept_in_app AND EXISTS (
      SELECT 1 FROM luminix.stripe_connect_accounts a
       WHERE a.clinic_id = p.clinic_id AND a.account_id IS NOT NULL AND a.ready)
      FROM luminix.payment_preferences p WHERE p.clinic_id = p_clinic), false)
$$;
REVOKE ALL ON FUNCTION luminix.clinic_online_ready(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.clinic_online_ready(uuid) TO luminix_api;

-- The owner turns "clientes pagam pelo app" on or off (settings:manage). Turning it on asks for a
-- connected account that was sent to Stripe; clients only see it once the account is ready.
CREATE FUNCTION luminix.set_in_app_payments(p_clinic uuid, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  IF p_enabled AND NOT EXISTS (
    SELECT 1 FROM luminix.stripe_connect_accounts
     WHERE clinic_id = p_clinic AND account_id IS NOT NULL AND submitted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Connect account not submitted' USING ERRCODE = '55000';
  END IF;
  INSERT INTO luminix.payment_preferences (clinic_id, accept_in_app, provider)
    VALUES (p_clinic, p_enabled, CASE WHEN p_enabled THEN 'stripe_connect' END)
  ON CONFLICT (clinic_id) DO UPDATE
    SET accept_in_app = excluded.accept_in_app,
        provider = CASE WHEN excluded.accept_in_app THEN 'stripe_connect'
                        ELSE luminix.payment_preferences.provider END,
        updated_at = now();
END $$;
REVOKE ALL ON FUNCTION luminix.set_in_app_payments(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_in_app_payments(uuid, boolean) TO luminix_api;

CREATE FUNCTION luminix.finish_payments_guide(p_clinic uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  UPDATE luminix.payment_preferences SET guide_done_at = coalesce(guide_done_at, now())
   WHERE clinic_id = p_clinic;
END $$;
REVOKE ALL ON FUNCTION luminix.finish_payments_guide(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.finish_payments_guide(uuid) TO luminix_api;
