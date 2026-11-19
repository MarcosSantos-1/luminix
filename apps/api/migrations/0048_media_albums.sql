-- Mídia mais organizada:
-- 1. Uma pasta por cliente, dentro de "Clientes" (parent_id + client_id), criada sozinha quando a
--    equipe guarda fotos de um atendimento.
-- 2. "Para organizar" (system_key inbox): onde caem as fotos soltas enviadas sem escolher pasta.
-- 3. Uma foto pode aparecer também em outras pastas (media_item_links), sem duplicar o arquivo.

ALTER TABLE luminix.media_folders
  DROP CONSTRAINT media_folders_system_key_check,
  ADD CONSTRAINT media_folders_system_key_check CHECK (system_key IS NULL OR system_key IN
    ('clients', 'before_after', 'marketing', 'space', 'team', 'inbox')),
  ADD COLUMN parent_id uuid,
  ADD COLUMN client_id uuid,
  ADD FOREIGN KEY (clinic_id, parent_id) REFERENCES luminix.media_folders(clinic_id, id),
  ADD FOREIGN KEY (clinic_id, client_id) REFERENCES luminix.clinic_clients(clinic_id, id);
CREATE UNIQUE INDEX media_folders_client ON luminix.media_folders(clinic_id, client_id)
  WHERE client_id IS NOT NULL;
-- Names are unique among siblings (two clients may share a name with a user folder).
DROP INDEX luminix.media_folders_name;
CREATE UNIQUE INDEX media_folders_name ON luminix.media_folders(
  clinic_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)))
  WHERE status = 'active';

CREATE TABLE luminix.media_item_links (
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  item_id uuid NOT NULL,
  folder_id uuid NOT NULL,
  PRIMARY KEY (clinic_id, item_id, folder_id),
  FOREIGN KEY (clinic_id, item_id) REFERENCES luminix.media_items(clinic_id, id),
  FOREIGN KEY (clinic_id, folder_id) REFERENCES luminix.media_folders(clinic_id, id)
);
CREATE INDEX media_item_links_folder ON luminix.media_item_links(clinic_id, folder_id);
ALTER TABLE luminix.media_item_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.media_item_links FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.media_item_links
  USING (clinic_id = luminix.current_clinic_id())
  WITH CHECK (clinic_id = luminix.current_clinic_id());
CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.media_item_links
  FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.media_item_links
  FOR EACH ROW EXECUTE FUNCTION luminix.audit_change();
REVOKE ALL ON luminix.media_item_links FROM PUBLIC;
GRANT SELECT ON luminix.media_item_links TO luminix_api;

CREATE OR REPLACE FUNCTION luminix.ensure_media_folders(p_clinic uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  INSERT INTO luminix.media_folders (clinic_id, name, system_key, position) VALUES
    (p_clinic, 'Para organizar', 'inbox', 5),
    (p_clinic, 'Clientes', 'clients', 10),
    (p_clinic, 'Antes e depois', 'before_after', 20),
    (p_clinic, 'Marketing', 'marketing', 30),
    (p_clinic, 'Espaço', 'space', 40),
    (p_clinic, 'Equipe', 'team', 50)
  ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION luminix.ensure_media_folders(uuid) FROM PUBLIC;

-- Folders (with parent, client and the photos in it or linked to it) and the stored bytes.
CREATE OR REPLACE FUNCTION luminix.read_media_library(p_clinic uuid)
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
        'parentId', f.parent_id, 'clientId', f.client_id,
        'count', (SELECT count(*) FROM luminix.media_items i
          WHERE i.clinic_id = p_clinic AND i.status = 'active'
            AND (i.folder_id = f.id OR EXISTS (SELECT 1 FROM luminix.media_item_links l
              WHERE l.clinic_id = i.clinic_id AND l.item_id = i.id AND l.folder_id = f.id))))
        ORDER BY f.position, lower(f.name), f.created_at)
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

