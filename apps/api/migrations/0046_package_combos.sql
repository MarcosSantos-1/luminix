-- Pacotes em combo: um pacote pode juntar vários serviços (ex.: 3 limpezas de pele + 2
-- massagens) ou ser N sessões de um só serviço, como antes. Os itens ficam em
-- service_package_items; a venda copia os itens para client_package_items, para que mudanças
-- no catálogo não alterem o que a cliente comprou. service_id/sessions de service_packages e
-- client_packages continuam preenchidos (primeiro serviço e total de sessões), para leitura
-- simples e compatibilidade.

ALTER TABLE luminix.service_packages
  ADD COLUMN kind text NOT NULL DEFAULT 'sessions' CHECK (kind IN ('sessions', 'combo'));

CREATE TABLE luminix.service_package_items (
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  package_id uuid NOT NULL,
  service_id uuid NOT NULL,
  sessions smallint NOT NULL CHECK (sessions BETWEEN 1 AND 100),
  position smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (clinic_id, package_id, service_id),
  FOREIGN KEY (clinic_id, package_id) REFERENCES luminix.service_packages(clinic_id, id),
  FOREIGN KEY (clinic_id, service_id) REFERENCES luminix.services(clinic_id, id)
);

CREATE TABLE luminix.client_package_items (
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  client_package_id uuid NOT NULL,
  service_id uuid NOT NULL,
  sessions smallint NOT NULL CHECK (sessions BETWEEN 1 AND 100),
  position smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (clinic_id, client_package_id, service_id),
  FOREIGN KEY (clinic_id, client_package_id) REFERENCES luminix.client_packages(clinic_id, id),
  FOREIGN KEY (clinic_id, service_id) REFERENCES luminix.services(clinic_id, id)
);

INSERT INTO luminix.service_package_items (clinic_id, package_id, service_id, sessions)
  SELECT clinic_id, id, service_id, sessions FROM luminix.service_packages;
INSERT INTO luminix.client_package_items (clinic_id, client_package_id, service_id, sessions)
  SELECT clinic_id, id, service_id, sessions_total FROM luminix.client_packages;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['service_package_items', 'client_package_items'] LOOP
    EXECUTE format('ALTER TABLE luminix.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE luminix.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY clinic_scope ON luminix.%I USING (clinic_id = luminix.current_clinic_id()) WITH CHECK (clinic_id = luminix.current_clinic_id())', table_name);
    EXECUTE format('CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.%I FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move()', table_name);
    EXECUTE format('CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.%I FOR EACH ROW EXECUTE FUNCTION luminix.audit_change()', table_name);
  END LOOP;
END $$;
GRANT SELECT ON luminix.service_package_items, luminix.client_package_items TO luminix_api;

-- Sessions of one service taken from a sold package.
CREATE FUNCTION luminix.client_package_used_for(p_clinic uuid, p_package uuid, p_service uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT count(*)::integer FROM luminix.appointments
   WHERE clinic_id = p_clinic AND client_package_id = p_package AND service_id = p_service
     AND status IN ('scheduled', 'confirmed', 'completed', 'no_show')
$$;

-- p_package: {id, name, priceCents, validityDays, kind?, items: [{serviceId, sessions}]}. The old
-- shape ({serviceId, sessions}) is still accepted as one item.
CREATE OR REPLACE FUNCTION luminix.save_service_package(p_clinic uuid, p_package jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_id uuid := nullif(p_package->>'id', '')::uuid; v_items jsonb; v_item jsonb;
  v_total integer := 0; v_first uuid; v_position integer := 0; v_kind text;
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
    OR coalesce(p_package->>'priceCents', '') !~ '^[0-9]{1,9}$'
    OR (nullif(p_package->>'validityDays', '') IS NOT NULL
      AND p_package->>'validityDays' !~ '^[0-9]{1,4}$') THEN
    RAISE EXCEPTION 'Invalid package' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    IF coalesce(v_item->>'serviceId', '') !~* '^[0-9a-f-]{36}$'
      OR coalesce(v_item->>'sessions', '') !~ '^[0-9]{1,3}$'
      OR (v_item->>'sessions')::integer NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'Invalid package item' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM luminix.services
      WHERE clinic_id = p_clinic AND id = (v_item->>'serviceId')::uuid AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid package service' USING ERRCODE = '22023'; END IF;
    v_total := v_total + (v_item->>'sessions')::integer;
    v_first := coalesce(v_first, (v_item->>'serviceId')::uuid);
  END LOOP;
  IF v_total NOT BETWEEN 2 AND 100
    OR (SELECT count(DISTINCT value->>'serviceId') FROM jsonb_array_elements(v_items)) <> jsonb_array_length(v_items) THEN
    RAISE EXCEPTION 'Invalid package' USING ERRCODE = '22023';
  END IF;
  INSERT INTO luminix.service_packages
      (id, clinic_id, service_id, name, sessions, price_cents, validity_days, kind)
    VALUES (coalesce(v_id, gen_random_uuid()), p_clinic, v_first, btrim(p_package->>'name'),
      v_total, (p_package->>'priceCents')::integer,
      nullif(p_package->>'validityDays', '')::smallint, v_kind)
    ON CONFLICT (id) DO UPDATE SET service_id = EXCLUDED.service_id, name = EXCLUDED.name,
      sessions = EXCLUDED.sessions, price_cents = EXCLUDED.price_cents,
      validity_days = EXCLUDED.validity_days, kind = EXCLUDED.kind, updated_at = now()
      WHERE luminix.service_packages.clinic_id = p_clinic
    RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid package' USING ERRCODE = '22023'; END IF;
  DELETE FROM luminix.service_package_items WHERE clinic_id = p_clinic AND package_id = v_id;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    INSERT INTO luminix.service_package_items (clinic_id, package_id, service_id, sessions, position)
      VALUES (p_clinic, v_id, (v_item->>'serviceId')::uuid, (v_item->>'sessions')::smallint, v_position);
    v_position := v_position + 1;
  END LOOP;
  RETURN v_id;
END $$;

-- Same as 0042, plus copying the items of the package into the sale.
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
      sessions_total, price_cents, sold_on, expires_on, finance_entry_id, created_by_membership_id)
    VALUES (p_clinic, p_client, v_package.id, v_package.service_id, v_package.name,
      v_package.sessions, v_package.price_cents, p_sold_on,
      CASE WHEN v_package.validity_days IS NULL THEN NULL
           ELSE p_sold_on + v_package.validity_days END,
      p_finance_entry, v_member)
    RETURNING id INTO v_id;
  INSERT INTO luminix.client_package_items (clinic_id, client_package_id, service_id, sessions, position)
    SELECT p_clinic, v_id, service_id, sessions, position FROM luminix.service_package_items
     WHERE clinic_id = p_clinic AND package_id = v_package.id;
  RETURN v_id;
END $$;

-- Same as 0042, but the service must be one of the package items and that item needs a
-- session left (a combo is consumed service by service).
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
    OR luminix.client_package_used_for(p_clinic, p_package, v_appointment.service_id) >= v_item_sessions THEN
    RAISE EXCEPTION 'Package unavailable' USING ERRCODE = '55000';
  END IF;
  UPDATE luminix.appointments SET client_package_id = p_package, price_cents = 0,
      updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment;
END $$;
