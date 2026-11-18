-- 1. Ficha de anamnese preenchida pela equipe (ADR-032). Fica na ficha local do espaço
--    (clinic_clients.client_anamnesis), nunca na conta da cliente; uma cliente que compartilha a
--    ficha da própria conta continua dona dela.
-- 2. Pacotes: catálogo (service_packages), venda à cliente (client_packages) e o consumo de uma
--    sessão por agendamento (appointments.client_package_id). Sessão de pacote não é cobrada de
--    novo: o preço do agendamento vira 0.
-- 3. Aparelhos alugados: datas de aluguel (resource_rentals) com custo opcional lançado no
--    Financeiro. Serviços ligados a um aparelho alugado só têm horário para clientes nesses dias.

-- ---------- 1. Anamnese pela equipe ----------
ALTER TABLE luminix.clinic_clients
  ADD COLUMN anamnesis_filled_by text
    CHECK (anamnesis_filled_by IS NULL OR anamnesis_filled_by IN ('client', 'staff'));

CREATE FUNCTION luminix.staff_save_client_anamnesis(p_clinic uuid, p_client uuid, p_record jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_sex text := luminix.anamnesis_field(p_record, 'sex');
  v_birth text := luminix.anamnesis_field(p_record, 'birthDate');
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR jsonb_typeof(p_record) IS DISTINCT FROM 'object'
    OR p_record->>'version' IS DISTINCT FROM '2'
    OR coalesce(p_record->>'level', '') NOT IN ('1', '2', '3')
    OR jsonb_typeof(p_record->'answers') IS DISTINCT FROM 'object'
    OR coalesce(v_sex, '') NOT IN ('female', 'male')
    OR coalesce(v_birth, '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Invalid anamnesis' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'client:manage');
  PERFORM 1 FROM luminix.clinic_clients WHERE clinic_id = p_clinic AND id = p_client FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE luminix.clinic_clients
     SET client_anamnesis = p_record, anamnesis_filled_by = 'staff',
         sex = v_sex, birth_date = v_birth::date, updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_client AND NOT anamnesis_shared;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client keeps own record' USING ERRCODE = '55000';
  END IF;
END $$;

-- The record the space uses: the account's when the client shares it, else the local one.
CREATE FUNCTION luminix.clinic_client_anamnesis_record(p_clinic uuid, p_client uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT CASE WHEN c.anamnesis_shared THEN p.anamnesis ELSE c.client_anamnesis END
    FROM luminix.clinic_clients c
    LEFT JOIN luminix.client_profiles p ON p.id = c.client_profile_id
   WHERE c.clinic_id = p_clinic AND c.id = p_client
     AND p_clinic = luminix.current_clinic_id()
$$;

-- Only level, date and who filled it: safe for the list (no health answers).
CREATE FUNCTION luminix.clinic_client_anamnesis_summary(p_clinic uuid, p_client uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT CASE WHEN r IS NULL THEN NULL ELSE jsonb_build_object(
      'level', r->'level', 'answeredAt', r->'answeredAt',
      'by', CASE WHEN c.anamnesis_shared THEN 'client' ELSE coalesce(c.anamnesis_filled_by, 'client') END)
    END
    FROM luminix.clinic_clients c,
         LATERAL (SELECT luminix.clinic_client_anamnesis_record(p_clinic, p_client) AS r) x
   WHERE c.clinic_id = p_clinic AND c.id = p_client
$$;

-- Health answers: only for who manages clients (authorization re-checked here).
CREATE FUNCTION luminix.staff_client_anamnesis(p_clinic uuid, p_client uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'client:manage');
  RETURN luminix.clinic_client_anamnesis_record(p_clinic, p_client);
END $$;

-- ---------- 2. Pacotes ----------
CREATE TABLE luminix.service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  service_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  sessions smallint NOT NULL CHECK (sessions BETWEEN 2 AND 100),
  price_cents integer NOT NULL CHECK (price_cents BETWEEN 1 AND 100000000),
  validity_days smallint CHECK (validity_days IS NULL OR validity_days BETWEEN 7 AND 1095),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  FOREIGN KEY (clinic_id, service_id) REFERENCES luminix.services(clinic_id, id)
);

CREATE TABLE luminix.client_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  clinic_client_id uuid NOT NULL,
  package_id uuid,
  service_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  sessions_total smallint NOT NULL CHECK (sessions_total BETWEEN 1 AND 100),
  price_cents integer NOT NULL CHECK (price_cents BETWEEN 0 AND 100000000),
  sold_on date NOT NULL,
  expires_on date CHECK (expires_on IS NULL OR expires_on >= sold_on),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled')),
  finance_entry_id uuid,
  created_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  FOREIGN KEY (clinic_id, clinic_client_id) REFERENCES luminix.clinic_clients(clinic_id, id),
  FOREIGN KEY (clinic_id, package_id) REFERENCES luminix.service_packages(clinic_id, id),
  FOREIGN KEY (clinic_id, service_id) REFERENCES luminix.services(clinic_id, id),
  FOREIGN KEY (clinic_id, finance_entry_id) REFERENCES luminix.finance_entries(clinic_id, id),
  FOREIGN KEY (clinic_id, created_by_membership_id)
    REFERENCES luminix.clinic_memberships(clinic_id, id)
);
CREATE INDEX client_packages_client ON luminix.client_packages (clinic_id, clinic_client_id, status);

ALTER TABLE luminix.appointments
  ADD COLUMN client_package_id uuid,
  ADD FOREIGN KEY (clinic_id, client_package_id) REFERENCES luminix.client_packages(clinic_id, id);
CREATE INDEX appointments_client_package ON luminix.appointments (clinic_id, client_package_id)
  WHERE client_package_id IS NOT NULL;

-- Sessions taken from a sold package: booked, done or missed (a no-show uses the session).
CREATE FUNCTION luminix.client_package_used(p_clinic uuid, p_package uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT count(*)::integer FROM luminix.appointments
   WHERE clinic_id = p_clinic AND client_package_id = p_package
     AND status IN ('scheduled', 'confirmed', 'completed', 'no_show')
$$;

CREATE FUNCTION luminix.save_service_package(p_clinic uuid, p_package jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_id uuid := nullif(p_package->>'id', '')::uuid; v_service uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR jsonb_typeof(p_package) IS DISTINCT FROM 'object'
    OR coalesce(p_package->>'serviceId', '') !~* '^[0-9a-f-]{36}$'
    OR coalesce(p_package->>'sessions', '') !~ '^[0-9]{1,3}$'
    OR coalesce(p_package->>'priceCents', '') !~ '^[0-9]{1,9}$'
    OR (nullif(p_package->>'validityDays', '') IS NOT NULL
      AND p_package->>'validityDays' !~ '^[0-9]{1,4}$') THEN
    RAISE EXCEPTION 'Invalid package' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  v_service := (p_package->>'serviceId')::uuid;
  PERFORM 1 FROM luminix.services WHERE clinic_id = p_clinic AND id = v_service AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid package service' USING ERRCODE = '22023'; END IF;
  INSERT INTO luminix.service_packages
      (id, clinic_id, service_id, name, sessions, price_cents, validity_days)
    VALUES (coalesce(v_id, gen_random_uuid()), p_clinic, v_service, btrim(p_package->>'name'),
      (p_package->>'sessions')::smallint, (p_package->>'priceCents')::integer,
      nullif(p_package->>'validityDays', '')::smallint)
    ON CONFLICT (id) DO UPDATE SET service_id = EXCLUDED.service_id, name = EXCLUDED.name,
      sessions = EXCLUDED.sessions, price_cents = EXCLUDED.price_cents,
      validity_days = EXCLUDED.validity_days, updated_at = now()
      WHERE luminix.service_packages.clinic_id = p_clinic
    RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid package' USING ERRCODE = '22023'; END IF;
  RETURN v_id;
END $$;

CREATE FUNCTION luminix.set_service_package_status(p_clinic uuid, p_package uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR p_status NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION 'Invalid package' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  UPDATE luminix.service_packages SET status = p_status, updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_package;
  IF NOT FOUND THEN RAISE EXCEPTION 'Package not found' USING ERRCODE = 'P0002'; END IF;
END $$;

-- The sale copies the package (name, sessions, price) so later catalog edits do not change it.
CREATE FUNCTION luminix.sell_client_package(
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
  RETURN v_id;
END $$;

-- Canceling keeps what was used; booked sessions stay booked (the manager decides about them).
CREATE FUNCTION luminix.cancel_client_package(p_clinic uuid, p_package uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid package' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'client:manage');
  UPDATE luminix.client_packages SET status = 'canceled'
   WHERE clinic_id = p_clinic AND id = p_package AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Package not found' USING ERRCODE = 'P0002'; END IF;
END $$;

-- Links an appointment to a session of the client's package (same client and service, active,
-- within validity on the appointment day, with a session left). The session is prepaid: 0.
CREATE FUNCTION luminix.use_client_package(p_clinic uuid, p_appointment uuid, p_package uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_package luminix.client_packages%ROWTYPE; v_appointment luminix.appointments%ROWTYPE;
  v_zone text;
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
  IF v_package.id IS NULL OR v_appointment.id IS NULL
    OR v_package.status <> 'active'
    OR v_appointment.client_package_id IS NOT NULL
    OR v_package.clinic_client_id <> v_appointment.clinic_client_id
    OR v_package.service_id <> v_appointment.service_id
    OR (v_package.expires_on IS NOT NULL
      AND (v_appointment.starts_at AT TIME ZONE coalesce(v_zone, 'America/Sao_Paulo'))::date
        > v_package.expires_on)
    OR luminix.client_package_used(p_clinic, p_package) >= v_package.sessions_total THEN
    RAISE EXCEPTION 'Package unavailable' USING ERRCODE = '55000';
  END IF;
  UPDATE luminix.appointments SET client_package_id = p_package, price_cents = 0,
      updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_appointment;
END $$;

-- ---------- 3. Aparelhos alugados ----------
ALTER TABLE luminix.resources
  ADD COLUMN supplier text CHECK (supplier IS NULL OR length(supplier) <= 120),
  ADD COLUMN default_cost_cents integer
    CHECK (default_cost_cents IS NULL OR default_cost_cents BETWEEN 1 AND 100000000),
  ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'));

CREATE TABLE luminix.resource_rentals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  resource_id uuid NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  cost_cents integer CHECK (cost_cents IS NULL OR cost_cents BETWEEN 1 AND 100000000),
  note text CHECK (note IS NULL OR length(btrim(note)) BETWEEN 1 AND 240),
  finance_entry_id uuid,
  created_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on AND ends_on - starts_on <= 62),
  UNIQUE (clinic_id, id),
  FOREIGN KEY (clinic_id, resource_id) REFERENCES luminix.resources(clinic_id, id),
  FOREIGN KEY (clinic_id, finance_entry_id) REFERENCES luminix.finance_entries(clinic_id, id),
  FOREIGN KEY (clinic_id, created_by_membership_id)
    REFERENCES luminix.clinic_memberships(clinic_id, id)
);
CREATE INDEX resource_rentals_period ON luminix.resource_rentals (clinic_id, starts_on, ends_on);

-- The equipment itself: name, supplier, usual cost and the services it serves.
CREATE FUNCTION luminix.save_rented_equipment(p_clinic uuid, p_equipment jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_id uuid := nullif(p_equipment->>'id', '')::uuid; v_service text; v_location uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR jsonb_typeof(p_equipment) IS DISTINCT FROM 'object'
    OR length(coalesce(btrim(p_equipment->>'name'), '')) NOT BETWEEN 1 AND 160
    OR length(coalesce(p_equipment->>'supplier', '')) > 120
    OR (nullif(p_equipment->>'defaultCostCents', '') IS NOT NULL
      AND p_equipment->>'defaultCostCents' !~ '^[0-9]{1,9}$')
    OR jsonb_typeof(coalesce(p_equipment->'serviceIds', '[]'::jsonb)) <> 'array'
    OR jsonb_array_length(coalesce(p_equipment->'serviceIds', '[]'::jsonb)) > 60 THEN
    RAISE EXCEPTION 'Invalid equipment' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  SELECT id INTO v_location FROM luminix.locations WHERE clinic_id = p_clinic AND is_primary LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO luminix.resources
        (clinic_id, location_id, name, type, availability_mode, supplier, default_cost_cents)
      VALUES (p_clinic, v_location, btrim(p_equipment->>'name'), 'equipment', 'manual_release',
        nullif(btrim(p_equipment->>'supplier'), ''),
        nullif(nullif(p_equipment->>'defaultCostCents', ''), '0')::integer)
      RETURNING id INTO v_id;
  ELSE
    UPDATE luminix.resources SET name = btrim(p_equipment->>'name'),
        supplier = nullif(btrim(p_equipment->>'supplier'), ''),
        default_cost_cents = nullif(nullif(p_equipment->>'defaultCostCents', ''), '0')::integer,
        status = 'active'
     WHERE clinic_id = p_clinic AND id = v_id AND type = 'equipment';
    IF NOT FOUND THEN RAISE EXCEPTION 'Equipment not found' USING ERRCODE = 'P0002'; END IF;
    DELETE FROM luminix.service_resources WHERE clinic_id = p_clinic AND resource_id = v_id;
  END IF;
  FOR v_service IN SELECT jsonb_array_elements_text(coalesce(p_equipment->'serviceIds', '[]'::jsonb)) LOOP
    PERFORM 1 FROM luminix.services WHERE clinic_id = p_clinic AND id = v_service::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid equipment service' USING ERRCODE = '22023'; END IF;
    INSERT INTO luminix.service_resources (clinic_id, service_id, resource_id)
      VALUES (p_clinic, v_service::uuid, v_id) ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN v_id;
END $$;

CREATE FUNCTION luminix.archive_rented_equipment(p_clinic uuid, p_equipment uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid equipment' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  UPDATE luminix.resources SET status = 'archived'
   WHERE clinic_id = p_clinic AND id = p_equipment AND type = 'equipment';
  IF NOT FOUND THEN RAISE EXCEPTION 'Equipment not found' USING ERRCODE = 'P0002'; END IF;
END $$;

CREATE FUNCTION luminix.save_resource_rental(
  p_clinic uuid, p_equipment uuid, p_starts date, p_ends date, p_cost integer, p_note text,
  p_finance_entry uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_id uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid rental' USING ERRCODE = '22023';
  END IF;
  SELECT membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  PERFORM 1 FROM luminix.resources
   WHERE clinic_id = p_clinic AND id = p_equipment AND type = 'equipment' AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid equipment' USING ERRCODE = '22023'; END IF;
  IF p_finance_entry IS NOT NULL THEN
    PERFORM 1 FROM luminix.finance_entries
     WHERE clinic_id = p_clinic AND id = p_finance_entry AND kind = 'expense' AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid finance entry' USING ERRCODE = '22023'; END IF;
  END IF;
  INSERT INTO luminix.resource_rentals (clinic_id, resource_id, starts_on, ends_on, cost_cents,
      note, finance_entry_id, created_by_membership_id)
    VALUES (p_clinic, p_equipment, p_starts, p_ends, p_cost, nullif(btrim(p_note), ''),
      p_finance_entry, v_member)
    RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Returns the finance entry to void (the API voids it with void_finance_entry when allowed).
CREATE FUNCTION luminix.remove_resource_rental(p_clinic uuid, p_rental uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_entry uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid rental' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  DELETE FROM luminix.resource_rentals WHERE clinic_id = p_clinic AND id = p_rental
    RETURNING finance_entry_id INTO v_entry;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rental not found' USING ERRCODE = 'P0002'; END IF;
  RETURN v_entry;
END $$;

-- A manager booking on a day without the equipment confirms it (chave mestra).
ALTER TABLE luminix.appointments DROP CONSTRAINT appointments_override_reasons_check;
ALTER TABLE luminix.appointments ADD CONSTRAINT appointments_override_reasons_check
  CHECK (override_reasons <@ ARRAY['past', 'outside_availability', 'overlap', 'closure',
    'equipment']::text[]);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['service_packages', 'client_packages', 'resource_rentals'] LOOP
    EXECUTE format('ALTER TABLE luminix.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE luminix.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY clinic_scope ON luminix.%I USING (clinic_id = luminix.current_clinic_id()) WITH CHECK (clinic_id = luminix.current_clinic_id())',
      table_name
    );
    EXECUTE format(
      'CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.%I FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move()',
      table_name
    );
    EXECUTE format(
      'CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.%I FOR EACH ROW EXECUTE FUNCTION luminix.audit_change()',
      table_name
    );
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION
  luminix.clinic_client_anamnesis_record(uuid, uuid),
  luminix.clinic_client_anamnesis_summary(uuid, uuid),
  luminix.staff_client_anamnesis(uuid, uuid),
  luminix.staff_save_client_anamnesis(uuid, uuid, jsonb),
  luminix.client_package_used(uuid, uuid),
  luminix.save_service_package(uuid, jsonb),
  luminix.set_service_package_status(uuid, uuid, text),
  luminix.sell_client_package(uuid, uuid, uuid, date, uuid),
  luminix.cancel_client_package(uuid, uuid),
  luminix.use_client_package(uuid, uuid, uuid),
  luminix.save_rented_equipment(uuid, jsonb),
  luminix.archive_rented_equipment(uuid, uuid),
  luminix.save_resource_rental(uuid, uuid, date, date, integer, text, uuid),
  luminix.remove_resource_rental(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  luminix.clinic_client_anamnesis_summary(uuid, uuid),
  luminix.staff_client_anamnesis(uuid, uuid),
  luminix.staff_save_client_anamnesis(uuid, uuid, jsonb),
  luminix.client_package_used(uuid, uuid),
  luminix.save_service_package(uuid, jsonb),
  luminix.set_service_package_status(uuid, uuid, text),
  luminix.sell_client_package(uuid, uuid, uuid, date, uuid),
  luminix.cancel_client_package(uuid, uuid),
  luminix.use_client_package(uuid, uuid, uuid),
  luminix.save_rented_equipment(uuid, jsonb),
  luminix.archive_rented_equipment(uuid, uuid),
  luminix.save_resource_rental(uuid, uuid, date, date, integer, text, uuid),
  luminix.remove_resource_rental(uuid, uuid) TO luminix_api;
GRANT SELECT ON luminix.service_packages, luminix.client_packages, luminix.resource_rentals,
  luminix.resources, luminix.service_resources TO luminix_api;