-- The client's own folder inside "Clientes", created on first use (media:manage).
CREATE FUNCTION luminix.client_media_folder(p_clinic uuid, p_client uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_id uuid; v_parent uuid; v_name text;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_client IS NULL THEN
    RAISE EXCEPTION 'Invalid folder' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'media:manage') a;
  SELECT id INTO v_id FROM luminix.media_folders
    WHERE clinic_id = p_clinic AND client_id = p_client;
  IF v_id IS NOT NULL THEN
    UPDATE luminix.media_folders SET status = 'active' WHERE clinic_id = p_clinic AND id = v_id;
    RETURN v_id;
  END IF;
  SELECT left(btrim(display_name), 48) INTO v_name FROM luminix.clinic_clients
    WHERE clinic_id = p_clinic AND id = p_client;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Client unavailable' USING ERRCODE = '22023'; END IF;
  PERFORM luminix.ensure_media_folders(p_clinic);
  SELECT id INTO v_parent FROM luminix.media_folders WHERE clinic_id = p_clinic AND system_key = 'clients';
  -- Two clients with the same name get the start of their id to tell them apart.
  IF EXISTS (SELECT 1 FROM luminix.media_folders WHERE clinic_id = p_clinic AND parent_id = v_parent
      AND status = 'active' AND lower(btrim(name)) = lower(v_name)) THEN
    v_name := v_name || ' · ' || left(p_client::text, 4);
  END IF;
  INSERT INTO luminix.media_folders (clinic_id, name, parent_id, client_id, position, created_by_membership_id)
    VALUES (p_clinic, v_name, v_parent, p_client, 100, v_member) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION luminix.client_media_folder(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.client_media_folder(uuid, uuid) TO luminix_api;

-- Same as 0026; a photo saved in a client's folder also records the client.
CREATE OR REPLACE FUNCTION luminix.add_media_item(p_clinic uuid, p_folder uuid, p_asset uuid, p_title text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_id uuid; v_client uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR length(coalesce(p_title, '')) > 120 THEN
    RAISE EXCEPTION 'Invalid media item' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'media:manage') a;
  SELECT client_id INTO v_client FROM luminix.media_folders
    WHERE clinic_id = p_clinic AND id = p_folder AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Folder unavailable' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM luminix.media_assets WHERE clinic_id = p_clinic AND id = p_asset
    AND kind = 'library_photo' AND status = 'ready';
  IF NOT FOUND THEN RAISE EXCEPTION 'Media unavailable' USING ERRCODE = '22023'; END IF;
  INSERT INTO luminix.media_items (clinic_id, folder_id, asset_id, client_id, title, created_by_membership_id)
    VALUES (p_clinic, p_folder, p_asset, v_client, nullif(btrim(p_title), ''), v_member) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- The other folders where a photo also appears (its own folder stays its home).
CREATE FUNCTION luminix.set_media_item_links(p_clinic uuid, p_item uuid, p_folders uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_home uuid; v_count integer;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_folders IS NULL
    OR cardinality(p_folders) > 30 THEN
    RAISE EXCEPTION 'Invalid media change' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'media:manage');
  SELECT folder_id INTO v_home FROM luminix.media_items WHERE clinic_id = p_clinic AND id = p_item;
  IF v_home IS NULL THEN RAISE EXCEPTION 'Media item not found' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_folders) wanted(id) WHERE NOT EXISTS (
      SELECT 1 FROM luminix.media_folders f WHERE f.clinic_id = p_clinic AND f.id = wanted.id
        AND f.status = 'active')) THEN
    RAISE EXCEPTION 'Folder unavailable' USING ERRCODE = '22023';
  END IF;
  DELETE FROM luminix.media_item_links WHERE clinic_id = p_clinic AND item_id = p_item
    AND NOT (folder_id = ANY (p_folders));
  INSERT INTO luminix.media_item_links (clinic_id, item_id, folder_id)
    SELECT DISTINCT p_clinic, p_item, wanted.id FROM unnest(p_folders) wanted(id)
     WHERE wanted.id <> v_home
    ON CONFLICT DO NOTHING;
  SELECT count(*) INTO v_count FROM luminix.media_item_links WHERE clinic_id = p_clinic AND item_id = p_item;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION luminix.set_media_item_links(uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_media_item_links(uuid, uuid, uuid[]) TO luminix_api;

-- Same as 0026, but the 60-folder limit counts only the folders people create (not clients').
CREATE OR REPLACE FUNCTION luminix.save_media_folder(p_clinic uuid, p_folder uuid, p_name text)
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
    IF (SELECT count(*) FROM luminix.media_folders WHERE clinic_id = p_clinic AND status = 'active'
        AND client_id IS NULL) >= 60 THEN
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
