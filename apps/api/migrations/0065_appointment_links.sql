-- Link de confirmação por agendamento (ADR-038), sem login.
--
-- A equipe gera um link para um horário e manda por e-mail ou cola no WhatsApp. Quem abre vê só o
-- essencial do horário (primeiro nome, serviço, data, profissional e o contato que o espaço
-- publica) e responde: confirmar, pedir para remarcar ou "não sou eu". O link é um segredo de 32
-- bytes; o banco guarda só o SHA-256. Um link por agendamento: gerar de novo troca o anterior.
-- Nada aqui vincula a pessoa a uma conta Luminix (ADR-027): o link prova só que alguém recebeu a
-- mensagem, não quem é.

CREATE TABLE luminix.appointment_links (
  clinic_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  token_hash bytea NOT NULL CHECK (octet_length(token_hash) = 32),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  answer text CHECK (answer IS NULL OR answer IN ('confirmed', 'reschedule', 'not_me')),
  answered_at timestamptz,
  CONSTRAINT appointment_links_answer_complete CHECK ((answer IS NULL) = (answered_at IS NULL)),
  PRIMARY KEY (clinic_id, appointment_id),
  FOREIGN KEY (clinic_id, appointment_id) REFERENCES luminix.appointments(clinic_id, id)
);
CREATE UNIQUE INDEX appointment_links_token ON luminix.appointment_links (token_hash);

REVOKE ALL ON luminix.appointment_links FROM PUBLIC, luminix_api;
-- The agenda reads the answer inside the clinic transaction; writes only through the functions.
GRANT SELECT ON luminix.appointment_links TO luminix_api;
ALTER TABLE luminix.appointment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.appointment_links FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.appointment_links
  USING (clinic_id = luminix.current_clinic_id()) WITH CHECK (clinic_id = luminix.current_clinic_id());
CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.appointment_links
  FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.appointment_links
  FOR EACH ROW EXECUTE FUNCTION luminix.audit_change();

-- The team issues (or replaces) the link of an upcoming visit. Returns when it stops working.
CREATE FUNCTION luminix.staff_issue_appointment_link(p_clinic uuid, p_appointment uuid, p_hash bytea)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_row luminix.appointments%ROWTYPE; v_expires timestamptz;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR octet_length(p_hash) <> 32 THEN
    RAISE EXCEPTION 'Invalid link' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'agenda:manage');
  SELECT * INTO v_row FROM luminix.appointments
   WHERE clinic_id = p_clinic AND id = p_appointment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status NOT IN ('scheduled', 'confirmed') OR v_row.starts_at <= now() THEN
    RAISE EXCEPTION 'Appointment closed' USING ERRCODE = '55000';
  END IF;
  -- Works until the visit ends: after that there is nothing left to confirm.
  v_expires := v_row.ends_at;
  INSERT INTO luminix.appointment_links (clinic_id, appointment_id, token_hash, expires_at)
    VALUES (p_clinic, p_appointment, p_hash, v_expires)
  ON CONFLICT (clinic_id, appointment_id) DO UPDATE
    SET token_hash = excluded.token_hash, expires_at = excluded.expires_at, created_at = now(),
        opened_at = NULL, answer = NULL, answered_at = NULL;
  RETURN v_expires;
END $$;
REVOKE ALL ON FUNCTION luminix.staff_issue_appointment_link(uuid, uuid, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.staff_issue_appointment_link(uuid, uuid, bytea) TO luminix_api;

-- What the person who opens the link sees. NULL when the link does not exist or ran out.
-- After "não sou eu" only the space's name is shown: the details may belong to someone else.
CREATE FUNCTION luminix.read_appointment_link(p_hash bytea)
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
    LEFT JOIN luminix.clinic_settings st ON st.clinic_id = a.clinic_id
    LEFT JOIN LATERAL (
      SELECT address_line, address_number, city, state FROM luminix.locations
       WHERE clinic_id = a.clinic_id ORDER BY is_primary DESC LIMIT 1
    ) l ON true
   WHERE a.clinic_id = v_link.clinic_id AND a.id = v_link.appointment_id;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION luminix.read_appointment_link(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.read_appointment_link(bytea) TO luminix_api;

-- The answer. "Confirmar" turns a visit "a confirmar" into confirmed, except while a Pix deposit
-- is still pending (the team confirms that one). "Remarcar" only tells the team. "Não sou eu"
-- closes the link so the details stop showing.
CREATE FUNCTION luminix.answer_appointment_link(p_hash bytea, p_answer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_link luminix.appointment_links%ROWTYPE; v_row luminix.appointments%ROWTYPE;
BEGIN
  IF p_answer IS NULL OR p_answer NOT IN ('confirmed', 'reschedule', 'not_me') THEN
    RAISE EXCEPTION 'Invalid answer' USING ERRCODE = '22023';
  END IF;
  IF p_hash IS NULL OR octet_length(p_hash) <> 32 THEN
    RAISE EXCEPTION 'Link not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_link FROM luminix.appointment_links WHERE token_hash = p_hash FOR UPDATE;
  IF NOT FOUND OR v_link.expires_at <= now() OR v_link.answer = 'not_me' THEN
    RAISE EXCEPTION 'Link not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_row FROM luminix.appointments
   WHERE clinic_id = v_link.clinic_id AND id = v_link.appointment_id FOR UPDATE;
  IF p_answer <> 'not_me' AND (v_row.status NOT IN ('scheduled', 'confirmed') OR v_row.starts_at <= now()) THEN
    RAISE EXCEPTION 'Appointment closed' USING ERRCODE = '55000';
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
REVOKE ALL ON FUNCTION luminix.answer_appointment_link(bytea, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.answer_appointment_link(bytea, text) TO luminix_api;
