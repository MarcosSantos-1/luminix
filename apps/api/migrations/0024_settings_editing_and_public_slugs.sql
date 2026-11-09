-- Post-onboarding editing (profile, address, booking rules), friendly public slugs with
-- redirects for replaced addresses, showcase visibility options and an authenticated preview.
-- Additive: one table, functions and a trigger. Backfill only replaces code-shaped slugs of
-- activated clinics and keeps every previous address in the history for redirects.

-- 1. Public slug history -------------------------------------------------------------------

CREATE TABLE luminix.clinic_slug_history (
  slug text PRIMARY KEY CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 80),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  replaced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clinic_slug_history_clinic ON luminix.clinic_slug_history(clinic_id, replaced_at DESC);
ALTER TABLE luminix.clinic_slug_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.clinic_slug_history FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.clinic_slug_history
  USING (clinic_id = luminix.current_clinic_id()) WITH CHECK (clinic_id = luminix.current_clinic_id());
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.clinic_slug_history
  FOR EACH ROW EXECUTE FUNCTION luminix.audit_change();
REVOKE ALL ON luminix.clinic_slug_history FROM PUBLIC;
GRANT SELECT ON luminix.clinic_slug_history TO luminix_api;

-- Accents are folded explicitly: the unaccent extension is not assumed.
CREATE FUNCTION luminix.slugify(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT left(btrim(regexp_replace(regexp_replace(
    translate(lower(coalesce(p_text, '')),
      'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ&',
      'aaaaaaeeeeiiiiooooouuuucnyye'),
    '[^a-z0-9]+', '-', 'g'), '-{2,}', '-', 'g'), '-'), 40)
$$;
REVOKE ALL ON FUNCTION luminix.slugify(text) FROM PUBLIC;

-- Returns NULL when the clinic may use the slug; otherwise invalid, reserved or taken.
CREATE FUNCTION luminix.clinic_slug_problem(p_clinic uuid, p_slug text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_code text;
BEGIN
  IF p_slug IS NULL OR length(p_slug) < 3 OR length(p_slug) > 40
    OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR p_slug ~ '^[0-9-]+$' THEN
    RETURN 'invalid';
  END IF;
  SELECT lower(share_code) INTO v_code FROM luminix.clinics WHERE id = p_clinic;
  IF p_slug = ANY (ARRAY['admin', 'api', 'app', 'apps', 'luminix', 'login', 'entrar', 'cadastro',
      'signup', 'conta', 'suporte', 'ajuda', 'termos', 'privacidade', 'acesso', 'www', 'blog',
      'editor', 'previa', 'preview', 'vitrine', 'site', 'meu-plano', 'meuplano', 'servicos',
      'galeria', 'clinica', 'clinicas', 'espaco', 'teste', 'null', 'undefined'])
    OR p_slug LIKE 'demonstracao%' OR p_slug LIKE 'luminix-%'
    OR (p_slug ~ '^[a-z]{2}-[0-9]{4}$' AND p_slug IS DISTINCT FROM v_code)
    OR p_slug ~ '^clinica-[0-9a-f]{8}-' THEN
    RETURN 'reserved';
  END IF;
  IF EXISTS (SELECT 1 FROM luminix.clinics WHERE slug = p_slug AND id <> p_clinic)
    OR EXISTS (SELECT 1 FROM luminix.clinic_slug_history WHERE slug = p_slug AND clinic_id <> p_clinic) THEN
    RETURN 'taken';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION luminix.clinic_slug_problem(uuid, text) FROM PUBLIC;

-- First free slug derived from a name: base, base-2 … base-99, then a random suffix.
CREATE FUNCTION luminix.available_clinic_slug(p_clinic uuid, p_name text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_base text := luminix.slugify(p_name); v_candidate text; v_index integer;
BEGIN
  v_base := btrim(v_base, '-');
  IF coalesce(luminix.clinic_slug_problem(p_clinic, v_base), 'taken') <> 'taken' THEN
    -- Invalid or reserved bases (too short, digits only, demonstracao…) get a neutral prefix.
    v_base := btrim(left('espaco-' || coalesce(v_base, ''), 40), '-');
  END IF;
  IF luminix.clinic_slug_problem(p_clinic, v_base) IS NULL THEN RETURN v_base; END IF;
  FOR v_index IN 2..99 LOOP
    v_candidate := btrim(left(v_base, 36), '-') || '-' || v_index;
    IF luminix.clinic_slug_problem(p_clinic, v_candidate) IS NULL THEN RETURN v_candidate; END IF;
  END LOOP;
  FOR v_index IN 1..20 LOOP
    v_candidate := btrim(left(v_base, 33), '-') || '-' || substr(md5(random()::text), 1, 6);
    IF luminix.clinic_slug_problem(p_clinic, v_candidate) IS NULL THEN RETURN v_candidate; END IF;
  END LOOP;
  -- Always valid and free: the clinic's own UUID fragment.
  RETURN 'espaco-' || replace(p_clinic::text, '-', '');
END $$;
REVOKE ALL ON FUNCTION luminix.available_clinic_slug(uuid, text) FROM PUBLIC;

-- New clinics receive a friendly slug as soon as onboarding activates them.
CREATE FUNCTION luminix.assign_friendly_slug()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.slug = lower(coalesce(NEW.share_code, '')) OR NEW.slug ~ '^clinica-[0-9a-f]{8}-' THEN
    NEW.slug := luminix.available_clinic_slug(NEW.id, NEW.name);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION luminix.assign_friendly_slug() FROM PUBLIC;
CREATE TRIGGER assign_friendly_slug BEFORE UPDATE OF status ON luminix.clinics
  FOR EACH ROW WHEN (OLD.status = 'draft' AND NEW.status = 'active')
  EXECUTE FUNCTION luminix.assign_friendly_slug();

ALTER TABLE luminix.clinics NO FORCE ROW LEVEL SECURITY;
ALTER TABLE luminix.clinic_slug_history NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE r record; v_slug text;
BEGIN
  FOR r IN
    SELECT id, name, slug FROM luminix.clinics
     WHERE status IN ('active', 'suspended')
       AND (slug = lower(coalesce(share_code, '')) OR slug ~ '^clinica-[0-9a-f]{8}-')
     ORDER BY created_at, id
  LOOP
    v_slug := luminix.available_clinic_slug(r.id, r.name);
    INSERT INTO luminix.clinic_slug_history (slug, clinic_id) VALUES (r.slug, r.id)
      ON CONFLICT (slug) DO NOTHING;
    UPDATE luminix.clinics SET slug = v_slug WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE luminix.clinic_slug_history FORCE ROW LEVEL SECURITY;
ALTER TABLE luminix.clinics FORCE ROW LEVEL SECURITY;

CREATE FUNCTION luminix.check_clinic_slugs(p_clinic uuid, p_slugs text[])
RETURNS TABLE (slug text, problem text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR p_slugs IS NULL OR cardinality(p_slugs) > 8 THEN
    RAISE EXCEPTION 'Invalid slug check' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  RETURN QUERY SELECT candidate, luminix.clinic_slug_problem(p_clinic, candidate)
    FROM unnest(p_slugs) AS candidate;
END $$;
REVOKE ALL ON FUNCTION luminix.check_clinic_slugs(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.check_clinic_slugs(uuid, text[]) TO luminix_api;

CREATE FUNCTION luminix.suggest_clinic_slug(p_clinic uuid, p_text text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR length(coalesce(p_text, '')) > 160 THEN
    RAISE EXCEPTION 'Invalid slug suggestion' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  RETURN luminix.available_clinic_slug(p_clinic, p_text);
END $$;
REVOKE ALL ON FUNCTION luminix.suggest_clinic_slug(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.suggest_clinic_slug(uuid, text) TO luminix_api;

-- Previous slugs stay with the clinic (redirects; nobody else can claim them).
-- Five changes per 30 days limit churn and slug hoarding.
CREATE FUNCTION luminix.set_clinic_slug(p_clinic uuid, p_slug text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_old text; v_problem text;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  SELECT slug INTO v_old FROM luminix.clinics WHERE id = p_clinic AND status = 'active' FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Complete onboarding first' USING ERRCODE = '22023'; END IF;
  IF v_old = p_slug THEN RETURN v_old; END IF;
  v_problem := luminix.clinic_slug_problem(p_clinic, p_slug);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION 'Slug %', v_problem USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM luminix.clinic_slug_history h
       WHERE h.clinic_id = p_clinic AND h.replaced_at > now() - interval '30 days') >= 5 THEN
    RAISE EXCEPTION 'Slug change limit' USING ERRCODE = '54000';
  END IF;
  DELETE FROM luminix.clinic_slug_history WHERE slug = p_slug AND clinic_id = p_clinic;
  INSERT INTO luminix.clinic_slug_history (slug, clinic_id) VALUES (v_old, p_clinic)
    ON CONFLICT (slug) DO NOTHING;
  UPDATE luminix.clinics SET slug = p_slug WHERE id = p_clinic;
  RETURN p_slug;
END $$;
REVOKE ALL ON FUNCTION luminix.set_clinic_slug(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_clinic_slug(uuid, text) TO luminix_api;

-- Only published clinics redirect; withdrawn pages do not reveal their new address.
-- share_code is unique, so the code match identifies at most one clinic.
CREATE FUNCTION luminix.resolve_public_slug(p_slug text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  -- The space code (shown on the page and in the app) always leads to the current address.
  SELECT c.slug FROM luminix.clinics c
    JOIN luminix.clinic_profiles p ON p.clinic_id = c.id AND p.public_enabled
   WHERE c.status = 'active'
     AND (c.id = (SELECT h.clinic_id FROM luminix.clinic_slug_history h WHERE h.slug = p_slug)
       OR (p_slug ~ '^[a-z]{2}-[0-9]{4}$' AND c.share_code = upper(p_slug)))
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION luminix.resolve_public_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.resolve_public_slug(text) TO luminix_api;

-- 2. Profile and address -------------------------------------------------------------------

CREATE FUNCTION luminix.update_clinic_profile(p_clinic uuid, p_profile jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_name text := btrim(p_profile->>'name');
  v_owner text := btrim(p_profile->>'ownerName');
  v_email text := btrim(p_profile->>'email');
  v_phone text := btrim(p_profile->>'phone');
  v_whatsapp text := nullif(btrim(p_profile->>'whatsapp'), '');
  v_year text := nullif(btrim(p_profile->>'foundedYear'), '');
  v_postal text := nullif(regexp_replace(coalesce(p_profile->>'postalCode', ''), '[^0-9]', '', 'g'), '');
  v_state text := nullif(upper(btrim(p_profile->>'state')), '');
  v_logo uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR jsonb_typeof(p_profile) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid profile' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  IF NOT EXISTS (SELECT 1 FROM luminix.clinics WHERE id = p_clinic AND status = 'active') THEN
    RAISE EXCEPTION 'Complete onboarding first' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(v_name, '')) NOT BETWEEN 1 AND 160
    OR length(coalesce(v_owner, '')) NOT BETWEEN 1 AND 120
    OR coalesce(v_email, '') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(v_email) > 254
    OR coalesce(v_phone, '') !~ '^\+[1-9][0-9]{7,14}$'
    OR (v_whatsapp IS NOT NULL AND v_whatsapp !~ '^\+[1-9][0-9]{7,14}$')
    OR (v_year IS NOT NULL AND (v_year !~ '^[0-9]{4}$' OR v_year::integer NOT BETWEEN 1800 AND 2200))
    OR length(coalesce(p_profile->>'instagram', '')) > 120
    OR length(coalesce(p_profile->>'facebook', '')) > 300
    OR length(coalesce(p_profile->>'website', '')) > 300
    OR length(coalesce(p_profile->>'addressLine', '')) > 240
    OR length(coalesce(p_profile->>'addressNumber', '')) > 20
    OR length(coalesce(p_profile->>'addressDistrict', '')) > 120
    OR length(coalesce(p_profile->>'addressNote', '')) > 240
    OR length(coalesce(p_profile->>'city', '')) > 120
    OR (v_state IS NOT NULL AND v_state !~ '^[A-Z]{2}$')
    OR (v_postal IS NOT NULL AND v_postal !~ '^[0-9]{8}$') THEN
    RAISE EXCEPTION 'Invalid profile' USING ERRCODE = '22023';
  END IF;
  IF nullif(p_profile->>'logoAssetId', '') IS NOT NULL THEN
    v_logo := (p_profile->>'logoAssetId')::uuid;
    PERFORM 1 FROM luminix.media_assets
      WHERE clinic_id = p_clinic AND id = v_logo AND kind = 'clinic_logo' AND status = 'ready';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid logo asset' USING ERRCODE = '22023'; END IF;
  END IF;
  UPDATE luminix.clinics SET name = v_name WHERE id = p_clinic AND name IS DISTINCT FROM v_name;
  UPDATE luminix.clinic_profiles SET owner_name = v_owner, contact_email = v_email,
      contact_phone = v_phone, whatsapp_phone = v_whatsapp, founded_year = v_year::integer,
      instagram = nullif(btrim(p_profile->>'instagram'), ''),
      facebook = nullif(btrim(p_profile->>'facebook'), ''),
      website = nullif(btrim(p_profile->>'website'), ''),
      logo_asset_id = v_logo, updated_at = now()
    WHERE clinic_id = p_clinic;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile unavailable' USING ERRCODE = '22023'; END IF;
  UPDATE luminix.locations SET
      address_line = nullif(btrim(p_profile->>'addressLine'), ''),
      address_number = nullif(btrim(p_profile->>'addressNumber'), ''),
      district = nullif(btrim(p_profile->>'addressDistrict'), ''),
      address_note = nullif(btrim(p_profile->>'addressNote'), ''),
      city = nullif(btrim(p_profile->>'city'), ''), state = v_state, postal_code = v_postal
    WHERE clinic_id = p_clinic AND is_primary;
  IF NOT FOUND THEN
    INSERT INTO luminix.locations (clinic_id, name, address_line, address_number, district,
      address_note, city, state, postal_code, is_primary)
    VALUES (p_clinic, 'Principal', nullif(btrim(p_profile->>'addressLine'), ''),
      nullif(btrim(p_profile->>'addressNumber'), ''), nullif(btrim(p_profile->>'addressDistrict'), ''),
      nullif(btrim(p_profile->>'addressNote'), ''), nullif(btrim(p_profile->>'city'), ''),
      v_state, v_postal, true);
  END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.update_clinic_profile(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.update_clinic_profile(uuid, jsonb) TO luminix_api;

-- 3. Booking rules and deposit ---------------------------------------------------------------
-- Same ranges as onboarding completion. Configuration only: no charge or booking enforcement.

CREATE FUNCTION luminix.update_booking_rules(p_clinic uuid, p_rules jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_item jsonb; v_scope text := coalesce(p_rules->>'depositScope', 'none');
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR jsonb_typeof(p_rules) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid rules' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  IF NOT EXISTS (SELECT 1 FROM luminix.clinics WHERE id = p_clinic AND status = 'active') THEN
    RAISE EXCEPTION 'Complete onboarding first' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_rules->>'bookingNoticeHours', '') !~ '^[0-9]{1,3}$' OR (p_rules->>'bookingNoticeHours')::integer > 168
    OR coalesce(p_rules->>'bookingWindowDays', '') !~ '^[0-9]{1,3}$' OR (p_rules->>'bookingWindowDays')::integer NOT BETWEEN 7 AND 365
    OR coalesce(p_rules->>'cancellationHours', '') !~ '^[0-9]{1,3}$' OR (p_rules->>'cancellationHours')::integer > 168
    OR coalesce(p_rules->>'specialCancellationHours', '') !~ '^[0-9]{1,3}$' OR (p_rules->>'specialCancellationHours')::integer > 336
    OR (jsonb_typeof(p_rules->'reschedulingHours') <> 'null' AND (coalesce(p_rules->>'reschedulingHours', '') !~ '^[0-9]{1,3}$' OR (p_rules->>'reschedulingHours')::integer > 336))
    OR length(coalesce(p_rules->>'clientInstructions', '')) > 500
    OR coalesce(p_rules->>'lateChangeRetentionPercent', '') !~ '^[0-9]{1,3}$' OR (p_rules->>'lateChangeRetentionPercent')::integer > 100
    OR coalesce(p_rules->>'noShowRetentionPercent', '') !~ '^[0-9]{1,3}$' OR (p_rules->>'noShowRetentionPercent')::integer > 100
    OR v_scope NOT IN ('none', 'all', 'threshold', 'special', 'selected')
    OR coalesce(p_rules->>'depositPercent', '') !~ '^[0-9]{1,3}$' OR (p_rules->>'depositPercent')::integer NOT BETWEEN 1 AND 100
    OR coalesce(p_rules->>'depositThresholdCents', '') !~ '^[0-9]{1,9}$' OR (p_rules->>'depositThresholdCents')::integer < 1
    OR jsonb_typeof(p_rules->'services') IS DISTINCT FROM 'array' OR jsonb_array_length(p_rules->'services') > 80 THEN
    RAISE EXCEPTION 'Invalid rules' USING ERRCODE = '22023';
  END IF;
  UPDATE luminix.booking_policies SET
      booking_notice_minutes = (p_rules->>'bookingNoticeHours')::integer * 60,
      booking_window_days = (p_rules->>'bookingWindowDays')::integer,
      cancellation_notice_minutes = (p_rules->>'cancellationHours')::integer * 60,
      special_cancellation_notice_minutes = (p_rules->>'specialCancellationHours')::integer * 60,
      rescheduling_notice_minutes = (p_rules->>'reschedulingHours')::integer * 60,
      client_instructions = coalesce(p_rules->>'clientInstructions', ''),
      late_change_retention_percent = (p_rules->>'lateChangeRetentionPercent')::integer,
      no_show_retention_percent = (p_rules->>'noShowRetentionPercent')::integer,
      deposit_scope = v_scope,
      deposit_percent = (p_rules->>'depositPercent')::integer,
      deposit_threshold_cents = (p_rules->>'depositThresholdCents')::integer,
      updated_at = now()
    WHERE clinic_id = p_clinic;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rules unavailable' USING ERRCODE = '22023'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rules->'services') LOOP
    IF jsonb_typeof(v_item) <> 'object' OR coalesce(v_item->>'id', '') !~* '^[0-9a-f-]{36}$'
      OR jsonb_typeof(v_item->'depositRequired') IS DISTINCT FROM 'boolean'
      OR (jsonb_typeof(v_item->'lateChangeRetentionPercent') <> 'null'
        AND (coalesce(v_item->>'lateChangeRetentionPercent', '') !~ '^[0-9]{1,3}$' OR (v_item->>'lateChangeRetentionPercent')::integer > 100))
      OR (jsonb_typeof(v_item->'noShowRetentionPercent') <> 'null'
        AND (coalesce(v_item->>'noShowRetentionPercent', '') !~ '^[0-9]{1,3}$' OR (v_item->>'noShowRetentionPercent')::integer > 100)) THEN
      RAISE EXCEPTION 'Invalid service rule' USING ERRCODE = '22023';
    END IF;
    UPDATE luminix.services SET
        deposit_required = (v_item->>'depositRequired')::boolean,
        late_change_retention_percent = (v_item->>'lateChangeRetentionPercent')::integer,
        no_show_retention_percent = (v_item->>'noShowRetentionPercent')::integer
      WHERE clinic_id = p_clinic AND id = (v_item->>'id')::uuid AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid service rule' USING ERRCODE = '22023'; END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION luminix.update_booking_rules(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.update_booking_rules(uuid, jsonb) TO luminix_api;

-- 4. Showcase visibility options -----------------------------------------------------------
-- `hidden` lists optional blocks the clinic prefers to omit from the public page.

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
    OR (p_showcase ? 'hidden' AND (jsonb_typeof(p_showcase->'hidden') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_showcase->'hidden') > 4
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_showcase->'hidden') h(item)
        WHERE jsonb_typeof(h.item) <> 'string' OR h.item #>> '{}' NOT IN ('hours', 'foundedYear', 'app', 'socials'))))
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

-- 5. One projection for the public page and the authenticated editor preview ---------------
-- p_preview includes address and contacts so the editor can toggle them before publishing.
-- Never granted to the runtime role; only the two wrappers below are.

CREATE FUNCTION luminix.public_clinic_projection(p_clinic uuid, p_preview boolean)
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
      'durationMinutes', svc.duration_minutes, 'bookingMode', svc.booking_mode
    ) ORDER BY svc.category, svc.name, svc.id) FROM luminix.services svc
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
REVOKE ALL ON FUNCTION luminix.public_clinic_projection(uuid, boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION luminix.read_public_clinic(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT luminix.public_clinic_projection(c.id, false)
  FROM luminix.clinics c
  JOIN luminix.clinic_profiles p ON p.clinic_id = c.id AND p.public_enabled
  WHERE c.slug = p_slug AND c.status = 'active'
$$;

CREATE FUNCTION luminix.read_clinic_preview(p_clinic uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  IF NOT EXISTS (SELECT 1 FROM luminix.clinics WHERE id = p_clinic AND status = 'active') THEN
    RAISE EXCEPTION 'Complete onboarding first' USING ERRCODE = '22023';
  END IF;
  RETURN luminix.public_clinic_projection(p_clinic, true);
END $$;
REVOKE ALL ON FUNCTION luminix.read_clinic_preview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.read_clinic_preview(uuid) TO luminix_api;
