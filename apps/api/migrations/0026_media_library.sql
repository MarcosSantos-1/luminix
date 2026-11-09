-- Media library (Mídia): private photos organized in folders.
-- Library files live in a PRIVATE R2 bucket and are read through short-lived signed URLs.
-- They are never copied to the public showcase bucket automatically.

INSERT INTO luminix.permissions (code, description) VALUES
  ('media:read', 'Ver o acervo de mídia'),
  ('media:manage', 'Enviar e organizar o acervo de mídia')
ON CONFLICT (code) DO NOTHING;

-- Professionals take before/after photos; reception only browses.
CREATE OR REPLACE FUNCTION luminix.role_preset_permissions(p_role text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN ARRAY['clinic:manage', 'team:manage', 'client:read', 'client:manage',
      'professional:manage', 'service:manage', 'settings:manage', 'onboarding:manage',
      'audit:read', 'agenda:read', 'agenda:manage', 'media:read', 'media:manage']
    WHEN 'manager' THEN ARRAY['clinic:manage', 'team:manage', 'client:read', 'client:manage',
      'professional:manage', 'service:manage', 'settings:manage', 'audit:read',
      'agenda:read', 'agenda:manage', 'media:read', 'media:manage']
    WHEN 'reception' THEN ARRAY['client:read', 'client:manage', 'agenda:read', 'agenda:manage',
      'media:read']
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

-- Storage record: a new kind; subject_ref is the folder at upload time.
DO $$
DECLARE v_name text;
BEGIN
  -- The subject rule was added without a name in 0021; find it by definition.
  FOR v_name IN SELECT conname FROM pg_constraint
      WHERE conrelid = 'luminix.media_assets'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%subject_ref%' LOOP
    EXECUTE format('ALTER TABLE luminix.media_assets DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;
ALTER TABLE luminix.media_assets
  DROP CONSTRAINT media_assets_kind_check,
  ADD CONSTRAINT media_assets_kind_check
    CHECK (kind IN ('clinic_logo', 'professional_photo', 'public_photo', 'library_photo')),
  ADD CONSTRAINT media_assets_subject_check CHECK (
    (kind IN ('clinic_logo', 'public_photo') AND subject_ref IS NULL)
    OR (kind IN ('professional_photo', 'library_photo') AND subject_ref IS NOT NULL)
  );

CREATE TABLE luminix.media_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  system_key text CHECK (system_key IS NULL OR system_key IN
    ('clients', 'before_after', 'marketing', 'space', 'team')),
  position integer NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  FOREIGN KEY (clinic_id, created_by_membership_id) REFERENCES luminix.clinic_memberships(clinic_id, id)
);
CREATE UNIQUE INDEX media_folders_system ON luminix.media_folders(clinic_id, system_key)
  WHERE system_key IS NOT NULL;
CREATE UNIQUE INDEX media_folders_name ON luminix.media_folders(clinic_id, lower(btrim(name)))
  WHERE status = 'active';

-- Library metadata. client_id prepares per-client albums and before/after pairs.
CREATE TABLE luminix.media_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  folder_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  client_id uuid,
  title text CHECK (title IS NULL OR length(title) <= 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trashed')),
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  trashed_at timestamptz,
  UNIQUE (clinic_id, id),
  UNIQUE (clinic_id, asset_id),
  FOREIGN KEY (clinic_id, folder_id) REFERENCES luminix.media_folders(clinic_id, id),
  FOREIGN KEY (clinic_id, asset_id) REFERENCES luminix.media_assets(clinic_id, id),
  FOREIGN KEY (clinic_id, client_id) REFERENCES luminix.clinic_clients(clinic_id, id),
  FOREIGN KEY (clinic_id, created_by_membership_id) REFERENCES luminix.clinic_memberships(clinic_id, id)
);
CREATE INDEX media_items_folder ON luminix.media_items(clinic_id, folder_id, status, created_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['media_folders', 'media_items'] LOOP
    EXECUTE format('ALTER TABLE luminix.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE luminix.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY clinic_scope ON luminix.%I USING (clinic_id = luminix.current_clinic_id()) WITH CHECK (clinic_id = luminix.current_clinic_id())', table_name);
    EXECUTE format('CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.%I FOR EACH ROW EXECUTE FUNCTION luminix.audit_change()', table_name);
    EXECUTE format('CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.%I FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move()', table_name);
  END LOOP;
END $$;
REVOKE ALL ON luminix.media_folders, luminix.media_items FROM PUBLIC;
GRANT SELECT ON luminix.media_folders, luminix.media_items TO luminix_api;

CREATE FUNCTION luminix.ensure_media_folders(p_clinic uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  INSERT INTO luminix.media_folders (clinic_id, name, system_key, position) VALUES
    (p_clinic, 'Clientes', 'clients', 10),
    (p_clinic, 'Antes e depois', 'before_after', 20),
    (p_clinic, 'Marketing', 'marketing', 30),
    (p_clinic, 'Espaço', 'space', 40),
    (p_clinic, 'Equipe', 'team', 50)
  ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION luminix.ensure_media_folders(uuid) FROM PUBLIC;

-- Lists folders with counts and the clinic's stored bytes (all images, library and public).
CREATE FUNCTION luminix.read_media_library(p_clinic uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'media:read');
  PERFORM luminix.ensure_media_folders(p_clinic);
  RETURN jsonb_build_object(
    'folders', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'systemKey', f.system_key,
        'count', (SELECT count(*) FROM luminix.media_items i
          WHERE i.clinic_id = p_clinic AND i.folder_id = f.id AND i.status = 'active'))
        ORDER BY f.position, f.created_at)
      FROM luminix.media_folders f WHERE f.clinic_id = p_clinic AND f.status = 'active'), '[]'::jsonb),
    'usage', jsonb_build_object(
      'libraryBytes', (SELECT coalesce(sum(coalesce(a.small_bytes, 0) + coalesce(a.large_bytes, 0)), 0)
        FROM luminix.media_items i JOIN luminix.media_assets a ON a.clinic_id = i.clinic_id AND a.id = i.asset_id
        WHERE i.clinic_id = p_clinic),
      'otherBytes', (SELECT coalesce(sum(coalesce(small_bytes, 0) + coalesce(large_bytes, 0)), 0)
        FROM luminix.media_assets WHERE clinic_id = p_clinic AND status = 'ready' AND kind <> 'library_photo'),
      'items', (SELECT count(*) FROM luminix.media_items WHERE clinic_id = p_clinic AND status = 'active'),
      'trashed', (SELECT count(*) FROM luminix.media_items WHERE clinic_id = p_clinic AND status = 'trashed')
    )
  );
