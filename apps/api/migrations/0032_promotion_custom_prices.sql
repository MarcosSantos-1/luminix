-- Promotions with a hand-picked price per service ("valor por serviço"), besides the percent
-- kind. The effective price now comes from service_promotion itself, so the appointment price
-- snapshot, the admin catalog and the public site always agree.

ALTER TABLE luminix.promotions
  ADD COLUMN kind text NOT NULL DEFAULT 'percent' CHECK (kind IN ('percent', 'custom'));
ALTER TABLE luminix.promotion_services
  ADD COLUMN price_cents integer CHECK (price_cents IS NULL OR price_cents BETWEEN 1 AND 100000000);

-- Best (cheapest) active promotion for a service on a date. Quote-priced services are never
-- discounted, and a custom price that is no longer below the catalog price is ignored.
DROP FUNCTION luminix.service_promotion(uuid, uuid, date);
CREATE FUNCTION luminix.service_promotion(p_clinic uuid, p_service uuid, p_on date)
RETURNS TABLE (promotion_id uuid, percent integer, ends_on date, show_on_site boolean, price_cents integer)
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT p.id,
         CASE WHEN ps.price_cents IS NULL THEN p.percent
              ELSE greatest(1, round(100 - ps.price_cents * 100.0 / s.price_cents))::integer END,
         p.ends_on, p.show_on_site,
         coalesce(ps.price_cents, round(s.price_cents * (100 - p.percent) / 100.0)::integer) AS final_cents
    FROM luminix.promotions p
    JOIN luminix.promotion_services ps ON ps.clinic_id = p.clinic_id AND ps.promotion_id = p.id
    JOIN luminix.services s ON s.clinic_id = p.clinic_id AND s.id = ps.service_id
   WHERE p.clinic_id = p_clinic AND ps.service_id = p_service AND p.status = 'active'
     AND s.price_type <> 'quote' AND p.starts_on <= p_on AND (p.ends_on IS NULL OR p.ends_on >= p_on)
     AND (ps.price_cents IS NULL OR ps.price_cents < s.price_cents)
   ORDER BY final_cents, p.created_at
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION luminix.service_promotion(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.service_promotion(uuid, uuid, date) TO luminix_api;

CREATE OR REPLACE FUNCTION luminix.snapshot_appointment_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_price integer; v_promo record;
BEGIN
  SELECT price_cents INTO v_price FROM luminix.services WHERE clinic_id = NEW.clinic_id AND id = NEW.service_id;
  SELECT * INTO v_promo FROM luminix.service_promotion(NEW.clinic_id, NEW.service_id,
    (NEW.starts_at AT TIME ZONE 'America/Sao_Paulo')::date);
  NEW.list_price_cents := v_price;
  NEW.promotion_id := v_promo.promotion_id;
  NEW.price_cents := coalesce(v_promo.price_cents, v_price);
  RETURN NEW;
END $$;

-- `kind` = 'custom' reads the price of each service from `prices` ({serviceId: cents}); every
-- price must be a real discount on a service that has a price. `percent` is still stored (the
-- largest discount, sent by the caller) because lists and the activity feed summarize with it.
CREATE OR REPLACE FUNCTION luminix.save_promotion(p_clinic uuid, p_promotion jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_id uuid; v_service uuid; v_kind text := coalesce(p_promotion->>'kind', 'percent');
  v_price integer; v_list integer; v_type text;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR jsonb_typeof(p_promotion) IS DISTINCT FROM 'object'
    OR coalesce(p_promotion->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR length(coalesce(btrim(p_promotion->>'name'), '')) NOT BETWEEN 1 AND 80
    OR v_kind NOT IN ('percent', 'custom')
    OR (v_kind = 'custom' AND jsonb_typeof(p_promotion->'prices') IS DISTINCT FROM 'object')
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
  INSERT INTO luminix.promotions (id, clinic_id, name, kind, percent, starts_on, ends_on, status, show_on_site)
    VALUES (v_id, p_clinic, btrim(p_promotion->>'name'), v_kind, (p_promotion->>'percent')::integer,
      (p_promotion->>'startsOn')::date, nullif(p_promotion->>'endsOn', '')::date,
      p_promotion->>'status', (p_promotion->>'showOnSite')::boolean)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, percent = EXCLUDED.percent,
      starts_on = EXCLUDED.starts_on, ends_on = EXCLUDED.ends_on, status = EXCLUDED.status,
      show_on_site = EXCLUDED.show_on_site, updated_at = now()
    WHERE luminix.promotions.clinic_id = p_clinic;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid promotion' USING ERRCODE = '22023'; END IF;
  DELETE FROM luminix.promotion_services WHERE clinic_id = p_clinic AND promotion_id = v_id;
  FOR v_service IN SELECT (value #>> '{}')::uuid FROM jsonb_array_elements(p_promotion->'serviceIds') LOOP
    SELECT price_cents, price_type INTO v_list, v_type FROM luminix.services
      WHERE clinic_id = p_clinic AND id = v_service AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid promotion service' USING ERRCODE = '22023'; END IF;
    v_price := NULL;
    IF v_kind = 'custom' THEN
      IF coalesce(p_promotion->'prices'->>(v_service::text), '') !~ '^[0-9]{1,9}$' THEN
        RAISE EXCEPTION 'Invalid promotion price' USING ERRCODE = '22023';
      END IF;
      v_price := (p_promotion->'prices'->>(v_service::text))::integer;
      IF v_type = 'quote' OR v_price < 1 OR v_price >= v_list THEN
        RAISE EXCEPTION 'Invalid promotion price' USING ERRCODE = '22023';
      END IF;
    END IF;
    INSERT INTO luminix.promotion_services (clinic_id, promotion_id, service_id, price_cents)
      VALUES (p_clinic, v_id, v_service, v_price) ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN v_id;
END $$;

-- Public projection: same as 0027, with the promo price read from service_promotion.
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
      'promoPriceCents', promo.price_cents
    ) ORDER BY svc.category, svc.name, svc.id) FROM luminix.services svc
      LEFT JOIN LATERAL (SELECT sp.percent, sp.ends_on, sp.price_cents
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
