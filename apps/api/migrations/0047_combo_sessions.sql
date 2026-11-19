-- Combo = todos os tratamentos juntos em cada sessão (ex.: 5 sessões de "limpeza + massagem",
-- cada visita faz os dois). O pacote guarda quantas sessões (sessions) e a duração da visita
-- (duration_minutes), que o agendamento usa no lugar da duração de um serviço só. "sessions"
-- continua como antes: N sessões de um serviço.

ALTER TABLE luminix.service_packages
  DROP CONSTRAINT service_packages_sessions_check,
  ADD CONSTRAINT service_packages_sessions_check CHECK (
    sessions BETWEEN 1 AND 100 AND (kind = 'combo' OR sessions >= 2)),
  ADD COLUMN duration_minutes smallint CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 1440);

ALTER TABLE luminix.client_packages
  ADD COLUMN kind text NOT NULL DEFAULT 'sessions' CHECK (kind IN ('sessions', 'combo')),
  ADD COLUMN duration_minutes smallint CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 1440);

-- Combos saved with 0046 counted sessions per service: each visit now does every service.
UPDATE luminix.service_packages p SET sessions = x.n
  FROM (SELECT clinic_id, package_id, max(sessions) AS n FROM luminix.service_package_items
         GROUP BY clinic_id, package_id) x
 WHERE p.kind = 'combo' AND x.clinic_id = p.clinic_id AND x.package_id = p.id;
UPDATE luminix.service_package_items i SET sessions = p.sessions
  FROM luminix.service_packages p
 WHERE p.kind = 'combo' AND p.clinic_id = i.clinic_id AND p.id = i.package_id;
UPDATE luminix.client_packages c SET kind = p.kind, duration_minutes = p.duration_minutes,
    sessions_total = CASE WHEN p.kind = 'combo' THEN p.sessions ELSE c.sessions_total END
  FROM luminix.service_packages p
 WHERE p.clinic_id = c.clinic_id AND p.id = c.package_id;

