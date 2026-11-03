-- Additive, opt-in publication. Existing clinics remain private.
ALTER TABLE luminix.clinic_profiles
  ADD COLUMN public_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN public_address boolean NOT NULL DEFAULT false,
  ADD COLUMN public_contacts boolean NOT NULL DEFAULT false;

CREATE FUNCTION luminix.set_clinic_publication(p_clinic uuid, p_enabled boolean, p_address boolean, p_contacts boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR p_enabled IS NULL OR p_address IS NULL OR p_contacts IS NULL THEN
    RAISE EXCEPTION 'Invalid publication' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  IF NOT EXISTS (SELECT 1 FROM luminix.clinics WHERE id = p_clinic AND status = 'active') THEN
    RAISE EXCEPTION 'Complete onboarding first' USING ERRCODE = '22023';
  END IF;
  UPDATE luminix.clinic_profiles SET public_enabled = p_enabled,
    public_address = p_address, public_contacts = p_contacts, updated_at = now()
    WHERE clinic_id = p_clinic;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile unavailable' USING ERRCODE = '22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.set_clinic_publication(uuid, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_clinic_publication(uuid, boolean, boolean, boolean) TO luminix_api;

-- A separate explicit public projection. No session/tenant settings are changed and no draft,
-- identity, tax document, owner contact, appointments or client data can be returned.
-- Definer uses the same restricted-execute pattern as existing discovery functions.
CREATE FUNCTION luminix.read_public_clinic(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object(
    'slug', c.slug, 'name', c.name, 'theme', s.theme, 'foundedYear', p.founded_year,
    'logoKey', logo.large_object_key,
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
REVOKE ALL ON FUNCTION luminix.read_public_clinic(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.read_public_clinic(text) TO luminix_api;
