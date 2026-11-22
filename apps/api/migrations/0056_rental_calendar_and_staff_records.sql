-- A normal service returns NULL; a rental-dependent service without dates returns an empty array.
CREATE FUNCTION luminix.service_rental_days(p_clinic uuid, p_service uuid, p_from date, p_to date)
RETURNS text[] LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  WITH equipment AS (
    SELECT r.id, r.status FROM luminix.service_resources sr
      JOIN luminix.resources r ON r.clinic_id = sr.clinic_id AND r.id = sr.resource_id
     WHERE sr.clinic_id = p_clinic AND sr.service_id = p_service
       AND r.type = 'equipment' AND r.availability_mode = 'manual_release'
  )
  SELECT CASE WHEN s.booking_mode = 'manual_release' OR EXISTS (SELECT FROM equipment)
    THEN ARRAY(SELECT DISTINCT to_char(d.day, 'YYYY-MM-DD') FROM equipment e
      JOIN luminix.resource_rentals rr ON rr.clinic_id = p_clinic AND rr.resource_id = e.id
      CROSS JOIN LATERAL generate_series(greatest(rr.starts_on, p_from)::timestamp,
        least(rr.ends_on, p_to)::timestamp, interval '1 day') d(day)
      WHERE e.status = 'active' AND rr.ends_on >= p_from AND rr.starts_on <= p_to ORDER BY 1)
    END FROM luminix.services s WHERE s.clinic_id = p_clinic AND s.id = p_service