-- p_package: {id, name, priceCents, validityDays, kind, items: [{serviceId, sessions}],
-- sessions?, durationMinutes?}. Combo: every item gets the package's sessions.
CREATE OR REPLACE FUNCTION luminix.save_service_package(p_clinic uuid, p_package jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_id uuid := nullif(p_package->>'id', '')::uuid; v_items jsonb; v_item jsonb;
  v_total integer := 0; v_first uuid; v_position integer := 0; v_kind text; v_sessions integer;
  v_duration integer;
BEGIN
  v_items := CASE WHEN jsonb_typeof(p_package->'items') = 'array' THEN p_package->'items'
    ELSE jsonb_build_array(jsonb_build_object('serviceId', p_package->>'serviceId',
      'sessions', p_package->>'sessions')) END;
  v_kind := coalesce(p_package->>'kind', CASE WHEN jsonb_array_length(v_items) > 1 THEN 'combo' ELSE 'sessions' END);
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR jsonb_typeof(p_package) IS DISTINCT FROM 'object'
    OR v_kind NOT IN ('sessions', 'combo')
    OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 20
    OR (v_kind = 'sessions' AND jsonb_array_length(v_items) <> 1)
    OR (v_kind = 'combo' AND jsonb_array_length(v_items) < 2)
    OR coalesce(p_package->>'priceCents', '') !~ '^[0-9]{1,9}$'
    OR (nullif(p_package->>'validityDays', '') IS NOT NULL
      AND p_package->>'validityDays' !~ '^[0-9]{1,4}$')
    OR (nullif(p_package->>'durationMinutes', '') IS NOT NULL
      AND p_package->>'durationMinutes' !~ '^[0-9]{1,4}$')
    OR (v_kind = 'combo' AND coalesce(p_package->>'sessions', '') !~ '^[0-9]{1,3}$') THEN
    RAISE EXCEPTION 'Invalid package' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  v_sessions := CASE WHEN v_kind = 'combo' THEN (p_package->>'sessions')::integer END;
  v_duration := CASE WHEN v_kind = 'combo' THEN nullif(p_package->>'durationMinutes', '')::integer END;
  IF v_kind = 'combo' AND (v_sessions NOT BETWEEN 1 AND 100 OR v_duration IS NULL
    OR v_duration NOT BETWEEN 5 AND 1440) THEN
    RAISE EXCEPTION 'Invalid package' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    IF coalesce(v_item->>'serviceId', '') !~* '^[0-9a-f-]{36}$'
      OR (v_kind = 'sessions' AND (coalesce(v_item->>'sessions', '') !~ '^[0-9]{1,3}$'
        OR (v_item->>'sessions')::integer NOT BETWEEN 2 AND 100)) THEN
      RAISE EXCEPTION 'Invalid package item' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM luminix.services
      WHERE clinic_id = p_clinic AND id = (v_item->>'serviceId')::uuid AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid package service' USING ERRCODE = '22023'; END IF;
    v_total := v_total + coalesce(v_sessions, (v_item->>'sessions')::integer);
    v_first := coalesce(v_first, (v_item->>'serviceId')::uuid);
  END LOOP;
  IF (SELECT count(DISTINCT value->>'serviceId') FROM jsonb_array_elements(v_items)) <> jsonb_array_length(v_items) THEN
    RAISE EXCEPTION 'Invalid package' USING ERRCODE = '22023';
  END IF;
  INSERT INTO luminix.service_packages
      (id, clinic_id, service_id, name, sessions, price_cents, validity_days, kind, duration_minutes)
    VALUES (coalesce(v_id, gen_random_uuid()), p_clinic, v_first, btrim(p_package->>'name'),
      coalesce(v_sessions, v_total), (p_package->>'priceCents')::integer,
      nullif(p_package->>'validityDays', '')::smallint, v_kind, v_duration)
    ON CONFLICT (id) DO UPDATE SET service_id = EXCLUDED.service_id, name = EXCLUDED.name,
      sessions = EXCLUDED.sessions, price_cents = EXCLUDED.price_cents,
      validity_days = EXCLUDED.validity_days, kind = EXCLUDED.kind,
      duration_minutes = EXCLUDED.duration_minutes, updated_at = now()
      WHERE luminix.service_packages.clinic_id = p_clinic
    RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid package' USING ERRCODE = '22023'; END IF;
  DELETE FROM luminix.service_package_items WHERE clinic_id = p_clinic AND package_id = v_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    INSERT INTO luminix.service_package_items (clinic_id, package_id, service_id, sessions, position)
      VALUES (p_clinic, v_id, (v_item->>'serviceId')::uuid,
        coalesce(v_sessions, (v_item->>'sessions')::integer)::smallint, v_position);
    v_position := v_position + 1;
  END LOOP;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION luminix.sell_client_package(
  p_clinic uuid, p_client uuid, p_package uuid, p_sold_on date, p_finance_entry uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_package luminix.service_packages%ROWTYPE; v_id uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_sold_on IS NULL THEN
    RAISE EXCEPTION 'Invalid sale' USING ERRCODE = '22023';
  END IF;
  SELECT membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'client:manage');
  SELECT * INTO v_package FROM luminix.service_packages
   WHERE clinic_id = p_clinic AND id = p_package AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid package' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM luminix.clinic_clients WHERE clinic_id = p_clinic AND id = p_client AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid client' USING ERRCODE = '22023'; END IF;
  IF p_finance_entry IS NOT NULL THEN
    PERFORM 1 FROM luminix.finance_entries
     WHERE clinic_id = p_clinic AND id = p_finance_entry AND kind = 'income' AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid finance entry' USING ERRCODE = '22023'; END IF;
  END IF;
  INSERT INTO luminix.client_packages (clinic_id, clinic_client_id, package_id, service_id, name,
      sessions_total, price_cents, sold_on, expires_on, finance_entry_id, created_by_membership_id,
      kind, duration_minutes)
    VALUES (p_clinic, p_client, v_package.id, v_package.service_id, v_package.name,
      v_package.sessions, v_package.price_cents, p_sold_on,
      CASE WHEN v_package.validity_days IS NULL THEN NULL
           ELSE p_sold_on + v_package.validity_days END,
      p_finance_entry, v_member, v_package.kind, v_package.duration_minutes)
    RETURNING id INTO v_id;
  INSERT INTO luminix.client_package_items (clinic_id, client_package_id, service_id, sessions, position)
    SELECT p_clinic, v_id, service_id, sessions, position FROM luminix.service_package_items
     WHERE clinic_id = p_clinic AND package_id = v_package.id;
  RETURN v_id;
END $$;

-- Sessions: per service (as 0046). Combo: any of its services opens the visit, and each visit
-- uses one session of the whole combo.
CREATE OR REPLACE FUNCTION luminix.use_client_package(p_clinic uuid, p_appointment uuid, p_package uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_package luminix.client_packages%ROWTYPE; v_appointment luminix.appointments%ROWTYPE;
  v_zone text; v_item_sessions integer;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid package' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'agenda:manage');
  SELECT * INTO v_package FROM luminix.client_packages
   WHERE clinic_id = p_clinic AND id = p_package FOR UPDATE;
  SELECT * INTO v_appointment FROM luminix.appointments
   WHERE clinic_id = p_clinic AND id = p_appointment FOR UPDATE;
  SELECT coalesce(timezone, 'America/Sao_Paulo') INTO v_zone
    FROM luminix.clinic_settings WHERE clinic_id = p_clinic;
  SELECT sessions INTO v_item_sessions FROM luminix.client_package_items
   WHERE clinic_id = p_clinic AND client_package_id = p_package
     AND service_id = v_appointment.service_id;
  IF v_package.id IS NULL OR v_appointment.id IS NULL
    OR v_package.status <> 'active'
    OR v_appointment.client_package_id IS NOT NULL
    OR v_package.clinic_client_id <> v_appointment.clinic_client_id
    OR v_item_sessions IS NULL
    OR (v_package.expires_on IS NOT NULL
      AND (v_appointment.starts_at AT TIME ZONE coalesce(v_zone, 'America/Sao_Paulo'))::date
        > v_package.expires_on)
    OR (v_package.kind = 'combo'
      AND luminix.client_package_used(p_clinic, p_package) >= v_package.sessions_total)
    OR (v_package.kind <> 'combo'
      AND luminix.client_package_used_for(p_clinic, p_package, v_appointment.service_id) >= v_item_sessions) THEN
    RAISE EXCEPTION 'Package unavailable' USING ERRCODE = '55000';
  END IF;
  UPDATE luminix.appointments SET client_package_id = p_package, price_cents = 0,
      updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment;
END $$;
