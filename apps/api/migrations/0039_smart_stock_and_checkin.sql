-- Stock, phase 2 ("estoque inteligente"), check-in and partial payments.
--
-- 1. A product with a package is counted in its base unit (ml, g, un, m, cm, folha); the package
--    ("pote de 400 g") turns "chegou 2" into +800 g. Existing products with a package are converted.
-- 2. The alert can be a percent of the level right after the last restock (50%, 25%…); the
--    effective threshold stays in min_quantity, so every existing "acabando" check keeps working.
-- 3. Each service has a recipe (service_supplies). Completing an appointment consumes it, once.
-- 4. Check-in (the client arrived) and payments in parts, never above the agreed price.

-- 1 and 2. Products ------------------------------------------------------------------------------

ALTER TABLE luminix.inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_unit_check,
  ADD COLUMN package_label text CHECK (package_label IS NULL OR length(btrim(package_label)) BETWEEN 1 AND 30),
  ADD COLUMN alert_percent smallint CHECK (alert_percent IS NULL OR alert_percent BETWEEN 1 AND 90),
  ADD COLUMN reference_quantity numeric(12, 2) CHECK (reference_quantity IS NULL OR reference_quantity >= 0),
  -- Id in the suggestions catalog the product came from (admin lib), used to suggest recipes.
  ADD COLUMN catalog_id text CHECK (catalog_id IS NULL OR catalog_id ~ '^[a-z0-9áéíóúâêôãõç-]{1,80}$');

-- The package is now measured in the item's own unit.
UPDATE luminix.inventory_movements m SET quantity = m.quantity * i.package_size,
    balance = m.balance * i.package_size
  FROM luminix.inventory_items i
 WHERE i.clinic_id = m.clinic_id AND i.id = m.item_id AND i.package_size IS NOT NULL;
UPDATE luminix.inventory_items SET quantity = quantity * package_size,
    min_quantity = min_quantity * package_size, unit = package_unit,
    package_label = CASE unit WHEN 'fr' THEN 'frasco' WHEN 'cx' THEN 'caixa' WHEN 'par' THEN 'par'
      ELSE CASE package_unit WHEN 'ml' THEN 'frasco' WHEN 'g' THEN 'pote' ELSE 'caixa' END END
 WHERE package_size IS NOT NULL;
UPDATE luminix.inventory_items SET reference_quantity = quantity;

ALTER TABLE luminix.inventory_items
  DROP COLUMN package_unit,
  ADD CONSTRAINT inventory_items_unit_check
    CHECK (unit IN ('un', 'ml', 'l', 'g', 'kg', 'cx', 'fr', 'par', 'm', 'cm', 'folha'));

ALTER TABLE luminix.inventory_movements
  ADD COLUMN appointment_id uuid,
  ADD FOREIGN KEY (clinic_id, appointment_id) REFERENCES luminix.appointments(clinic_id, id);
-- An appointment consumes each product once.
CREATE UNIQUE INDEX inventory_movements_appointment
  ON luminix.inventory_movements(clinic_id, appointment_id, item_id) WHERE appointment_id IS NOT NULL;