END $$;
REVOKE ALL ON FUNCTION luminix.read_media_library(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.read_media_library(uuid) TO luminix_api;

CREATE FUNCTION luminix.save_media_folder(p_clinic uuid, p_folder uuid, p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_id uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR length(coalesce(btrim(p_name), '')) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Invalid folder' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'media:manage') a;
  IF p_folder IS NULL THEN
    IF (SELECT count(*) FROM luminix.media_folders WHERE clinic_id = p_clinic AND status = 'active') >= 60 THEN
      RAISE EXCEPTION 'Too many folders' USING ERRCODE = '22023';
    END IF;
    INSERT INTO luminix.media_folders (clinic_id, name, created_by_membership_id)
      VALUES (p_clinic, btrim(p_name), v_member) RETURNING id INTO v_id;
  ELSE
    -- System folders keep their names so the app can rely on them.
    UPDATE luminix.media_folders SET name = btrim(p_name)
      WHERE clinic_id = p_clinic AND id = p_folder AND status = 'active' AND system_key IS NULL
      RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Folder unavailable' USING ERRCODE = '22023'; END IF;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION luminix.save_media_folder(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.save_media_folder(uuid, uuid, text) TO luminix_api;

-- Registers a finished upload in a folder.
CREATE FUNCTION luminix.add_media_item(p_clinic uuid, p_folder uuid, p_asset uuid, p_title text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_id uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR length(coalesce(p_title, '')) > 120 THEN
    RAISE EXCEPTION 'Invalid media item' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'media:manage') a;
  PERFORM 1 FROM luminix.media_folders WHERE clinic_id = p_clinic AND id = p_folder AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Folder unavailable' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM luminix.media_assets WHERE clinic_id = p_clinic AND id = p_asset
    AND kind = 'library_photo' AND status = 'ready';
  IF NOT FOUND THEN RAISE EXCEPTION 'Media unavailable' USING ERRCODE = '22023'; END IF;
  INSERT INTO luminix.media_items (clinic_id, folder_id, asset_id, title, created_by_membership_id)
    VALUES (p_clinic, p_folder, p_asset, nullif(btrim(p_title), ''), v_member) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION luminix.add_media_item(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.add_media_item(uuid, uuid, uuid, text) TO luminix_api;

-- Rename, move or send to the trash (restorable). Permanent deletion is a later job.
CREATE FUNCTION luminix.update_media_item(
  p_clinic uuid, p_item uuid, p_folder uuid, p_title text, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR (p_title IS NOT NULL AND length(p_title) > 120)
    OR (p_status IS NOT NULL AND p_status NOT IN ('active', 'trashed')) THEN
    RAISE EXCEPTION 'Invalid media change' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'media:manage');
  IF p_folder IS NOT NULL THEN
    PERFORM 1 FROM luminix.media_folders WHERE clinic_id = p_clinic AND id = p_folder AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Folder unavailable' USING ERRCODE = '22023'; END IF;
  END IF;
  UPDATE luminix.media_items SET
      folder_id = coalesce(p_folder, folder_id),
      title = CASE WHEN p_title IS NULL THEN title ELSE nullif(btrim(p_title), '') END,
      status = coalesce(p_status, status),
      trashed_at = CASE WHEN p_status = 'trashed' THEN now() WHEN p_status = 'active' THEN NULL ELSE trashed_at END
    WHERE clinic_id = p_clinic AND id = p_item;
  IF NOT FOUND THEN RAISE EXCEPTION 'Media item not found' USING ERRCODE = '22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.update_media_item(uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.update_media_item(uuid, uuid, uuid, text, text) TO luminix_api;

-- Upload start/finish now cover library photos (subject_ref = folder, media:manage).
CREATE OR REPLACE FUNCTION luminix.begin_media_upload(p_clinic uuid, p_kind text, p_subject_ref uuid DEFAULT NULL)
RETURNS TABLE (asset_id uuid, asset_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_asset uuid; v_permission text;
BEGIN
  IF p_clinic IS DISTINCT FROM nullif(current_setting('luminix.clinic_id', true), '')::uuid
    OR p_kind NOT IN ('clinic_logo', 'professional_photo', 'public_photo', 'library_photo')
    OR (p_kind IN ('clinic_logo', 'public_photo') AND p_subject_ref IS NOT NULL)
    OR (p_kind IN ('professional_photo', 'library_photo') AND p_subject_ref IS NULL) THEN
    RAISE EXCEPTION 'Invalid media upload' USING ERRCODE = '22023';
  END IF;
  v_permission := CASE p_kind WHEN 'professional_photo' THEN 'professional:manage'
    WHEN 'library_photo' THEN 'media:manage' ELSE 'settings:manage' END;
  SELECT membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, v_permission);
  IF p_kind = 'library_photo' THEN
    PERFORM 1 FROM luminix.media_folders WHERE clinic_id = p_clinic AND id = p_subject_ref AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Folder unavailable' USING ERRCODE = '22023'; END IF;
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
    WHEN 'library_photo' THEN 'media:manage' ELSE 'settings:manage' END;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, v_permission);
  IF v_asset.kind = 'library_photo' THEN
    -- Private bucket, larger variants (see media-storage.ts). Folder is only the upload origin.
    v_small := p_clinic::text || '/library/' || p_asset::text || '/small-480.webp';
    v_large := p_clinic::text || '/library/' || p_asset::text || '/large-1600.webp';
  ELSE
    v_module := CASE WHEN v_asset.kind = 'clinic_logo' THEN 'branding/logo' WHEN v_asset.kind = 'public_photo' THEN 'showcase' ELSE 'team/' || v_asset.subject_ref::text END;
    v_small := p_clinic::text || '/' || v_module || '/' || p_asset::text || '/small-128.webp';
    v_large := p_clinic::text || '/' || v_module || '/' || p_asset::text || '/large-512.webp';
    UPDATE luminix.media_assets SET status = 'superseded'
      WHERE clinic_id = p_clinic AND kind = v_asset.kind
        AND v_asset.kind <> 'public_photo' AND subject_ref IS NOT DISTINCT FROM v_asset.subject_ref AND status = 'ready';
  END IF;
  UPDATE luminix.media_assets SET status = 'ready', small_object_key = v_small, large_object_key = v_large,
    small_bytes = p_small_bytes, large_bytes = p_large_bytes, ready_at = now()
    WHERE clinic_id = p_clinic AND id = p_asset;
  RETURN QUERY SELECT p_asset, 'ready'::text, v_small, v_large;
END $$;
