-- Link de confirmação (ADR-038): cancelar pelo link e logo do espaço na página.
--
-- "Cancelar" segue as mesmas regras do cancelamento pela área do cliente (0063): o espaço precisa
-- permitir e o prazo mínimo antes do horário precisa estar aberto; um sinal Pix ainda não pago
-- pode sempre ser desistido. A leitura passa a dizer se dá para cancelar e até quando, e traz a
-- chave do logo do espaço (a API transforma em URL pública).

ALTER TABLE luminix.appointment_links DROP CONSTRAINT appointment_links_answer_check;
ALTER TABLE luminix.appointment_links ADD CONSTRAINT appointment_links_answer_check
  CHECK (answer IS NULL OR answer IN ('confirmed', 'reschedule', 'not_me', 'canceled'));

-- Until when the client can still cancel this visit by herself; NULL when she cannot.
CREATE FUNCTION luminix.appointment_cancel_until(p_clinic uuid, p_appointment uuid)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_row luminix.appointments%ROWTYPE; v_policy luminix.booking_policies%ROWTYPE;
  v_until timestamptz;
BEGIN
  SELECT * INTO v_row FROM luminix.appointments WHERE clinic_id = p_clinic AND id = p_appointment;
  IF NOT FOUND OR v_row.status NOT IN ('scheduled', 'confirmed') OR v_row.starts_at <= now() THEN
    RETURN NULL;
  END IF;
  IF v_row.deposit_status IS NOT DISTINCT FROM 'awaiting' THEN RETURN v_row.starts_at; END IF;
  SELECT * INTO v_policy FROM luminix.booking_policies WHERE clinic_id = p_clinic;
  IF NOT FOUND THEN RETURN v_row.starts_at; END IF;
  IF NOT v_policy.allow_client_cancellation THEN RETURN NULL; END IF;
  v_until := v_row.starts_at - make_interval(
    mins => luminix.client_change_deadline_minutes(p_clinic, v_row.service_id));
  RETURN CASE WHEN v_until > now() THEN v_until END;
