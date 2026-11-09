-- Real data for the remaining admin sections: service catalog editing, percent promotions,
-- appointment price snapshots and status, a simple finance ledger, inventory and activity.
-- Additive except: create_manager_appointment now authorizes agenda:manage (fixes reception booking
-- after 0025), and the public projection exposes active promotions per service.

-- 1. Permissions -----------------------------------------------------------------------------

INSERT INTO luminix.permissions (code, description) VALUES
  ('finance:manage', 'Lançar e consultar o financeiro e relatórios'),
  ('inventory:manage', 'Gerenciar estoque')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION luminix.role_preset_permissions(p_role text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN ARRAY['clinic:manage', 'team:manage', 'client:read', 'client:manage',
      'professional:manage', 'service:manage', 'settings:manage', 'onboarding:manage',
      'audit:read', 'agenda:read', 'agenda:manage', 'media:read', 'media:manage',
      'finance:manage', 'inventory:manage']
    WHEN 'manager' THEN ARRAY['clinic:manage', 'team:manage', 'client:read', 'client:manage',
      'professional:manage', 'service:manage', 'settings:manage', 'audit:read',
      'agenda:read', 'agenda:manage', 'media:read', 'media:manage', 'finance:manage',
      'inventory:manage']
    WHEN 'reception' THEN ARRAY['client:read', 'client:manage', 'agenda:read', 'agenda:manage',
      'media:read', 'inventory:manage']
    WHEN 'professional' THEN ARRAY['client:read', 'agenda:read', 'media:read', 'media:manage']
  END
$$;

ALTER TABLE luminix.roles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE luminix.role_permissions NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT clinic_id FROM luminix.clinic_settings LOOP
    PERFORM luminix.ensure_clinic_roles(r.clinic_id);
  END LOOP;
END $$;
ALTER TABLE luminix.role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE luminix.roles FORCE ROW LEVEL SECURITY;

-- 2. New tables ------------------------------------------------------------------------------

CREATE TABLE luminix.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  percent integer NOT NULL CHECK (percent BETWEEN 1 AND 90),
  starts_on date NOT NULL,
  ends_on date CHECK (ends_on IS NULL OR ends_on >= starts_on),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  show_on_site boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id)
);
CREATE TABLE luminix.promotion_services (
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  promotion_id uuid NOT NULL,
  service_id uuid NOT NULL,
  PRIMARY KEY (clinic_id, promotion_id, service_id),
  FOREIGN KEY (clinic_id, promotion_id) REFERENCES luminix.promotions(clinic_id, id),
  FOREIGN KEY (clinic_id, service_id) REFERENCES luminix.services(clinic_id, id)
);

CREATE TABLE luminix.finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  kind text NOT NULL CHECK (kind IN ('income', 'expense')),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 1 AND 100000000),
  occurred_on date NOT NULL,
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 160),
  category text CHECK (category IS NULL OR length(category) <= 60),
  method text CHECK (method IS NULL OR method IN ('pix', 'cash', 'credit', 'debit', 'transfer', 'other')),
  appointment_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
  created_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  FOREIGN KEY (clinic_id, appointment_id) REFERENCES luminix.appointments(clinic_id, id),
  FOREIGN KEY (clinic_id, created_by_membership_id) REFERENCES luminix.clinic_memberships(clinic_id, id)
);
-- One active income per appointment, so "lançar" can never double-count.
CREATE UNIQUE INDEX finance_entries_appointment ON luminix.finance_entries(clinic_id, appointment_id)
  WHERE appointment_id IS NOT NULL AND status = 'active';
CREATE INDEX finance_entries_timeline ON luminix.finance_entries(clinic_id, occurred_on DESC, id);

CREATE TABLE luminix.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  category text CHECK (category IS NULL OR length(category) <= 60),
  unit text NOT NULL DEFAULT 'un' CHECK (unit IN ('un', 'ml', 'l', 'g', 'kg', 'cx', 'fr', 'par')),
  quantity numeric(12, 2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_quantity numeric(12, 2) NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  cost_cents integer CHECK (cost_cents IS NULL OR cost_cents BETWEEN 0 AND 100000000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id)
);
CREATE UNIQUE INDEX inventory_items_name ON luminix.inventory_items(clinic_id, lower(btrim(name)))
  WHERE status = 'active';