-- Threshold from the percent and the reference level (the level right after restocking).
CREATE FUNCTION luminix.inventory_threshold(p_reference numeric, p_percent smallint, p_min numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN p_percent IS NULL THEN p_min
    ELSE round(coalesce(p_reference, 0) * p_percent / 100.0, 2) END
$$;
GRANT EXECUTE ON FUNCTION luminix.inventory_threshold(numeric, smallint, numeric) TO luminix_api;

CREATE OR REPLACE FUNCTION luminix.save_inventory_item(p_clinic uuid, p_item jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_id uuid; v_member uuid; v_initial numeric; v_photo uuid; v_size numeric; v_percent smallint;
  v_old luminix.inventory_items%ROWTYPE; v_factor numeric := 1; v_supply jsonb;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR jsonb_typeof(p_item) IS DISTINCT FROM 'object'
    OR coalesce(p_item->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR length(coalesce(btrim(p_item->>'name'), '')) NOT BETWEEN 1 AND 120
    OR length(coalesce(p_item->>'category', '')) > 60
    OR coalesce(p_item->>'unit', '') NOT IN ('un', 'ml', 'l', 'g', 'kg', 'cx', 'fr', 'par', 'm', 'cm', 'folha')
    OR coalesce(p_item->>'minQuantity', '') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$'
    OR (nullif(p_item->>'costCents', '') IS NOT NULL AND p_item->>'costCents' !~ '^[0-9]{1,9}$')
    OR (p_item ? 'initialQuantity' AND coalesce(p_item->>'initialQuantity', '') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$')
    OR (nullif(p_item->>'packageSize', '') IS NOT NULL
      AND (p_item->>'packageSize' !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$' OR (p_item->>'packageSize')::numeric <= 0))
    OR length(coalesce(p_item->>'packageLabel', '')) > 30
    OR (nullif(p_item->>'alertPercent', '') IS NOT NULL
      AND (p_item->>'alertPercent' !~ '^[0-9]{1,2}$' OR (p_item->>'alertPercent')::integer NOT BETWEEN 1 AND 90))
    OR (nullif(p_item->>'catalogId', '') IS NOT NULL AND p_item->>'catalogId' !~ '^[a-z0-9áéíóúâêôãõç-]{1,80}$')
    OR (p_item ? 'supplies' AND (jsonb_typeof(p_item->'supplies') <> 'array'
      OR jsonb_array_length(p_item->'supplies') > 200))
    OR (nullif(p_item->>'photoAssetId', '') IS NOT NULL AND p_item->>'photoAssetId' !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'Invalid inventory item' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'inventory:manage') a;
  v_id := (p_item->>'id')::uuid;
  v_size := nullif(p_item->>'packageSize', '')::numeric;
  v_percent := nullif(p_item->>'alertPercent', '')::smallint;
  v_photo := nullif(p_item->>'photoAssetId', '')::uuid;
  IF v_photo IS NOT NULL THEN
    PERFORM 1 FROM luminix.media_assets WHERE clinic_id = p_clinic AND id = v_photo
      AND kind = 'product_photo' AND subject_ref = v_id AND status = 'ready';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid product photo' USING ERRCODE = '22023'; END IF;
  END IF;
  SELECT * INTO v_old FROM luminix.inventory_items WHERE clinic_id = p_clinic AND id = v_id FOR UPDATE;
  IF FOUND THEN
    -- Counted in packages before (frascos, caixas…) and now in their content: convert.
    IF v_old.package_size IS NULL AND v_size IS NOT NULL AND v_old.unit IN ('un', 'fr', 'cx', 'par')
      AND p_item->>'unit' <> v_old.unit THEN
      v_factor := v_size;
    END IF;
    UPDATE luminix.inventory_items SET name = btrim(p_item->>'name'),
        category = nullif(btrim(p_item->>'category'), ''), unit = p_item->>'unit',
        quantity = quantity * v_factor,
        reference_quantity = coalesce(reference_quantity, quantity) * v_factor,
        min_quantity = luminix.inventory_threshold(coalesce(reference_quantity, quantity) * v_factor,
          v_percent, (p_item->>'minQuantity')::numeric),
        alert_percent = v_percent,
        cost_cents = nullif(p_item->>'costCents', '')::integer,
        package_size = v_size,
        package_label = CASE WHEN v_size IS NULL THEN NULL ELSE nullif(btrim(p_item->>'packageLabel'), '') END,
        catalog_id = coalesce(nullif(p_item->>'catalogId', ''), catalog_id),
        photo_asset_id = v_photo, updated_at = now()
      WHERE clinic_id = p_clinic AND id = v_id;
    IF v_factor <> 1 THEN
      INSERT INTO luminix.inventory_movements (clinic_id, item_id, kind, quantity, balance, note, created_by_membership_id)
        VALUES (p_clinic, v_id, 'adjust', v_old.quantity * v_factor, v_old.quantity * v_factor,
          'Conversão para ' || (p_item->>'unit'), v_member);
    END IF;
  ELSE
    v_initial := coalesce(nullif(p_item->>'initialQuantity', '')::numeric, 0);
    INSERT INTO luminix.inventory_items (id, clinic_id, name, category, unit, quantity, min_quantity,
        cost_cents, package_size, package_label, photo_asset_id, alert_percent, reference_quantity, catalog_id)
      VALUES (v_id, p_clinic, btrim(p_item->>'name'), nullif(btrim(p_item->>'category'), ''),
        p_item->>'unit', v_initial,
        luminix.inventory_threshold(v_initial, v_percent, (p_item->>'minQuantity')::numeric),
        nullif(p_item->>'costCents', '')::integer, v_size,
        CASE WHEN v_size IS NULL THEN NULL ELSE nullif(btrim(p_item->>'packageLabel'), '') END,
        v_photo, v_percent, v_initial, nullif(p_item->>'catalogId', ''));
    IF v_initial > 0 THEN
      INSERT INTO luminix.inventory_movements (clinic_id, item_id, kind, quantity, balance, note, created_by_membership_id)
        VALUES (p_clinic, v_id, 'in', v_initial, v_initial, 'Estoque inicial', v_member);
    END IF;
  END IF;
  -- Recipes that use this product ("supplies": [{serviceId, quantity}]), replaced when sent.
  IF p_item ? 'supplies' THEN
    DELETE FROM luminix.service_supplies WHERE clinic_id = p_clinic AND item_id = v_id;
    FOR v_supply IN SELECT value FROM jsonb_array_elements(p_item->'supplies') LOOP
      IF coalesce(v_supply->>'serviceId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR coalesce(v_supply->>'quantity', '') !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$'
        OR (v_supply->>'quantity')::numeric <= 0 THEN
        RAISE EXCEPTION 'Invalid supply' USING ERRCODE = '22023';
      END IF;
      PERFORM 1 FROM luminix.services WHERE clinic_id = p_clinic AND id = (v_supply->>'serviceId')::uuid;
      IF NOT FOUND THEN RAISE EXCEPTION 'Invalid supply' USING ERRCODE = '22023'; END IF;
      INSERT INTO luminix.service_supplies (clinic_id, service_id, item_id, quantity)
        VALUES (p_clinic, (v_supply->>'serviceId')::uuid, v_id, (v_supply->>'quantity')::numeric)
        ON CONFLICT (clinic_id, service_id, item_id) DO UPDATE SET quantity = EXCLUDED.quantity;
    END LOOP;
  END IF;
  RETURN v_id;
END $$;

-- Same as 0027, plus the reference level: a restock ("in") sets it, a count never lowers it,
-- and the percent threshold follows.
CREATE OR REPLACE FUNCTION luminix.move_inventory(p_clinic uuid, p_item uuid, p_kind text, p_quantity numeric, p_note text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_item luminix.inventory_items%ROWTYPE; v_balance numeric; v_reference numeric;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_kind NOT IN ('in', 'out', 'adjust')
    OR p_quantity IS NULL OR p_quantity < 0 OR p_quantity > 99999999
    OR (p_kind <> 'adjust' AND p_quantity = 0) OR length(coalesce(p_note, '')) > 160 THEN
    RAISE EXCEPTION 'Invalid movement' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'inventory:manage') a;
  SELECT * INTO v_item FROM luminix.inventory_items
    WHERE clinic_id = p_clinic AND id = p_item AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found' USING ERRCODE = '22023'; END IF;
  v_balance := CASE p_kind WHEN 'in' THEN v_item.quantity + p_quantity
    WHEN 'out' THEN v_item.quantity - p_quantity ELSE p_quantity END;
  IF v_balance < 0 THEN RAISE EXCEPTION 'Not enough stock' USING ERRCODE = '22023'; END IF;
  v_reference := CASE p_kind WHEN 'in' THEN v_balance
    WHEN 'adjust' THEN greatest(coalesce(v_item.reference_quantity, 0), v_balance)
    ELSE v_item.reference_quantity END;
  UPDATE luminix.inventory_items SET quantity = v_balance, reference_quantity = v_reference,
      min_quantity = luminix.inventory_threshold(v_reference, alert_percent, min_quantity),
      updated_at = now()
    WHERE clinic_id = p_clinic AND id = p_item;
  INSERT INTO luminix.inventory_movements (clinic_id, item_id, kind, quantity, balance, note, created_by_membership_id)
    VALUES (p_clinic, p_item, p_kind, p_quantity, v_balance, nullif(btrim(p_note), ''), v_member);
  RETURN v_balance;
END $$;

-- 3. Recipes --------------------------------------------------------------------------------------

CREATE TABLE luminix.service_supplies (
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  service_id uuid NOT NULL,
  item_id uuid NOT NULL,
  -- In the product's unit, per appointment.
  quantity numeric(12, 2) NOT NULL CHECK (quantity > 0 AND quantity <= 999999),
  PRIMARY KEY (clinic_id, service_id, item_id),
  FOREIGN KEY (clinic_id, service_id) REFERENCES luminix.services(clinic_id, id),
  FOREIGN KEY (clinic_id, item_id) REFERENCES luminix.inventory_items(clinic_id, id)
);
ALTER TABLE luminix.service_supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.service_supplies FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.service_supplies
  USING (clinic_id = luminix.current_clinic_id()) WITH CHECK (clinic_id = luminix.current_clinic_id());
CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.service_supplies
  FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move();
REVOKE ALL ON luminix.service_supplies FROM PUBLIC;
GRANT SELECT ON luminix.service_supplies TO luminix_api;

-- The recipe of one service, replaced as a whole ([{itemId, quantity}]).
CREATE FUNCTION luminix.save_service_supplies(p_clinic uuid, p_service uuid, p_items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_supply jsonb;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) > 40 THEN
    RAISE EXCEPTION 'Invalid supplies' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  PERFORM 1 FROM luminix.services WHERE clinic_id = p_clinic AND id = p_service;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid supplies' USING ERRCODE = '22023'; END IF;
  DELETE FROM luminix.service_supplies WHERE clinic_id = p_clinic AND service_id = p_service;
  FOR v_supply IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF coalesce(v_supply->>'itemId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR coalesce(v_supply->>'quantity', '') !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$'
      OR (v_supply->>'quantity')::numeric <= 0 THEN
      RAISE EXCEPTION 'Invalid supplies' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM luminix.inventory_items
      WHERE clinic_id = p_clinic AND id = (v_supply->>'itemId')::uuid AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid supplies' USING ERRCODE = '22023'; END IF;
    INSERT INTO luminix.service_supplies (clinic_id, service_id, item_id, quantity)
      VALUES (p_clinic, p_service, (v_supply->>'itemId')::uuid, (v_supply->>'quantity')::numeric)
      ON CONFLICT (clinic_id, service_id, item_id) DO UPDATE SET quantity = EXCLUDED.quantity;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION luminix.save_service_supplies(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.save_service_supplies(uuid, uuid, jsonb) TO luminix_api;

-- What finishing this appointment uses, for whoever runs the agenda (reception included): the
-- recipe of its service with the current stock, and whether it was already consumed.
CREATE FUNCTION luminix.appointment_supplies(p_clinic uuid, p_appointment uuid)
RETURNS TABLE (item_id uuid, name text, unit text, package_size numeric, package_label text,
  quantity numeric, stock numeric, consumed numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid appointment' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'agenda:manage');
  RETURN QUERY
    SELECT i.id, i.name, i.unit, i.package_size, i.package_label, ss.quantity, i.quantity,
           (SELECT m.quantity FROM luminix.inventory_movements m WHERE m.clinic_id = p_clinic
              AND m.appointment_id = p_appointment AND m.item_id = i.id)
      FROM luminix.appointments a
      JOIN luminix.service_supplies ss ON ss.clinic_id = a.clinic_id AND ss.service_id = a.service_id
      JOIN luminix.inventory_items i ON i.clinic_id = ss.clinic_id AND i.id = ss.item_id AND i.status = 'active'
     WHERE a.clinic_id = p_clinic AND a.id = p_appointment
     ORDER BY lower(i.name);
END $$;
REVOKE ALL ON FUNCTION luminix.appointment_supplies(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.appointment_supplies(uuid, uuid) TO luminix_api;

-- Consumes [{itemId, quantity}] for an appointment. Never blocks the appointment: the balance
-- stops at zero (the estimate may be off), and a product already consumed for it is skipped.
CREATE FUNCTION luminix.consume_appointment_supplies(p_clinic uuid, p_appointment uuid, p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_supply jsonb; v_item luminix.inventory_items%ROWTYPE; v_take numeric;
  v_label text; v_count integer := 0;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) > 40 THEN
    RAISE EXCEPTION 'Invalid supplies' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'agenda:manage') a;
  SELECT s.name || ' · ' || c.display_name INTO v_label
    FROM luminix.appointments a
    JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
    JOIN luminix.clinic_clients c ON c.clinic_id = a.clinic_id AND c.id = a.clinic_client_id
   WHERE a.clinic_id = p_clinic AND a.id = p_appointment;
  IF v_label IS NULL THEN RAISE EXCEPTION 'Appointment not found' USING ERRCODE = '22023'; END IF;
  FOR v_supply IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF coalesce(v_supply->>'itemId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR coalesce(v_supply->>'quantity', '') !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'Invalid supplies' USING ERRCODE = '22023';
    END IF;
    CONTINUE WHEN (v_supply->>'quantity')::numeric <= 0;
    SELECT * INTO v_item FROM luminix.inventory_items
      WHERE clinic_id = p_clinic AND id = (v_supply->>'itemId')::uuid AND status = 'active' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid supplies' USING ERRCODE = '22023'; END IF;
    CONTINUE WHEN EXISTS (SELECT 1 FROM luminix.inventory_movements WHERE clinic_id = p_clinic
      AND appointment_id = p_appointment AND item_id = v_item.id);
    v_take := least((v_supply->>'quantity')::numeric, v_item.quantity);
    UPDATE luminix.inventory_items SET quantity = quantity - v_take, updated_at = now()
      WHERE clinic_id = p_clinic AND id = v_item.id;
    INSERT INTO luminix.inventory_movements (clinic_id, item_id, kind, quantity, balance, note,
        created_by_membership_id, appointment_id)
      VALUES (p_clinic, v_item.id, 'out', v_take, v_item.quantity - v_take,
        left('Atendimento: ' || v_label, 160), v_member, p_appointment);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION luminix.consume_appointment_supplies(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.consume_appointment_supplies(uuid, uuid, jsonb) TO luminix_api;

-- 4. Check-in and payments in parts -----------------------------------------------------------------

ALTER TABLE luminix.appointments ADD COLUMN checked_in_at timestamptz;

CREATE FUNCTION luminix.check_in_appointment(p_clinic uuid, p_appointment uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid appointment' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'agenda:manage');
  UPDATE luminix.appointments SET checked_in_at = coalesce(checked_in_at, now()),
      status = 'confirmed', updated_at = now()
    WHERE clinic_id = p_clinic AND id = p_appointment AND status IN ('scheduled', 'confirmed');
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not open' USING ERRCODE = '22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.check_in_appointment(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.check_in_appointment(uuid, uuid) TO luminix_api;

-- Received so far for an appointment (runs under the caller's RLS).
CREATE FUNCTION luminix.appointment_paid_cents(p_clinic uuid, p_appointment uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(sum(amount_cents), 0)::integer FROM luminix.finance_entries
   WHERE clinic_id = p_clinic AND appointment_id = p_appointment AND status = 'active' AND kind = 'income'
$$;
GRANT EXECUTE ON FUNCTION luminix.appointment_paid_cents(uuid, uuid) TO luminix_api;

-- Several entries may pay one appointment, never more than its agreed price. Without a price
-- ("a combinar"), a single entry. The rest of save_finance_entry is unchanged (0036).
DROP INDEX luminix.finance_entries_appointment;
CREATE FUNCTION luminix.guard_appointment_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_price integer; v_paid integer;
BEGIN
  IF NEW.appointment_id IS NULL OR NEW.status <> 'active' OR NEW.kind <> 'income' THEN RETURN NEW; END IF;
  SELECT price_cents INTO v_price FROM luminix.appointments
    WHERE clinic_id = NEW.clinic_id AND id = NEW.appointment_id FOR UPDATE;
  SELECT coalesce(sum(amount_cents), 0) INTO v_paid FROM luminix.finance_entries
    WHERE clinic_id = NEW.clinic_id AND appointment_id = NEW.appointment_id AND status = 'active'
      AND kind = 'income' AND id IS DISTINCT FROM NEW.id;
  IF (coalesce(v_price, 0) = 0 AND v_paid > 0) OR (coalesce(v_price, 0) > 0 AND v_paid + NEW.amount_cents > v_price) THEN
    RAISE EXCEPTION 'Appointment already paid' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION luminix.guard_appointment_payment() FROM PUBLIC;
CREATE TRIGGER guard_appointment_payment BEFORE INSERT OR UPDATE ON luminix.finance_entries
  FOR EACH ROW EXECUTE FUNCTION luminix.guard_appointment_payment();

-- 5. Why an appointment was canceled (asked when canceling from the panel).
ALTER TABLE luminix.appointments
  ADD COLUMN status_note text CHECK (status_note IS NULL OR length(status_note) <= 300);

CREATE FUNCTION luminix.cancel_appointment(p_clinic uuid, p_appointment uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR length(coalesce(p_note, '')) > 300 THEN
    RAISE EXCEPTION 'Invalid appointment' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'agenda:manage');
  UPDATE luminix.appointments SET status = 'canceled', status_note = nullif(btrim(p_note), ''),
      updated_at = now()
    WHERE clinic_id = p_clinic AND id = p_appointment;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found' USING ERRCODE = '22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.cancel_appointment(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.cancel_appointment(uuid, uuid, text) TO luminix_api;
