-- Keep the suggested cover stable once onboarding has activated the clinic.
ALTER TABLE luminix.clinic_profiles ADD COLUMN initial_public_hero text;

CREATE FUNCTION luminix.infer_public_hero(p_clinic uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  WITH services AS (
    SELECT audience, translate(lower(category), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') AS label
    FROM luminix.services
    WHERE clinic_id = p_clinic AND status = 'active'
  ), categorized AS (
    SELECT audience, CASE
      WHEN label ~ 'tatuag|tattoo' THEN 'tatuagem'
      WHEN label ~ 'piercing' THEN 'piercing'
      WHEN label ~ 'cabel|capilar|barbear|barbeiro' THEN 'cabelo'
      WHEN label ~ 'avancad|biomedic|harmoniza' THEN 'estetica-avancada'
      WHEN label ~ 'facial' THEN 'estetica-facial'
      WHEN label ~ 'corporal' THEN 'estetica-corporal'
      WHEN label ~ 'depil' THEN 'depilacao'
      WHEN label ~ 'sobrancelha' THEN 'sobrancelhas'
      WHEN label ~ 'cilio' THEN 'cilios'
      WHEN label ~ 'quiropr' THEN 'quiropraxia'
      WHEN label ~ 'massag|massoterap' THEN 'massoterapia'
      WHEN label ~ 'unha|nail|manicure|pedicure' THEN 'unhas'
      WHEN label ~ 'estetica' THEN 'estetica-facial'
    END AS category FROM services
  ), totals AS (
    SELECT category, count(*) AS total, bool_and(audience = 'men') AS men_only
    FROM categorized WHERE category IS NOT NULL GROUP BY category
  ), families AS (
    SELECT totals.*, CASE
      WHEN category LIKE 'estetica-%' THEN 'estetica'
      WHEN category IN ('depilacao', 'massoterapia', 'quiropraxia')
        AND EXISTS (SELECT 1 FROM totals t WHERE t.category LIKE 'estetica-%') THEN 'estetica'
      WHEN category IN ('sobrancelhas', 'cilios')
        AND EXISTS (SELECT 1 FROM totals WHERE category = 'depilacao')
        AND NOT EXISTS (SELECT 1 FROM totals t WHERE t.category LIKE 'estetica-%') THEN 'depilacao'
      WHEN category IN ('sobrancelhas', 'cilios') THEN 'olhar'
      WHEN category IN ('massoterapia', 'quiropraxia') THEN 'terapias'
      WHEN category IN ('tatuagem', 'piercing') THEN 'ink'
      ELSE category
    END AS family FROM totals
  )
  SELECT CASE family
    WHEN 'cabelo' THEN CASE WHEN bool_and(men_only) AND
      (SELECT default_audience FROM luminix.clinic_profiles WHERE clinic_id = p_clinic) = 'men'
      THEN 'barbearia' ELSE 'cabelo' END
    WHEN 'estetica' THEN CASE
      WHEN bool_or(category = 'estetica-avancada') THEN 'estetica-avancada'
      WHEN bool_and(category = 'estetica-corporal') THEN 'estetica-corporal'
      ELSE 'estetica-facial' END
    WHEN 'olhar' THEN CASE WHEN bool_or(category = 'sobrancelhas') THEN 'sobrancelhas' ELSE 'cilios' END
    WHEN 'terapias' THEN CASE WHEN bool_or(category = 'massoterapia') THEN 'massoterapia' ELSE 'quiropraxia' END
    WHEN 'ink' THEN CASE WHEN coalesce(sum(total) FILTER (WHERE category = 'piercing'), 0)
      > coalesce(sum(total) FILTER (WHERE category = 'tatuagem'), 0)
      THEN 'piercing' ELSE 'tatuagem' END
    ELSE family
  END
  FROM families GROUP BY family
  ORDER BY sum(total) DESC,
    array_position(ARRAY['cabelo','estetica','depilacao','olhar','terapias','ink','unhas'], family)
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION luminix.infer_public_hero(uuid) FROM PUBLIC;

CREATE FUNCTION luminix.save_initial_public_hero()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  UPDATE luminix.clinic_profiles SET initial_public_hero = luminix.infer_public_hero(NEW.id)
    WHERE clinic_id = NEW.id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION luminix.save_initial_public_hero() FROM PUBLIC;

CREATE TRIGGER save_initial_public_hero AFTER UPDATE OF status ON luminix.clinics
FOR EACH ROW WHEN (OLD.status = 'draft' AND NEW.status = 'active')
EXECUTE FUNCTION luminix.save_initial_public_hero();

UPDATE luminix.clinic_profiles p SET initial_public_hero = luminix.infer_public_hero(p.clinic_id)
  FROM luminix.clinics c WHERE c.id = p.clinic_id AND c.status IN ('active', 'suspended');

CREATE OR REPLACE FUNCTION luminix.set_public_showcase(p_clinic uuid, p_showcase jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  IF NOT EXISTS (SELECT 1 FROM luminix.clinics WHERE id = p_clinic AND status = 'active')
    OR jsonb_typeof(p_showcase) IS DISTINCT FROM 'object'
    OR coalesce(p_showcase->>'style', '') NOT IN ('classic', 'hair-salon', 'standard')
    OR jsonb_typeof(p_showcase->'subtitle') IS DISTINCT FROM 'string'
    OR length(p_showcase->>'subtitle') > 120
    OR (p_showcase ? 'title' AND (jsonb_typeof(p_showcase->'title') IS DISTINCT FROM 'string'
      OR length(p_showcase->>'title') > 100))
    OR (p_showcase ? 'theme' AND coalesce(p_showcase->>'theme', '_') NOT IN
      ('', 'rosa', 'grafite', 'violeta', 'dourado', 'esmeralda', 'azul'))
    OR (p_showcase ? 'heroCategory' AND coalesce(p_showcase->>'heroCategory', '_') NOT IN
      ('', 'cabelo', 'barbearia', 'estetica-avancada', 'estetica-facial', 'estetica-corporal',
       'depilacao', 'massoterapia', 'quiropraxia', 'sobrancelhas', 'cilios', 'unhas', 'tatuagem', 'piercing'))
    OR jsonb_typeof(p_showcase->'featured') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_showcase->'gallery') IS DISTINCT FROM 'array'
    OR (p_showcase ? 'servicePhotos' AND jsonb_typeof(p_showcase->'servicePhotos') IS DISTINCT FROM 'array')
  THEN
    RAISE EXCEPTION 'Invalid showcase' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_showcase->'featured') > 4
    OR jsonb_array_length(p_showcase->'gallery') > 24
    OR jsonb_array_length(p_showcase->'servicePhotos') > 80
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_showcase->'servicePhotos') f(item)
      WHERE f.item->>'assetId' IS NULL OR NOT EXISTS (SELECT 1 FROM luminix.services s
        WHERE s.clinic_id = p_clinic AND s.id = (f.item->>'serviceId')::uuid AND s.status = 'active')
    )
    OR (SELECT count(DISTINCT f.item->>'serviceId') FROM jsonb_array_elements(p_showcase->'servicePhotos') f(item))
      <> coalesce(jsonb_array_length(p_showcase->'servicePhotos'), 0)
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
        UNION ALL
        SELECT f.item->>'assetId' FROM jsonb_array_elements(p_showcase->'servicePhotos') f(item)
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
  UPDATE luminix.clinic_profiles
    SET public_showcase = public_showcase || p_showcase,
      updated_at = now()
    WHERE clinic_id = p_clinic;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile unavailable' USING ERRCODE = '22023'; END IF;
END $$;

CREATE OR REPLACE FUNCTION luminix.read_public_clinic(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object(
    'slug', c.slug,
    'name', coalesce(nullif(btrim(p.public_showcase->>'title'), ''), c.name),
    'theme', coalesce(nullif(p.public_showcase->>'theme', ''), s.theme),
    'heroCategory', coalesce(nullif(p.public_showcase->>'heroCategory', ''),
      CASE WHEN p.public_showcase->>'style' = 'hair-salon' AND NOT (p.public_showcase ? 'heroCategory')
        THEN 'cabelo' END, p.initial_public_hero),
    'foundedYear', p.founded_year,
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
    'servicePhotos', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'serviceId', svc.id, 'photoKey', m.large_object_key))
      FROM jsonb_array_elements(p.public_showcase->'servicePhotos') f(item)
      JOIN luminix.services svc ON svc.clinic_id = c.id AND svc.id = (f.item->>'serviceId')::uuid AND svc.status = 'active'
      JOIN luminix.media_assets m ON m.clinic_id = c.id AND m.id = (f.item->>'assetId')::uuid
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