CREATE TABLE luminix.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  item_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('in', 'out', 'adjust')),
  quantity numeric(12, 2) NOT NULL CHECK (quantity >= 0),
  balance numeric(12, 2) NOT NULL CHECK (balance >= 0),
  note text CHECK (note IS NULL OR length(note) <= 160),
  created_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  FOREIGN KEY (clinic_id, item_id) REFERENCES luminix.inventory_items(clinic_id, id),
  FOREIGN KEY (clinic_id, created_by_membership_id) REFERENCES luminix.clinic_memberships(clinic_id, id)
);
CREATE INDEX inventory_movements_item ON luminix.inventory_movements(clinic_id, item_id, created_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['promotions', 'promotion_services', 'finance_entries',
    'inventory_items', 'inventory_movements'] LOOP
    EXECUTE format('ALTER TABLE luminix.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE luminix.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY clinic_scope ON luminix.%I USING (clinic_id = luminix.current_clinic_id()) WITH CHECK (clinic_id = luminix.current_clinic_id())', table_name);
    EXECUTE format('CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.%I FOR EACH ROW EXECUTE FUNCTION luminix.audit_change()', table_name);
    EXECUTE format('CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.%I FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move()', table_name);
  END LOOP;
END $$;
REVOKE ALL ON luminix.promotions, luminix.promotion_services, luminix.finance_entries,
  luminix.inventory_items, luminix.inventory_movements FROM PUBLIC;
GRANT SELECT ON luminix.promotions, luminix.promotion_services, luminix.finance_entries,
  luminix.inventory_items, luminix.inventory_movements TO luminix_api;

-- 3. Promotions and effective prices -----------------------------------------------------------

-- Best active promotion for a service on a date. Quote-priced services are never discounted.
CREATE FUNCTION luminix.service_promotion(p_clinic uuid, p_service uuid, p_on date)
RETURNS TABLE (promotion_id uuid, percent integer, ends_on date, show_on_site boolean)
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT p.id, p.percent, p.ends_on, p.show_on_site
    FROM luminix.promotions p
    JOIN luminix.promotion_services ps ON ps.clinic_id = p.clinic_id AND ps.promotion_id = p.id
    JOIN luminix.services s ON s.clinic_id = p.clinic_id AND s.id = ps.service_id
   WHERE p.clinic_id = p_clinic AND ps.service_id = p_service AND p.status = 'active'
     AND s.price_type <> 'quote' AND p.starts_on <= p_on AND (p.ends_on IS NULL OR p.ends_on >= p_on)
   ORDER BY p.percent DESC, p.created_at
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION luminix.service_promotion(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.service_promotion(uuid, uuid, date) TO luminix_api;

CREATE FUNCTION luminix.clinic_today()
RETURNS date LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date
$$;
GRANT EXECUTE ON FUNCTION luminix.clinic_today() TO luminix_api;

CREATE FUNCTION luminix.save_promotion(p_clinic uuid, p_promotion jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_id uuid; v_service uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR jsonb_typeof(p_promotion) IS DISTINCT FROM 'object'
    OR coalesce(p_promotion->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR length(coalesce(btrim(p_promotion->>'name'), '')) NOT BETWEEN 1 AND 80
    OR coalesce(p_promotion->>'percent', '') !~ '^[0-9]{1,2}$' OR (p_promotion->>'percent')::integer NOT BETWEEN 1 AND 90
    OR coalesce(p_promotion->>'startsOn', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR (nullif(p_promotion->>'endsOn', '') IS NOT NULL AND (p_promotion->>'endsOn') < (p_promotion->>'startsOn'))
    OR coalesce(p_promotion->>'status', '') NOT IN ('active', 'paused', 'archived')
    OR jsonb_typeof(p_promotion->'showOnSite') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_promotion->'serviceIds') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_promotion->'serviceIds') NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Invalid promotion' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  v_id := (p_promotion->>'id')::uuid;
  INSERT INTO luminix.promotions (id, clinic_id, name, percent, starts_on, ends_on, status, show_on_site)
    VALUES (v_id, p_clinic, btrim(p_promotion->>'name'), (p_promotion->>'percent')::integer,
      (p_promotion->>'startsOn')::date, nullif(p_promotion->>'endsOn', '')::date,
      p_promotion->>'status', (p_promotion->>'showOnSite')::boolean)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, percent = EXCLUDED.percent,
      starts_on = EXCLUDED.starts_on, ends_on = EXCLUDED.ends_on, status = EXCLUDED.status,
      show_on_site = EXCLUDED.show_on_site, updated_at = now()
    WHERE luminix.promotions.clinic_id = p_clinic;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid promotion' USING ERRCODE = '22023'; END IF;
  DELETE FROM luminix.promotion_services WHERE clinic_id = p_clinic AND promotion_id = v_id;
  FOR v_service IN SELECT (value #>> '{}')::uuid FROM jsonb_array_elements(p_promotion->'serviceIds') LOOP
    PERFORM 1 FROM luminix.services WHERE clinic_id = p_clinic AND id = v_service AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid promotion service' USING ERRCODE = '22023'; END IF;
    INSERT INTO luminix.promotion_services (clinic_id, promotion_id, service_id)
      VALUES (p_clinic, v_id, v_service) ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION luminix.save_promotion(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.save_promotion(uuid, jsonb) TO luminix_api;

-- 4. Service catalog editing --------------------------------------------------------------------

CREATE FUNCTION luminix.save_service(p_clinic uuid, p_service jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_id uuid; v_name text := btrim(p_service->>'name');
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR jsonb_typeof(p_service) IS DISTINCT FROM 'object'
    OR coalesce(p_service->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR length(coalesce(v_name, '')) NOT BETWEEN 1 AND 160
    OR length(coalesce(btrim(p_service->>'category'), '')) NOT BETWEEN 1 AND 120
    OR length(coalesce(p_service->>'description', '')) > 1200
    OR coalesce(p_service->>'priceCents', '') !~ '^[0-9]{1,9}$'
    OR coalesce(p_service->>'durationMinutes', '') !~ '^[0-9]{1,4}$'
    OR (p_service->>'durationMinutes')::integer NOT BETWEEN 5 AND 1440
    OR coalesce(p_service->>'priceType', '') NOT IN ('fixed', 'from', 'quote')
    OR coalesce(p_service->>'bookingMode', '') NOT IN ('instant', 'request', 'manual_release')
    OR coalesce(p_service->>'audience', '') NOT IN ('all', 'women', 'men')
    OR jsonb_typeof(p_service->'sensitive') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Invalid service' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  IF NOT EXISTS (SELECT 1 FROM luminix.clinics WHERE id = p_clinic AND status = 'active') THEN
    RAISE EXCEPTION 'Complete onboarding first' USING ERRCODE = '22023';
  END IF;
  v_id := (p_service->>'id')::uuid;
  IF EXISTS (SELECT 1 FROM luminix.services WHERE clinic_id = p_clinic AND status = 'active'
      AND id <> v_id AND lower(name) = lower(v_name)) THEN
    RAISE EXCEPTION 'Service name in use' USING ERRCODE = '23505';
  END IF;
  INSERT INTO luminix.services (id, clinic_id, name, category, description, price_cents,
      duration_minutes, price_type, booking_mode, audience, is_sensitive, status)
    VALUES (v_id, p_clinic, v_name, btrim(p_service->>'category'),
      nullif(btrim(p_service->>'description'), ''), (p_service->>'priceCents')::integer,
      (p_service->>'durationMinutes')::integer, p_service->>'priceType', p_service->>'bookingMode',
      p_service->>'audience', (p_service->>'sensitive')::boolean, 'active')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category,
      description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
      duration_minutes = EXCLUDED.duration_minutes, price_type = EXCLUDED.price_type,
      booking_mode = EXCLUDED.booking_mode, audience = EXCLUDED.audience,
      is_sensitive = EXCLUDED.is_sensitive
    WHERE luminix.services.clinic_id = p_clinic;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid service' USING ERRCODE = '22023'; END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION luminix.save_service(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.save_service(uuid, jsonb) TO luminix_api;

-- Pausing removes the service from the site and new bookings; history stays intact.
CREATE FUNCTION luminix.set_service_status(p_clinic uuid, p_service uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_status NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION 'Invalid service status' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  IF p_status = 'archived' AND (SELECT count(*) FROM luminix.services
      WHERE clinic_id = p_clinic AND status = 'active' AND id <> p_service) = 0 THEN
    RAISE EXCEPTION 'Keep at least one service' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'active' AND EXISTS (SELECT 1 FROM luminix.services a JOIN luminix.services b
      ON b.clinic_id = a.clinic_id AND b.id = p_service AND lower(a.name) = lower(b.name)
      WHERE a.clinic_id = p_clinic AND a.status = 'active' AND a.id <> p_service) THEN
    RAISE EXCEPTION 'Service name in use' USING ERRCODE = '23505';
  END IF;
  UPDATE luminix.services SET status = p_status WHERE clinic_id = p_clinic AND id = p_service;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service not found' USING ERRCODE = '22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.set_service_status(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_service_status(uuid, uuid, text) TO luminix_api;

-- 5. Appointments: price snapshot and status ----------------------------------------------------

ALTER TABLE luminix.appointments
  ADD COLUMN list_price_cents integer CHECK (list_price_cents IS NULL OR list_price_cents >= 0),
  ADD COLUMN price_cents integer CHECK (price_cents IS NULL OR price_cents >= 0),
  ADD COLUMN promotion_id uuid,
  ADD FOREIGN KEY (clinic_id, promotion_id) REFERENCES luminix.promotions(clinic_id, id);

-- The price agreed at booking time stays with the appointment even if the catalog changes.
CREATE FUNCTION luminix.snapshot_appointment_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_price integer; v_promo record;
BEGIN
  SELECT price_cents INTO v_price FROM luminix.services WHERE clinic_id = NEW.clinic_id AND id = NEW.service_id;
  SELECT * INTO v_promo FROM luminix.service_promotion(NEW.clinic_id, NEW.service_id,
    (NEW.starts_at AT TIME ZONE 'America/Sao_Paulo')::date);
  NEW.list_price_cents := v_price;
  NEW.promotion_id := v_promo.promotion_id;
  NEW.price_cents := CASE WHEN v_promo.percent IS NULL THEN v_price
    ELSE round(v_price * (100 - v_promo.percent) / 100.0)::integer END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION luminix.snapshot_appointment_price() FROM PUBLIC;
CREATE TRIGGER snapshot_appointment_price BEFORE INSERT ON luminix.appointments
  FOR EACH ROW EXECUTE FUNCTION luminix.snapshot_appointment_price();

ALTER TABLE luminix.appointments NO FORCE ROW LEVEL SECURITY;
UPDATE luminix.appointments a SET list_price_cents = s.price_cents, price_cents = s.price_cents
  FROM luminix.services s WHERE s.clinic_id = a.clinic_id AND s.id = a.service_id AND a.price_cents IS NULL;
ALTER TABLE luminix.appointments FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION luminix.create_manager_appointment(
  p_clinic uuid, p_client uuid, p_service uuid, p_professional uuid,
  p_starts_at timestamptz, p_ends_at timestamptz, p_override_reasons text[], p_notes text
) RETURNS luminix.appointments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE result luminix.appointments%ROWTYPE; v_membership uuid;
BEGIN
  SELECT membership_id INTO v_membership FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'agenda:manage');
  INSERT INTO luminix.appointments
    (clinic_id, clinic_client_id, service_id, professional_id, created_by_membership_id,
     starts_at, ends_at, status, booking_source, override_reasons, notes)
  VALUES (p_clinic, p_client, p_service, p_professional, v_membership,
    p_starts_at, p_ends_at, 'confirmed', 'manager', p_override_reasons, p_notes)
  RETURNING * INTO result;
  RETURN result;
END $$;

CREATE FUNCTION luminix.set_appointment_status(p_clinic uuid, p_appointment uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR p_status NOT IN ('scheduled', 'confirmed', 'completed', 'canceled', 'no_show') THEN
    RAISE EXCEPTION 'Invalid appointment status' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'agenda:manage');
  UPDATE luminix.appointments SET status = p_status, updated_at = now()
    WHERE clinic_id = p_clinic AND id = p_appointment;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found' USING ERRCODE = '22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.set_appointment_status(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_appointment_status(uuid, uuid, text) TO luminix_api;

-- 6. Finance ledger ----------------------------------------------------------------------------

CREATE FUNCTION luminix.save_finance_entry(p_clinic uuid, p_entry jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_id uuid; v_appointment uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR jsonb_typeof(p_entry) IS DISTINCT FROM 'object'
    OR coalesce(p_entry->>'kind', '') NOT IN ('income', 'expense')
    OR coalesce(p_entry->>'amountCents', '') !~ '^[0-9]{1,9}$'
    OR (p_entry->>'amountCents')::integer NOT BETWEEN 1 AND 100000000
    OR coalesce(p_entry->>'occurredOn', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR length(coalesce(btrim(p_entry->>'description'), '')) NOT BETWEEN 1 AND 160
    OR length(coalesce(p_entry->>'category', '')) > 60
    OR (nullif(p_entry->>'method', '') IS NOT NULL
      AND p_entry->>'method' NOT IN ('pix', 'cash', 'credit', 'debit', 'transfer', 'other')) THEN
    RAISE EXCEPTION 'Invalid finance entry' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'finance:manage') a;
  IF nullif(p_entry->>'appointmentId', '') IS NOT NULL THEN
    v_appointment := (p_entry->>'appointmentId')::uuid;
    PERFORM 1 FROM luminix.appointments WHERE clinic_id = p_clinic AND id = v_appointment;
    IF NOT FOUND OR p_entry->>'kind' <> 'income' THEN
      RAISE EXCEPTION 'Invalid appointment link' USING ERRCODE = '22023';
    END IF;
  END IF;
  INSERT INTO luminix.finance_entries (clinic_id, kind, amount_cents, occurred_on, description,
      category, method, appointment_id, created_by_membership_id)
    VALUES (p_clinic, p_entry->>'kind', (p_entry->>'amountCents')::integer,
      (p_entry->>'occurredOn')::date, btrim(p_entry->>'description'),
      nullif(btrim(p_entry->>'category'), ''), nullif(p_entry->>'method', ''), v_appointment, v_member)
    RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION luminix.save_finance_entry(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.save_finance_entry(uuid, jsonb) TO luminix_api;

-- Entries are voided, never deleted, so reports can be audited.
CREATE FUNCTION luminix.void_finance_entry(p_clinic uuid, p_entry uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'finance:manage');
  UPDATE luminix.finance_entries SET status = 'void'
    WHERE clinic_id = p_clinic AND id = p_entry AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found' USING ERRCODE = '22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.void_finance_entry(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.void_finance_entry(uuid, uuid) TO luminix_api;

-- 7. Inventory ---------------------------------------------------------------------------------

CREATE FUNCTION luminix.save_inventory_item(p_clinic uuid, p_item jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_id uuid; v_member uuid; v_initial numeric;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR jsonb_typeof(p_item) IS DISTINCT FROM 'object'
    OR coalesce(p_item->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR length(coalesce(btrim(p_item->>'name'), '')) NOT BETWEEN 1 AND 120
    OR length(coalesce(p_item->>'category', '')) > 60
    OR coalesce(p_item->>'unit', '') NOT IN ('un', 'ml', 'l', 'g', 'kg', 'cx', 'fr', 'par')
    OR coalesce(p_item->>'minQuantity', '') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$'
    OR (nullif(p_item->>'costCents', '') IS NOT NULL AND p_item->>'costCents' !~ '^[0-9]{1,9}$')
    OR (p_item ? 'initialQuantity' AND coalesce(p_item->>'initialQuantity', '') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$') THEN
    RAISE EXCEPTION 'Invalid inventory item' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'inventory:manage') a;
  v_id := (p_item->>'id')::uuid;
  IF EXISTS (SELECT 1 FROM luminix.inventory_items WHERE clinic_id = p_clinic AND id = v_id) THEN
    UPDATE luminix.inventory_items SET name = btrim(p_item->>'name'),
        category = nullif(btrim(p_item->>'category'), ''), unit = p_item->>'unit',
        min_quantity = (p_item->>'minQuantity')::numeric,
        cost_cents = nullif(p_item->>'costCents', '')::integer, updated_at = now()
      WHERE clinic_id = p_clinic AND id = v_id;
  ELSE
    v_initial := coalesce(nullif(p_item->>'initialQuantity', '')::numeric, 0);
    INSERT INTO luminix.inventory_items (id, clinic_id, name, category, unit, quantity, min_quantity, cost_cents)
      VALUES (v_id, p_clinic, btrim(p_item->>'name'), nullif(btrim(p_item->>'category'), ''),
        p_item->>'unit', v_initial, (p_item->>'minQuantity')::numeric,
        nullif(p_item->>'costCents', '')::integer);
    IF v_initial > 0 THEN
      INSERT INTO luminix.inventory_movements (clinic_id, item_id, kind, quantity, balance, note, created_by_membership_id)
        VALUES (p_clinic, v_id, 'in', v_initial, v_initial, 'Estoque inicial', v_member);
    END IF;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION luminix.save_inventory_item(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.save_inventory_item(uuid, jsonb) TO luminix_api;

-- Entrada soma, saída subtrai (nunca abaixo de zero), ajuste define a contagem real.
CREATE FUNCTION luminix.move_inventory(p_clinic uuid, p_item uuid, p_kind text, p_quantity numeric, p_note text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_current numeric; v_balance numeric;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_kind NOT IN ('in', 'out', 'adjust')
    OR p_quantity IS NULL OR p_quantity < 0 OR p_quantity > 99999999
    OR (p_kind <> 'adjust' AND p_quantity = 0) OR length(coalesce(p_note, '')) > 160 THEN
    RAISE EXCEPTION 'Invalid movement' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'inventory:manage') a;
  SELECT quantity INTO v_current FROM luminix.inventory_items
    WHERE clinic_id = p_clinic AND id = p_item AND status = 'active' FOR UPDATE;
  IF v_current IS NULL THEN RAISE EXCEPTION 'Item not found' USING ERRCODE = '22023'; END IF;
  v_balance := CASE p_kind WHEN 'in' THEN v_current + p_quantity
    WHEN 'out' THEN v_current - p_quantity ELSE p_quantity END;
  IF v_balance < 0 THEN RAISE EXCEPTION 'Not enough stock' USING ERRCODE = '22023'; END IF;
  UPDATE luminix.inventory_items SET quantity = v_balance, updated_at = now()
    WHERE clinic_id = p_clinic AND id = p_item;
  INSERT INTO luminix.inventory_movements (clinic_id, item_id, kind, quantity, balance, note, created_by_membership_id)
    VALUES (p_clinic, p_item, p_kind, p_quantity, v_balance, nullif(btrim(p_note), ''), v_member);
  RETURN v_balance;
END $$;
REVOKE ALL ON FUNCTION luminix.move_inventory(uuid, uuid, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.move_inventory(uuid, uuid, text, numeric, text) TO luminix_api;

CREATE FUNCTION luminix.archive_inventory_item(p_clinic uuid, p_item uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'inventory:manage');
  UPDATE luminix.inventory_items SET status = 'archived', updated_at = now()
    WHERE clinic_id = p_clinic AND id = p_item AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found' USING ERRCODE = '22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.archive_inventory_item(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.archive_inventory_item(uuid, uuid) TO luminix_api;

-- 8. Recent activity (audit timeline, names resolved; no field values exposed) -----------------

CREATE FUNCTION luminix.list_recent_activity(p_clinic uuid, p_limit integer)
RETURNS TABLE (entity text, action text, label text, detail text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Invalid activity request' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'audit:read');
  RETURN QUERY
  SELECT l.entity_table, l.action,
    CASE l.entity_table
      WHEN 'appointments' THEN (SELECT c.display_name FROM luminix.appointments a
        JOIN luminix.clinic_clients c ON c.clinic_id = a.clinic_id AND c.id = a.clinic_client_id
        WHERE a.clinic_id = p_clinic AND a.id = (l.entity_key->>'id')::uuid)
      WHEN 'clinic_clients' THEN (SELECT display_name FROM luminix.clinic_clients
        WHERE clinic_id = p_clinic AND id = (l.entity_key->>'id')::uuid)
      WHEN 'services' THEN (SELECT name FROM luminix.services
        WHERE clinic_id = p_clinic AND id = (l.entity_key->>'id')::uuid)
      WHEN 'finance_entries' THEN (SELECT description FROM luminix.finance_entries
        WHERE clinic_id = p_clinic AND id = (l.entity_key->>'id')::uuid)
      WHEN 'inventory_movements' THEN (SELECT i.name FROM luminix.inventory_movements m
        JOIN luminix.inventory_items i ON i.clinic_id = m.clinic_id AND i.id = m.item_id
        WHERE m.clinic_id = p_clinic AND m.id = (l.entity_key->>'id')::uuid)
      WHEN 'media_items' THEN (SELECT f.name FROM luminix.media_items i
        JOIN luminix.media_folders f ON f.clinic_id = i.clinic_id AND f.id = i.folder_id
        WHERE i.clinic_id = p_clinic AND i.id = (l.entity_key->>'id')::uuid)
      WHEN 'promotions' THEN (SELECT name FROM luminix.promotions
        WHERE clinic_id = p_clinic AND id = (l.entity_key->>'id')::uuid)
    END,
    CASE l.entity_table
      WHEN 'appointments' THEN (SELECT s.name || ' · ' || to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
        FROM luminix.appointments a JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
        WHERE a.clinic_id = p_clinic AND a.id = (l.entity_key->>'id')::uuid)
      WHEN 'finance_entries' THEN (SELECT to_char(amount_cents / 100.0, 'FM999G999G990D00')
        FROM luminix.finance_entries WHERE clinic_id = p_clinic AND id = (l.entity_key->>'id')::uuid)
      WHEN 'inventory_movements' THEN (SELECT CASE m.kind WHEN 'in' THEN 'Entrada' WHEN 'out' THEN 'Saída' ELSE 'Ajuste' END
        || ' · saldo ' || trim(to_char(m.balance, 'FM99999990D##'))
        FROM luminix.inventory_movements m WHERE m.clinic_id = p_clinic AND m.id = (l.entity_key->>'id')::uuid)
      ELSE NULL
    END,
    l.created_at
  FROM luminix.audit_logs l
  WHERE l.clinic_id = p_clinic
    AND l.entity_table IN ('appointments', 'clinic_clients', 'services', 'finance_entries',
      'inventory_movements', 'media_items', 'promotions')
    AND (l.action = 'INSERT' OR (l.entity_table IN ('appointments', 'services') AND 'status' = ANY (l.changed_fields)))
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
END $$;
REVOKE ALL ON FUNCTION luminix.list_recent_activity(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.list_recent_activity(uuid, integer) TO luminix_api;

-- 9. Public projection: active promotions marked to show on the site --------------------------

CREATE OR REPLACE FUNCTION luminix.public_clinic_projection(p_clinic uuid, p_preview boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object(
    'slug', c.slug,
    'code', c.share_code,
    'name', coalesce(nullif(btrim(p.public_showcase->>'title'), ''), c.name),
    'theme', coalesce(nullif(p.public_showcase->>'theme', ''), s.theme),
    'heroCategory', coalesce(nullif(p.public_showcase->>'heroCategory', ''),
      CASE WHEN p.public_showcase->>'style' = 'hair-salon' AND NOT (p.public_showcase ? 'heroCategory')
        THEN 'cabelo' END, p.initial_public_hero),
    'foundedYear', CASE WHEN p_preview OR NOT coalesce(p.public_showcase->'hidden', '[]'::jsonb) ? 'foundedYear'
      THEN p.founded_year END,
    'logoKey', logo.large_object_key,
    'subtitle', p.public_showcase->>'subtitle',
    'style', p.public_showcase->>'style',
    'hidden', coalesce(p.public_showcase->'hidden', '[]'::jsonb),
    'galleryKeys', coalesce((SELECT jsonb_agg(m.large_object_key ORDER BY g.position)
      FROM jsonb_array_elements_text(coalesce(p.public_showcase->'gallery', '[]'::jsonb)) WITH ORDINALITY g(id, position)
      JOIN luminix.media_assets m ON m.clinic_id = c.id AND m.id = g.id::uuid
        AND m.kind = 'public_photo' AND m.status = 'ready'), '[]'::jsonb),
    'featured', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'serviceId', svc.id, 'photoKey', m.large_object_key) ORDER BY f.position)
      FROM jsonb_array_elements(coalesce(p.public_showcase->'featured', '[]'::jsonb)) WITH ORDINALITY f(item, position)
      JOIN luminix.services svc ON svc.clinic_id = c.id AND svc.id = (f.item->>'serviceId')::uuid AND svc.status = 'active'
      LEFT JOIN luminix.media_assets m ON m.clinic_id = c.id AND m.id = (f.item->>'assetId')::uuid
        AND m.kind = 'public_photo' AND m.status = 'ready'), '[]'::jsonb),
    'servicePhotos', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'serviceId', svc.id, 'photoKey', m.large_object_key))
      FROM jsonb_array_elements(p.public_showcase->'servicePhotos') f(item)
      JOIN luminix.services svc ON svc.clinic_id = c.id AND svc.id = (f.item->>'serviceId')::uuid AND svc.status = 'active'
      JOIN luminix.media_assets m ON m.clinic_id = c.id AND m.id = (f.item->>'assetId')::uuid
        AND m.kind = 'public_photo' AND m.status = 'ready'), '[]'::jsonb),
    'whatsapp', CASE WHEN p_preview OR p.public_contacts THEN p.whatsapp_phone END,
    'instagram', CASE WHEN p_preview OR p.public_contacts THEN p.instagram END,
    'facebook', CASE WHEN p_preview OR p.public_contacts THEN p.facebook END,
    'website', CASE WHEN p_preview OR p.public_contacts THEN p.website END,
    'location', CASE WHEN (p_preview OR p.public_address) AND l.id IS NOT NULL THEN jsonb_build_object(
      'line', l.address_line, 'number', l.address_number, 'district', l.district,
      'city', l.city, 'state', l.state, 'postalCode', l.postal_code) END,
    'hours', CASE WHEN NOT p_preview AND coalesce(p.public_showcase->'hidden', '[]'::jsonb) ? 'hours'
      THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('weekday', w.weekday,
      'available', w.is_available, 'periods', w.periods) ORDER BY w.weekday)
      FROM luminix.weekly_availability w WHERE w.clinic_id = c.id), '[]'::jsonb) END,
    'services', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', svc.id, 'name', svc.name, 'category', coalesce(svc.category, 'Cuidados'),
      'description', svc.description, 'priceCents', svc.price_cents, 'priceType', svc.price_type,
      'durationMinutes', svc.duration_minutes, 'bookingMode', svc.booking_mode,
      'promoPercent', promo.percent, 'promoEndsOn', promo.ends_on,
      'promoPriceCents', CASE WHEN promo.percent IS NULL THEN NULL
        ELSE round(svc.price_cents * (100 - promo.percent) / 100.0)::integer END
    ) ORDER BY svc.category, svc.name, svc.id) FROM luminix.services svc
      LEFT JOIN LATERAL (SELECT sp.percent, sp.ends_on
        FROM luminix.service_promotion(c.id, svc.id, luminix.clinic_today()) sp
        WHERE sp.show_on_site) promo ON true
      WHERE svc.clinic_id = c.id AND svc.status = 'active'), '[]'::jsonb)
  )
  FROM luminix.clinics c
  JOIN luminix.clinic_profiles p ON p.clinic_id = c.id
  JOIN luminix.clinic_settings s ON s.clinic_id = c.id
  LEFT JOIN luminix.locations l ON l.clinic_id = c.id AND l.is_primary
  LEFT JOIN luminix.media_assets logo ON logo.clinic_id = c.id AND logo.id = p.logo_asset_id
    AND logo.status = 'ready' AND logo.kind = 'clinic_logo'
  WHERE c.id = p_clinic
$$;
