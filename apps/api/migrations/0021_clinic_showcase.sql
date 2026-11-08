-- Public content is opt-in through the existing clinic publication gate.
ALTER TABLE luminix.clinic_profiles ADD COLUMN public_showcase jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE luminix.media_assets
  DROP CONSTRAINT media_assets_kind_check,
  DROP CONSTRAINT media_assets_check,
  ADD CHECK (kind IN ('clinic_logo', 'professional_photo', 'public_photo')),
  ADD CHECK (
    (kind IN ('clinic_logo', 'public_photo') AND subject_ref IS NULL)
    OR (kind = 'professional_photo' AND subject_ref IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION luminix.begin_media_upload(p_clinic uuid, p_kind text, p_subject_ref uuid DEFAULT NULL)
RETURNS TABLE (asset_id uuid, asset_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_asset uuid; v_permission text;
BEGIN
  IF p_clinic IS DISTINCT FROM nullif(current_setting('luminix.clinic_id', true), '')::uuid
    OR p_kind NOT IN ('clinic_logo', 'professional_photo', 'public_photo')
    OR (p_kind IN ('clinic_logo', 'public_photo') AND p_subject_ref IS NOT NULL)
    OR (p_kind = 'professional_photo' AND p_subject_ref IS NULL) THEN
    RAISE EXCEPTION 'Invalid media upload' USING ERRCODE = '22023';
  END IF;
  v_permission := CASE WHEN p_kind = 'professional_photo' THEN 'professional:manage' ELSE 'settings:manage' END;
  SELECT membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, v_permission);
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
  v_permission := CASE WHEN v_asset.kind = 'professional_photo' THEN 'professional:manage' ELSE 'settings:manage' END;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, v_permission);
  v_module := CASE WHEN v_asset.kind = 'clinic_logo' THEN 'branding/logo' WHEN v_asset.kind = 'public_photo' THEN 'showcase' ELSE 'team/' || v_asset.subject_ref::text END;
  v_small := p_clinic::text || '/' || v_module || '/' || p_asset::text || '/small-128.webp';
  v_large := p_clinic::text || '/' || v_module || '/' || p_asset::text || '/large-512.webp';
  UPDATE luminix.media_assets SET status = 'superseded'
    WHERE clinic_id = p_clinic AND kind = v_asset.kind
      AND v_asset.kind <> 'public_photo' AND subject_ref IS NOT DISTINCT FROM v_asset.subject_ref AND status = 'ready';
  UPDATE luminix.media_assets SET status = 'ready', small_object_key = v_small, large_object_key = v_large,
    small_bytes = p_small_bytes, large_bytes = p_large_bytes, ready_at = now()
    WHERE clinic_id = p_clinic AND id = p_asset;
  RETURN QUERY SELECT p_asset, 'ready'::text, v_small, v_large;
END $$;

CREATE FUNCTION luminix.set_public_showcase(p_clinic uuid, p_showcase jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  IF NOT EXISTS (SELECT 1 FROM luminix.clinics WHERE id = p_clinic AND status = 'active')
    OR jsonb_typeof(p_showcase) IS DISTINCT FROM 'object'
    OR coalesce(p_showcase->>'style', '') NOT IN ('classic', 'hair-salon')
    OR jsonb_typeof(p_showcase->'subtitle') IS DISTINCT FROM 'string'
    OR length(p_showcase->>'subtitle') > 120
    OR jsonb_typeof(p_showcase->'featured') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_showcase->'gallery') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'Invalid showcase' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_showcase->'featured') > 4
    OR jsonb_array_length(p_showcase->'gallery') > 24
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_showcase->'featured') f(item)
      WHERE NOT EXISTS (SELECT 1 FROM luminix.services s
        WHERE s.clinic_id = p_clinic AND s.id = (f.item->>'serviceId')::uuid AND s.status = 'active')
    )
    OR EXISTS (
      SELECT 1 FROM (
        SELECT g.id FROM jsonb_array_elements_text(p_showcase->'gallery') g(id)
        UNION ALL
        SELECT f.item->>'assetId' FROM jsonb_array_elements(p_showcase->'featured') f(item)
        WHERE f.item->>'assetId' IS NOT NULL
      ) assets
      WHERE NOT EXISTS (SELECT 1 FROM luminix.media_assets m
        WHERE m.clinic_id = p_clinic AND m.id = assets.id::uuid
          AND m.kind = 'public_photo' AND m.status = 'ready')
    )
    OR (SELECT count(DISTINCT f.item->>'serviceId') FROM jsonb_array_elements(p_showcase->'featured') f(item))
      <> jsonb_array_length(p_showcase->'featured')
    OR (SELECT count(DISTINCT g.id) FROM jsonb_array_elements_text(p_showcase->'gallery') g(id))
      <> jsonb_array_length(p_showcase->'gallery')
  THEN
    RAISE EXCEPTION 'Invalid showcase references' USING ERRCODE = '22023';
  END IF;
  UPDATE luminix.clinic_profiles SET public_showcase = p_showcase, updated_at = now()
    WHERE clinic_id = p_clinic;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile unavailable' USING ERRCODE = '22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.set_public_showcase(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_public_showcase(uuid, jsonb) TO luminix_api;

CREATE OR REPLACE FUNCTION luminix.read_public_clinic(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object(
    'slug', c.slug, 'name', c.name, 'theme', s.theme, 'foundedYear', p.founded_year,
    'logoKey', logo.large_object_key,
    'subtitle', p.public_showcase->>'subtitle',
    'style', p.public_showcase->>'style',
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
    'whatsapp', CASE WHEN p.public_contacts THEN p.whatsapp_phone ELSE NULL END,
    'instagram', CASE WHEN p.public_contacts THEN p.instagram ELSE NULL END,
    'facebook', CASE WHEN p.public_contacts THEN p.facebook ELSE NULL END,
    'website', CASE WHEN p.public_contacts THEN p.website ELSE NULL END,
    'location', CASE WHEN p.public_address AND l.id IS NOT NULL THEN jsonb_build_object(
      'line', l.address_line, 'number', l.address_number, 'district', l.district,
      'city', l.city, 'state', l.state, 'postalCode', l.postal_code) ELSE NULL END,
    'hours', coalesce((SELECT jsonb_agg(jsonb_build_object('weekday', w.weekday,
      'available', w.is_available, 'periods', w.periods) ORDER BY w.weekday)
      FROM luminix.weekly_availability w WHERE w.clinic_id = c.id), '[]'::jsonb),
    'services', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', svc.id, 'name', svc.name, 'category', coalesce(svc.category, 'Cuidados'),
      'description', svc.description, 'priceCents', svc.price_cents, 'priceType', svc.price_type,
      'durationMinutes', svc.duration_minutes, 'bookingMode', svc.booking_mode
    ) ORDER BY svc.category, svc.name, svc.id) FROM luminix.services svc
      WHERE svc.clinic_id = c.id AND svc.status = 'active'), '[]'::jsonb)
  )
  FROM luminix.clinics c
  JOIN luminix.clinic_profiles p ON p.clinic_id = c.id AND p.public_enabled
  JOIN luminix.clinic_settings s ON s.clinic_id = c.id
  LEFT JOIN luminix.locations l ON l.clinic_id = c.id AND l.is_primary
  LEFT JOIN luminix.media_assets logo ON logo.clinic_id = c.id AND logo.id = p.logo_asset_id
    AND logo.status = 'ready' AND logo.kind = 'clinic_logo'
  WHERE c.slug = p_slug AND c.status = 'active'
$$;