$$;
REVOKE ALL ON FUNCTION luminix.service_rental_days(uuid,uuid,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.service_rental_days(uuid,uuid,date,date) TO luminix_api;

CREATE FUNCTION luminix.check_appointment_equipment() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE v_from date; v_to date; v_zone text; v_service uuid; v_days text[];
BEGIN
  SELECT timezone INTO v_zone FROM luminix.clinic_settings WHERE clinic_id = NEW.clinic_id;
  v_from := (NEW.starts_at AT TIME ZONE coalesce(v_zone,'America/Sao_Paulo'))::date;
  v_to := ((NEW.ends_at - interval '1 microsecond') AT TIME ZONE coalesce(v_zone,'America/Sao_Paulo'))::date;
  FOR v_service IN SELECT NEW.service_id UNION
    SELECT i.service_id FROM luminix.client_package_items i
      JOIN luminix.client_packages p ON p.clinic_id = i.clinic_id AND p.id = i.client_package_id
     WHERE i.clinic_id = NEW.clinic_id AND p.id = NEW.client_package_id AND p.kind = 'combo'
  LOOP
    v_days := luminix.service_rental_days(NEW.clinic_id, v_service, v_from, v_to);
    IF cardinality(v_days) < v_to - v_from + 1 THEN
      RAISE EXCEPTION 'Equipment unavailable' USING ERRCODE = '55000';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION luminix.check_appointment_equipment() FROM PUBLIC;
CREATE TRIGGER require_rented_equipment BEFORE INSERT OR UPDATE OF starts_at, ends_at, service_id,
  client_package_id ON luminix.appointments FOR EACH ROW EXECUTE FUNCTION luminix.check_appointment_equipment();

CREATE OR REPLACE FUNCTION luminix.client_book_appointment(
  p_clinic uuid, p_client uuid, p_service uuid, p_professional uuid,
  p_starts_at timestamptz, p_ends_at timestamptz, p_payment text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_mode text; v_id uuid;
BEGIN
  IF NOT luminix.client_owns_record(p_clinic, p_client) THEN
    RAISE EXCEPTION 'Client access denied' USING ERRCODE = '42501';
  END IF;
  IF p_starts_at IS NULL OR p_ends_at <= p_starts_at OR p_starts_at <= now() THEN
    RAISE EXCEPTION 'Invalid appointment time' USING ERRCODE = '22023';
  END IF;
  SELECT booking_mode INTO v_mode FROM luminix.services
   WHERE clinic_id = p_clinic AND id = p_service AND status = 'active';
  IF v_mode IS NULL THEN
    RAISE EXCEPTION 'Service unavailable' USING ERRCODE = '22023';
  END IF;
  IF p_professional IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM luminix.professionals WHERE clinic_id = p_clinic AND id = p_professional AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Professional unavailable' USING ERRCODE = '22023';
  END IF;
  -- One booking at a time per agenda, so two clients cannot take the same slot.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_clinic::text || coalesce(p_professional::text, ''), 0));
  IF EXISTS (
    SELECT 1 FROM luminix.appointments
     WHERE clinic_id = p_clinic AND status IN ('scheduled', 'confirmed')
       AND starts_at < p_ends_at AND ends_at > p_starts_at
       AND (p_professional IS NULL OR professional_id = p_professional)
  ) THEN
    RAISE EXCEPTION 'Slot taken' USING ERRCODE = '23P01';
  END IF;
  INSERT INTO luminix.appointments
    (clinic_id, clinic_client_id, service_id, professional_id, starts_at, ends_at, status,
     booking_source, client_payment_method)
  VALUES (p_clinic, p_client, p_service, p_professional, p_starts_at, p_ends_at,
    CASE WHEN v_mode = 'instant' THEN 'confirmed' ELSE 'scheduled' END, 'client', p_payment)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION luminix.save_resource_rental(
  p_clinic uuid, p_equipment uuid, p_starts date, p_ends date, p_cost integer, p_note text,
  p_finance_entry uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_id uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_starts < luminix.clinic_today() THEN
    RAISE EXCEPTION 'Invalid rental' USING ERRCODE = '22023';
  END IF;
  SELECT membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  PERFORM 1 FROM luminix.resources
   WHERE clinic_id = p_clinic AND id = p_equipment AND type = 'equipment' AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid equipment' USING ERRCODE = '22023'; END IF;
  IF p_finance_entry IS NOT NULL THEN
    PERFORM 1 FROM luminix.finance_entries
     WHERE clinic_id = p_clinic AND id = p_finance_entry AND kind = 'expense' AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid finance entry' USING ERRCODE = '22023'; END IF;
  END IF;
  INSERT INTO luminix.resource_rentals (clinic_id, resource_id, starts_on, ends_on, cost_cents,
      note, finance_entry_id, created_by_membership_id)
    VALUES (p_clinic, p_equipment, p_starts, p_ends, p_cost, nullif(btrim(p_note), ''),
      p_finance_entry, v_member)
    RETURNING id INTO v_id;
  RETURN v_id;
END $$;

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
      'rentalDates', luminix.service_rental_days(c.id, svc.id, luminix.clinic_today(),
        luminix.clinic_today() + coalesce((SELECT bp.booking_window_days FROM luminix.booking_policies bp WHERE bp.clinic_id = c.id),60)),
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

-- The staff worksheet is accessible only through the existing authorized functions.
CREATE TABLE luminix.staff_anamneses (
  clinic_id uuid NOT NULL, id uuid NOT NULL, record jsonb NOT NULL,
  PRIMARY KEY (clinic_id, id), FOREIGN KEY (clinic_id,id) REFERENCES luminix.clinic_clients(clinic_id,id)
);
-- Preserve existing staff-only worksheets for clients who have never linked an account.
INSERT INTO luminix.staff_anamneses (clinic_id,id,record)
  SELECT clinic_id,id,client_anamnesis FROM luminix.clinic_clients
   WHERE client_profile_id IS NULL AND anamnesis_filled_by = 'staff' AND client_anamnesis IS NOT NULL;
REVOKE ALL ON luminix.staff_anamneses FROM PUBLIC, luminix_api;
ALTER TABLE luminix.staff_anamneses ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.staff_anamneses FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.staff_anamneses USING (clinic_id = luminix.current_clinic_id())
  WITH CHECK (clinic_id = luminix.current_clinic_id());
CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.staff_anamneses
  FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.staff_anamneses
  FOR EACH ROW EXECUTE FUNCTION luminix.audit_change();
CREATE OR REPLACE FUNCTION luminix.staff_save_client_anamnesis(p_clinic uuid, p_client uuid, p_record jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_sex text := luminix.anamnesis_field(p_record, 'sex');
  v_birth text := luminix.anamnesis_field(p_record, 'birthDate');
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR jsonb_typeof(p_record) IS DISTINCT FROM 'object'
    OR p_record->>'version' IS DISTINCT FROM '2'
    OR coalesce(p_record->>'level', '') NOT IN ('1', '2', '3')
    OR jsonb_typeof(p_record->'answers') IS DISTINCT FROM 'object'
    OR coalesce(v_sex, '') NOT IN ('female', 'male')
    OR coalesce(v_birth, '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Invalid anamnesis' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'client:manage');
  PERFORM 1 FROM luminix.clinic_clients WHERE clinic_id = p_clinic AND id = p_client FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client not found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO luminix.staff_anamneses(clinic_id,id,record) VALUES(p_clinic,p_client,p_record)
    ON CONFLICT(clinic_id,id) DO UPDATE SET record = excluded.record;
END $$;

CREATE OR REPLACE FUNCTION luminix.clinic_client_anamnesis_record(p_clinic uuid, p_client uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce((SELECT staff.record FROM luminix.staff_anamneses staff
    WHERE staff.clinic_id = c.clinic_id AND staff.id = c.id),
    CASE WHEN c.anamnesis_shared THEN p.anamnesis ELSE c.client_anamnesis END)
    FROM luminix.clinic_clients c
    LEFT JOIN luminix.client_profiles p ON p.id = c.client_profile_id
   WHERE c.clinic_id = p_clinic AND c.id = p_client
     AND p_clinic = luminix.current_clinic_id()
$$;

-- Only level, date and who filled it: safe for the list (no health answers).
CREATE OR REPLACE FUNCTION luminix.clinic_client_anamnesis_summary(p_clinic uuid, p_client uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT CASE WHEN r IS NULL THEN NULL ELSE jsonb_build_object(
      'level', r->'level', 'answeredAt', r->'answeredAt',
      'by', CASE WHEN EXISTS (SELECT FROM luminix.staff_anamneses staff WHERE staff.clinic_id = c.clinic_id AND staff.id = c.id) THEN 'staff' WHEN c.anamnesis_shared THEN 'client' ELSE coalesce(c.anamnesis_filled_by, 'client') END)
    END
    FROM luminix.clinic_clients c,
         LATERAL (SELECT luminix.clinic_client_anamnesis_record(p_clinic, p_client) AS r) x
   WHERE c.clinic_id = p_clinic AND c.id = p_client
$$;

