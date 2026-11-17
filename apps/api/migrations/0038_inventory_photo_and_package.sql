-- Stock, phase 1: a photo per product (public bucket, like team photos; nothing personal in it)
-- and the package it comes in ("pote de 400 g"), which later lets the system estimate use.

ALTER TABLE luminix.inventory_items
  ADD COLUMN photo_asset_id uuid,
  ADD COLUMN package_size numeric(12, 2) CHECK (package_size IS NULL OR package_size > 0),
  ADD COLUMN package_unit text CHECK (package_unit IS NULL OR package_unit IN ('ml', 'g', 'un')),
  ADD CHECK ((package_size IS NULL) = (package_unit IS NULL)),
  ADD FOREIGN KEY (clinic_id, photo_asset_id) REFERENCES luminix.media_assets(clinic_id, id);

ALTER TABLE luminix.media_assets
  DROP CONSTRAINT media_assets_kind_check,
  DROP CONSTRAINT media_assets_subject_check,
  ADD CONSTRAINT media_assets_kind_check CHECK (kind IN ('clinic_logo', 'professional_photo',
    'public_photo', 'library_photo', 'client_photo', 'product_photo')),
  ADD CONSTRAINT media_assets_subject_check CHECK (
    (kind IN ('clinic_logo', 'public_photo') AND subject_ref IS NULL)
    OR (kind IN ('professional_photo', 'library_photo', 'client_photo', 'product_photo')
      AND subject_ref IS NOT NULL)
  );

-- Same as 0036, plus product_photo (subject_ref = the product id, inventory:manage). The product
-- may not exist yet: the photo is taken while filling the form and linked when it is saved.
CREATE OR REPLACE FUNCTION luminix.begin_media_upload(p_clinic uuid, p_kind text, p_subject_ref uuid DEFAULT NULL)
RETURNS TABLE (asset_id uuid, asset_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_asset uuid; v_permission text;
BEGIN
  IF p_clinic IS DISTINCT FROM nullif(current_setting('luminix.clinic_id', true), '')::uuid
    OR p_kind NOT IN ('clinic_logo', 'professional_photo', 'public_photo', 'library_photo', 'client_photo', 'product_photo')
    OR (p_kind IN ('clinic_logo', 'public_photo') AND p_subject_ref IS NOT NULL)
    OR (p_kind IN ('professional_photo', 'library_photo', 'client_photo', 'product_photo') AND p_subject_ref IS NULL) THEN
    RAISE EXCEPTION 'Invalid media upload' USING ERRCODE = '22023';
  END IF;
  v_permission := CASE p_kind WHEN 'professional_photo' THEN 'professional:manage'
    WHEN 'library_photo' THEN 'media:manage' WHEN 'client_photo' THEN 'client:manage' WHEN 'product_photo' THEN 'inventory:manage'
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
    WHEN 'library_photo' THEN 'media:manage' WHEN 'client_photo' THEN 'client:manage' WHEN 'product_photo' THEN 'inventory:manage'
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
      WHEN v_asset.kind = 'product_photo' THEN 'inventory/' || v_asset.subject_ref::text
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


-- Same as 0027, plus the package and the photo. `photoAssetId` must be a ready product photo of
-- this clinic uploaded for this product.
CREATE OR REPLACE FUNCTION luminix.save_inventory_item(p_clinic uuid, p_item jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_id uuid; v_member uuid; v_initial numeric; v_photo uuid; v_size numeric; v_unit text;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR jsonb_typeof(p_item) IS DISTINCT FROM 'object'
    OR coalesce(p_item->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR length(coalesce(btrim(p_item->>'name'), '')) NOT BETWEEN 1 AND 120
    OR length(coalesce(p_item->>'category', '')) > 60
    OR coalesce(p_item->>'unit', '') NOT IN ('un', 'ml', 'l', 'g', 'kg', 'cx', 'fr', 'par')
    OR coalesce(p_item->>'minQuantity', '') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$'
    OR (nullif(p_item->>'costCents', '') IS NOT NULL AND p_item->>'costCents' !~ '^[0-9]{1,9}$')
    OR (p_item ? 'initialQuantity' AND coalesce(p_item->>'initialQuantity', '') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$')
    OR (nullif(p_item->>'packageSize', '') IS NOT NULL
      AND (p_item->>'packageSize' !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$' OR (p_item->>'packageSize')::numeric <= 0
        OR coalesce(p_item->>'packageUnit', '') NOT IN ('ml', 'g', 'un')))
    OR (nullif(p_item->>'photoAssetId', '') IS NOT NULL AND p_item->>'photoAssetId' !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'Invalid inventory item' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'inventory:manage') a;
  v_id := (p_item->>'id')::uuid;
  v_size := nullif(p_item->>'packageSize', '')::numeric;
  v_unit := CASE WHEN v_size IS NULL THEN NULL ELSE p_item->>'packageUnit' END;
  v_photo := nullif(p_item->>'photoAssetId', '')::uuid;
  IF v_photo IS NOT NULL THEN
    PERFORM 1 FROM luminix.media_assets WHERE clinic_id = p_clinic AND id = v_photo
      AND kind = 'product_photo' AND subject_ref = v_id AND status = 'ready';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid product photo' USING ERRCODE = '22023'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM luminix.inventory_items WHERE clinic_id = p_clinic AND id = v_id) THEN
    UPDATE luminix.inventory_items SET name = btrim(p_item->>'name'),
        category = nullif(btrim(p_item->>'category'), ''), unit = p_item->>'unit',
        min_quantity = (p_item->>'minQuantity')::numeric,
        cost_cents = nullif(p_item->>'costCents', '')::integer,
        package_size = v_size, package_unit = v_unit, photo_asset_id = v_photo, updated_at = now()
      WHERE clinic_id = p_clinic AND id = v_id;
  ELSE
    v_initial := coalesce(nullif(p_item->>'initialQuantity', '')::numeric, 0);
    INSERT INTO luminix.inventory_items (id, clinic_id, name, category, unit, quantity, min_quantity,
        cost_cents, package_size, package_unit, photo_asset_id)
      VALUES (v_id, p_clinic, btrim(p_item->>'name'), nullif(btrim(p_item->>'category'), ''),
        p_item->>'unit', v_initial, (p_item->>'minQuantity')::numeric,
        nullif(p_item->>'costCents', '')::integer, v_size, v_unit, v_photo);
    IF v_initial > 0 THEN
      INSERT INTO luminix.inventory_movements (clinic_id, item_id, kind, quantity, balance, note, created_by_membership_id)
        VALUES (p_clinic, v_id, 'in', v_initial, v_initial, 'Estoque inicial', v_member);
    END IF;
  END IF;
  RETURN v_id;
END $$;
