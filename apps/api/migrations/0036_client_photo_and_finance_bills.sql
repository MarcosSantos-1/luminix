-- 1. Client photo: a private image per client (private bucket, signed URLs), shown on the day's
--    agenda and on the client list.
-- 2. Finance: recurring bills (aluguel, luz, internet…) with an expected amount and due day; an
--    expense entry can settle one bill for one month.

-- 1. Client photo ---------------------------------------------------------------------------------

ALTER TABLE luminix.clinic_clients
  ADD COLUMN photo_asset_id uuid,
  ADD FOREIGN KEY (clinic_id, photo_asset_id) REFERENCES luminix.media_assets(clinic_id, id);

ALTER TABLE luminix.media_assets
  DROP CONSTRAINT media_assets_kind_check,
  DROP CONSTRAINT media_assets_subject_check,
  ADD CONSTRAINT media_assets_kind_check
    CHECK (kind IN ('clinic_logo', 'professional_photo', 'public_photo', 'library_photo', 'client_photo')),
  ADD CONSTRAINT media_assets_subject_check CHECK (
    (kind IN ('clinic_logo', 'public_photo') AND subject_ref IS NULL)
    OR (kind IN ('professional_photo', 'library_photo', 'client_photo') AND subject_ref IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION luminix.begin_media_upload(p_clinic uuid, p_kind text, p_subject_ref uuid DEFAULT NULL)
RETURNS TABLE (asset_id uuid, asset_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_asset uuid; v_permission text;
BEGIN
  IF p_clinic IS DISTINCT FROM nullif(current_setting('luminix.clinic_id', true), '')::uuid
    OR p_kind NOT IN ('clinic_logo', 'professional_photo', 'public_photo', 'library_photo', 'client_photo')
    OR (p_kind IN ('clinic_logo', 'public_photo') AND p_subject_ref IS NOT NULL)
    OR (p_kind IN ('professional_photo', 'library_photo', 'client_photo') AND p_subject_ref IS NULL) THEN
    RAISE EXCEPTION 'Invalid media upload' USING ERRCODE = '22023';
  END IF;
  v_permission := CASE p_kind WHEN 'professional_photo' THEN 'professional:manage'
    WHEN 'library_photo' THEN 'media:manage' WHEN 'client_photo' THEN 'client:manage'
    ELSE 'settings:manage' END;
  SELECT membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, v_permission);
  IF p_kind = 'library_photo' THEN
    PERFORM 1 FROM luminix.media_folders WHERE clinic_id = p_clinic AND id = p_subject_ref AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Folder unavailable' USING ERRCODE = '22023'; END IF;
  ELSIF p_kind = 'client_photo' THEN
    PERFORM 1 FROM luminix.clinic_clients WHERE clinic_id = p_clinic AND id = p_subject_ref;
    IF NOT FOUND THEN RAISE EXCEPTION 'Client unavailable' USING ERRCODE = '22023'; END IF;
  END IF;
  INSERT INTO luminix.media_assets (clinic_id, kind, subject_ref, created_by_membership_id)
    VALUES (p_clinic, p_kind, p_subject_ref, v_member) RETURNING id INTO v_asset;
  RETURN QUERY SELECT v_asset, 'pending'::text;
END $$;

CREATE OR REPLACE FUNCTION luminix.complete_media_upload(
  p_clinic uuid, p_asset uuid, p_small_bytes integer, p_large_bytes integer
) RETURNS TABLE (asset_id uuid, asset_status text, small_object_key text, large_object_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_asset luminix.media_assets%ROWTYPE; v_permission text; v_small text; v_large text; v_module text;
BEGIN
  IF p_clinic IS DISTINCT FROM nullif(current_setting('luminix.clinic_id', true), '')::uuid
    OR p_asset IS NULL OR p_small_bytes NOT BETWEEN 1 AND 2500000 OR p_large_bytes NOT BETWEEN 1 AND 2500000 THEN
    RAISE EXCEPTION 'Invalid media upload' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_asset FROM luminix.media_assets WHERE clinic_id = p_clinic AND id = p_asset FOR UPDATE;
  IF NOT FOUND OR v_asset.status <> 'pending' THEN RAISE EXCEPTION 'Media conflict' USING ERRCODE = '23505'; END IF;
  v_permission := CASE v_asset.kind WHEN 'professional_photo' THEN 'professional:manage'
    WHEN 'library_photo' THEN 'media:manage' WHEN 'client_photo' THEN 'client:manage'
    ELSE 'settings:manage' END;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, v_permission);
  IF v_asset.kind = 'library_photo' THEN
    -- Private bucket, larger variants (see media-storage.ts). Folder is only the upload origin.
    v_small := p_clinic::text || '/library/' || p_asset::text || '/small-480.webp';
    v_large := p_clinic::text || '/library/' || p_asset::text || '/large-1600.webp';
  ELSE
    -- client_photo lives in the private bucket too, with the same square sizes as team photos.
    v_module := CASE WHEN v_asset.kind = 'clinic_logo' THEN 'branding/logo'
      WHEN v_asset.kind = 'public_photo' THEN 'showcase'
      WHEN v_asset.kind = 'client_photo' THEN 'clients/' || v_asset.subject_ref::text
      ELSE 'team/' || v_asset.subject_ref::text END;
    v_small := p_clinic::text || '/' || v_module || '/' || p_asset::text || '/small-128.webp';
    v_large := p_clinic::text || '/' || v_module || '/' || p_asset::text || '/large-512.webp';
    UPDATE luminix.media_assets SET status = 'superseded'
      WHERE clinic_id = p_clinic AND kind = v_asset.kind
        AND v_asset.kind <> 'public_photo' AND subject_ref IS NOT DISTINCT FROM v_asset.subject_ref AND status = 'ready';
  END IF;
  UPDATE luminix.media_assets SET status = 'ready', small_object_key = v_small, large_object_key = v_large,
    small_bytes = p_small_bytes, large_bytes = p_large_bytes, ready_at = now()
    WHERE clinic_id = p_clinic AND id = p_asset;
  IF v_asset.kind = 'client_photo' THEN
    UPDATE luminix.clinic_clients SET photo_asset_id = p_asset
      WHERE clinic_id = p_clinic AND id = v_asset.subject_ref;
  END IF;
  RETURN QUERY SELECT p_asset, 'ready'::text, v_small, v_large;
END $$;

CREATE FUNCTION luminix.remove_client_photo(p_clinic uuid, p_client uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid client' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'client:manage');
  UPDATE luminix.clinic_clients SET photo_asset_id = NULL WHERE clinic_id = p_clinic AND id = p_client;
  UPDATE luminix.media_assets SET status = 'superseded'
    WHERE clinic_id = p_clinic AND kind = 'client_photo' AND subject_ref = p_client AND status = 'ready';
END $$;
REVOKE ALL ON FUNCTION luminix.remove_client_photo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.remove_client_photo(uuid, uuid) TO luminix_api;

-- 2. Recurring bills --------------------------------------------------------------------------------

CREATE TABLE luminix.finance_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  category text NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 60),
  -- Expected amount: the real one is typed when the bill is settled.
  amount_cents integer NOT NULL DEFAULT 0 CHECK (amount_cents BETWEEN 0 AND 100000000),
  due_day smallint CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id)
);
ALTER TABLE luminix.finance_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.finance_bills FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.finance_bills
  USING (clinic_id = luminix.current_clinic_id()) WITH CHECK (clinic_id = luminix.current_clinic_id());
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.finance_bills
  FOR EACH ROW EXECUTE FUNCTION luminix.audit_change();
CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.finance_bills
  FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move();
REVOKE ALL ON luminix.finance_bills FROM PUBLIC;
GRANT SELECT ON luminix.finance_bills TO luminix_api;

-- An expense can settle one bill for one month (bill_month = first day of that month).
ALTER TABLE luminix.finance_entries
  ADD COLUMN bill_id uuid,
  ADD COLUMN bill_month date,
  ADD FOREIGN KEY (clinic_id, bill_id) REFERENCES luminix.finance_bills(clinic_id, id),
  ADD CHECK ((bill_id IS NULL) = (bill_month IS NULL)),
  ADD CHECK (bill_id IS NULL OR kind = 'expense');
CREATE UNIQUE INDEX finance_entries_bill ON luminix.finance_entries(clinic_id, bill_id, bill_month)
  WHERE bill_id IS NOT NULL AND status = 'active';

CREATE FUNCTION luminix.save_finance_bill(p_clinic uuid, p_bill jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_id uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR jsonb_typeof(p_bill) IS DISTINCT FROM 'object'
    OR coalesce(p_bill->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR length(coalesce(btrim(p_bill->>'name'), '')) NOT BETWEEN 1 AND 80
    OR length(coalesce(btrim(p_bill->>'category'), '')) NOT BETWEEN 1 AND 60
    OR coalesce(p_bill->>'amountCents', '') !~ '^[0-9]{1,9}$'
    OR (p_bill->>'amountCents')::integer > 100000000
    OR (nullif(p_bill->>'dueDay', '') IS NOT NULL AND (p_bill->>'dueDay' !~ '^[0-9]{1,2}$'
      OR (p_bill->>'dueDay')::integer NOT BETWEEN 1 AND 31))
    OR coalesce(p_bill->>'status', '') NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION 'Invalid finance bill' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'finance:manage');
  v_id := (p_bill->>'id')::uuid;
  INSERT INTO luminix.finance_bills (id, clinic_id, name, category, amount_cents, due_day, status)
    VALUES (v_id, p_clinic, btrim(p_bill->>'name'), btrim(p_bill->>'category'),
      (p_bill->>'amountCents')::integer, nullif(p_bill->>'dueDay', '')::smallint, p_bill->>'status')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category,
      amount_cents = EXCLUDED.amount_cents, due_day = EXCLUDED.due_day, status = EXCLUDED.status,
      updated_at = now()
    WHERE luminix.finance_bills.clinic_id = p_clinic;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid finance bill' USING ERRCODE = '22023'; END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION luminix.save_finance_bill(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.save_finance_bill(uuid, jsonb) TO luminix_api;

-- Same as 0027, plus the optional bill link (billId + billMonth 'YYYY-MM').
CREATE OR REPLACE FUNCTION luminix.save_finance_entry(p_clinic uuid, p_entry jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_id uuid; v_appointment uuid; v_bill uuid; v_bill_month date;
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
      AND p_entry->>'method' NOT IN ('pix', 'cash', 'credit', 'debit', 'transfer', 'other'))
    OR (nullif(p_entry->>'billId', '') IS NOT NULL
      AND (p_entry->>'kind' <> 'expense' OR coalesce(p_entry->>'billMonth', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$')) THEN
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
  IF nullif(p_entry->>'billId', '') IS NOT NULL THEN
    v_bill := (p_entry->>'billId')::uuid;
    v_bill_month := (p_entry->>'billMonth' || '-01')::date;
    PERFORM 1 FROM luminix.finance_bills WHERE clinic_id = p_clinic AND id = v_bill;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid bill link' USING ERRCODE = '22023'; END IF;
  END IF;
  INSERT INTO luminix.finance_entries (clinic_id, kind, amount_cents, occurred_on, description,
      category, method, appointment_id, bill_id, bill_month, created_by_membership_id)
    VALUES (p_clinic, p_entry->>'kind', (p_entry->>'amountCents')::integer,
      (p_entry->>'occurredOn')::date, btrim(p_entry->>'description'),
      nullif(btrim(p_entry->>'category'), ''), nullif(p_entry->>'method', ''), v_appointment,
      v_bill, v_bill_month, v_member)
    RETURNING id INTO v_id;
  RETURN v_id;
END $$;
