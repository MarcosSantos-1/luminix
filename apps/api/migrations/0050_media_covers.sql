-- Mídia como explorador de arquivos: cada pasta traz a última foto como capa.

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
        -- Latest photo, as the folder's cover in the explorer.
        'cover', (SELECT a.small_object_key FROM luminix.media_items i
          JOIN luminix.media_assets a ON a.clinic_id = i.clinic_id AND a.id = i.asset_id
          WHERE i.clinic_id = p_clinic AND i.folder_id = f.id AND i.status = 'active'
          ORDER BY i.created_at DESC LIMIT 1),
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