END $$;
REVOKE ALL ON FUNCTION luminix.appointment_cancel_until(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION luminix.read_appointment_link(p_hash bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_link luminix.appointment_links%ROWTYPE; v_result jsonb;
BEGIN
  IF p_hash IS NULL OR octet_length(p_hash) <> 32 THEN RETURN NULL; END IF;
  SELECT * INTO v_link FROM luminix.appointment_links WHERE token_hash = p_hash;
  IF NOT FOUND OR v_link.expires_at <= now() THEN RETURN NULL; END IF;
  IF v_link.opened_at IS NULL THEN
    UPDATE luminix.appointment_links SET opened_at = now()
     WHERE clinic_id = v_link.clinic_id AND appointment_id = v_link.appointment_id;
  END IF;
  SELECT jsonb_build_object(
      'answer', v_link.answer,
      'clinic', jsonb_build_object(
        'name', c.name,
        'slug', CASE WHEN p.public_enabled THEN c.slug END,
        'theme', st.theme,
        'logoKey', logo.large_object_key,
        'whatsapp', CASE WHEN p.public_contacts THEN p.whatsapp_phone END,
        'address', CASE WHEN p.public_address THEN nullif(concat_ws(' · ',
            nullif(concat_ws(', ', l.address_line, l.address_number), ''),
            nullif(concat_ws(' - ', l.city, l.state), '')), '') END),
      'appointment', CASE WHEN v_link.answer = 'not_me' THEN NULL ELSE jsonb_build_object(
        'firstName', split_part(btrim(cc.display_name), ' ', 1),
        'service', s.name,
        'professional', pr.display_name,
        'startsAt', a.starts_at,
        'endsAt', a.ends_at,
        'status', a.status,
        'cancelUntil', luminix.appointment_cancel_until(a.clinic_id, a.id),
        'awaitingDeposit', a.deposit_status IS NOT DISTINCT FROM 'awaiting'
          OR a.deposit_status IS NOT DISTINCT FROM 'reported') END,
      'anamnesis', CASE WHEN v_link.answer = 'not_me' THEN NULL ELSE jsonb_build_object(
        'requiredLevel', luminix.clinic_anamnesis_level(a.clinic_id),
        'record', luminix.clinic_client_anamnesis_summary(a.clinic_id, a.clinic_client_id)) END)
    INTO v_result
    FROM luminix.appointments a
    JOIN luminix.clinics c ON c.id = a.clinic_id
    JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
    JOIN luminix.clinic_clients cc ON cc.clinic_id = a.clinic_id AND cc.id = a.clinic_client_id
    LEFT JOIN luminix.professionals pr ON pr.clinic_id = a.clinic_id AND pr.id = a.professional_id
    LEFT JOIN luminix.clinic_profiles p ON p.clinic_id = a.clinic_id
    LEFT JOIN luminix.media_assets logo ON logo.clinic_id = a.clinic_id
      AND logo.id = p.logo_asset_id AND logo.status = 'ready'
    LEFT JOIN luminix.clinic_settings st ON st.clinic_id = a.clinic_id
    LEFT JOIN LATERAL (
      SELECT address_line, address_number, city, state FROM luminix.locations
       WHERE clinic_id = a.clinic_id ORDER BY is_primary DESC LIMIT 1
    ) l ON true
   WHERE a.clinic_id = v_link.clinic_id AND a.id = v_link.appointment_id;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION luminix.answer_appointment_link(p_hash bytea, p_answer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_link luminix.appointment_links%ROWTYPE; v_row luminix.appointments%ROWTYPE;
BEGIN
  IF p_answer IS NULL OR p_answer NOT IN ('confirmed', 'reschedule', 'not_me', 'canceled') THEN
    RAISE EXCEPTION 'Invalid answer' USING ERRCODE = '22023';
  END IF;
  IF p_hash IS NULL OR octet_length(p_hash) <> 32 THEN
    RAISE EXCEPTION 'Link not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_link FROM luminix.appointment_links WHERE token_hash = p_hash FOR UPDATE;
  IF NOT FOUND OR v_link.expires_at <= now() OR v_link.answer IN ('not_me', 'canceled') THEN
    RAISE EXCEPTION 'Link not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_row FROM luminix.appointments
   WHERE clinic_id = v_link.clinic_id AND id = v_link.appointment_id FOR UPDATE;
  IF p_answer <> 'not_me' AND (v_row.status NOT IN ('scheduled', 'confirmed') OR v_row.starts_at <= now()) THEN
    RAISE EXCEPTION 'Appointment closed' USING ERRCODE = '55000';
  END IF;
  IF p_answer = 'canceled' THEN
    IF luminix.appointment_cancel_until(v_row.clinic_id, v_row.id) IS NULL THEN
      RAISE EXCEPTION 'Cancellation closed' USING ERRCODE = 'P0001';
    END IF;
    UPDATE luminix.appointments
       SET status = 'canceled', status_note = 'Cancelado pela cliente pelo link de confirmação',
           updated_at = now()
     WHERE clinic_id = v_row.clinic_id AND id = v_row.id;
  END IF;
  IF p_answer = 'confirmed' AND v_row.status = 'scheduled'
     AND v_row.deposit_status IS NULL THEN
    UPDATE luminix.appointments SET status = 'confirmed', updated_at = now()
     WHERE clinic_id = v_row.clinic_id AND id = v_row.id;
  END IF;
  UPDATE luminix.appointment_links
     SET answer = p_answer, answered_at = now(),
         expires_at = CASE WHEN p_answer = 'not_me' THEN now() ELSE expires_at END
   WHERE clinic_id = v_link.clinic_id AND appointment_id = v_link.appointment_id;
  RETURN jsonb_build_object('answer', p_answer);
END $$;
