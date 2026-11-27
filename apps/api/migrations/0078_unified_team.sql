ALTER TABLE luminix.professionals
  ADD COLUMN staff_kind text NOT NULL DEFAULT 'team' CHECK (staff_kind IN ('team', 'manager', 'reception', 'other')),
  ADD COLUMN attends boolean NOT NULL DEFAULT true,
  ADD COLUMN commission_bps integer CHECK (commission_bps BETWEEN 1 AND 10000),
  ADD CHECK (staff_kind <> 'reception' OR NOT attends);

-- Preserve the existing roster and schedules while classifying explicit reception roles.
ALTER TABLE luminix.professionals NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE v_clinic uuid; v_previous text := current_setting('luminix.clinic_id', true);
BEGIN
  FOR v_clinic IN SELECT DISTINCT clinic_id FROM luminix.professionals LOOP
    PERFORM set_config('luminix.clinic_id', v_clinic::text, true);
    UPDATE luminix.professionals SET staff_kind = 'reception', attends = false
     WHERE clinic_id = v_clinic AND lower(btrim(role_name)) IN ('recepcionista', 'recepção', 'recepcao');
    UPDATE luminix.professionals p SET membership_id = d.created_by_membership_id
      FROM luminix.onboarding_drafts d
     WHERE p.clinic_id = v_clinic AND d.clinic_id = p.clinic_id
       AND d.status = 'completed' AND d.payload->>'teamMode' = 'solo'
       AND p.id::text = d.payload#>>'{professionals,0,id}' AND p.membership_id IS NULL
       AND p.status = 'active' AND NOT EXISTS (SELECT FROM luminix.professionals existing
         WHERE existing.clinic_id = p.clinic_id AND existing.membership_id = d.created_by_membership_id);
  END LOOP;
  PERFORM set_config('luminix.clinic_id', coalesce(v_previous, ''), true);
END $$;
ALTER TABLE luminix.professionals FORCE ROW LEVEL SECURITY;

CREATE FUNCTION luminix.require_attending_professional() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.professional_id IS NULL OR (TG_OP = 'UPDATE'
    AND (OLD.professional_id, OLD.starts_at, OLD.ends_at) IS NOT DISTINCT FROM
        (NEW.professional_id, NEW.starts_at, NEW.ends_at)) THEN RETURN NEW; END IF;
  PERFORM 1 FROM luminix.professionals
   WHERE clinic_id = NEW.clinic_id AND id = NEW.professional_id AND status = 'active' AND attends FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esta pessoa não atende clientes.' USING ERRCODE = '22023'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION luminix.require_attending_professional() FROM PUBLIC;
CREATE TRIGGER appointment_attending_professional BEFORE INSERT OR UPDATE OF professional_id, starts_at, ends_at
  ON luminix.appointments FOR EACH ROW EXECUTE FUNCTION luminix.require_attending_professional();

CREATE OR REPLACE FUNCTION luminix.save_professional(p_clinic uuid, p_professional jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_attends boolean; v_kind text; v_rate integer;
  v_id uuid; v_photo uuid; v_member uuid; v_day jsonb; v_clinic_day record; v_service uuid;
  v_sensitive boolean; v_audience text; v_periods jsonb; v_breaks jsonb; v_cursor text; v_break jsonb;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR jsonb_typeof(p_professional) IS DISTINCT FROM 'object'
    OR coalesce(p_professional->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid professional' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'professional:manage');
  IF NOT EXISTS (SELECT 1 FROM luminix.clinics WHERE id = p_clinic AND status = 'active') THEN
    RAISE EXCEPTION 'Complete onboarding first' USING ERRCODE = '22023';
  END IF;
  v_id := (p_professional->>'id')::uuid;
  SELECT staff_kind, attends, commission_bps INTO v_kind, v_attends, v_rate
    FROM luminix.professionals WHERE clinic_id = p_clinic AND id = v_id FOR UPDATE;
  v_kind := coalesce(p_professional->>'staffKind', v_kind, 'team');
  v_attends := v_kind <> 'reception' AND coalesce((p_professional->>'attends')::boolean, v_attends, true);
  IF v_attends AND p_professional ? 'commissionBps' THEN
    v_rate := (p_professional->>'commissionBps')::integer;
  END IF;
  IF length(coalesce(btrim(p_professional->>'name'), '')) NOT BETWEEN 1 AND 160
    OR length(coalesce(btrim(p_professional->>'role'), '')) > 120
    OR coalesce(p_professional->>'gender', 'female') NOT IN ('female', 'male')
    OR coalesce(p_professional->>'audience', 'all') NOT IN ('all', 'women', 'men')
    OR jsonb_typeof(p_professional->'serviceIds') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_professional->'serviceIds') > 80
    OR jsonb_typeof(p_professional->'days') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_professional->'days') <> 7
    OR (SELECT count(DISTINCT d->>'weekday') FROM jsonb_array_elements(p_professional->'days') d) <> 7 THEN
    RAISE EXCEPTION 'Invalid professional' USING ERRCODE = '22023';
  END IF;
  IF nullif(p_professional->>'photoAssetId', '') IS NOT NULL THEN
    v_photo := (p_professional->>'photoAssetId')::uuid;
    PERFORM 1 FROM luminix.media_assets WHERE clinic_id = p_clinic AND id = v_photo
      AND kind = 'professional_photo' AND subject_ref = v_id AND status = 'ready';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid professional photo' USING ERRCODE = '22023'; END IF;
  END IF;
  IF nullif(p_professional->>'membershipId', '') IS NOT NULL THEN
    v_member := (p_professional->>'membershipId')::uuid;
    PERFORM 1 FROM luminix.clinic_memberships WHERE clinic_id = p_clinic AND id = v_member;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid member link' USING ERRCODE = '22023'; END IF;
  END IF;

  INSERT INTO luminix.professionals (id, clinic_id, display_name, role_name, gender, audience,
      photo_asset_id, membership_id, status, staff_kind, attends, commission_bps)
    VALUES (v_id, p_clinic, btrim(p_professional->>'name'), nullif(btrim(p_professional->>'role'), ''),
      coalesce(p_professional->>'gender', 'female'), coalesce(p_professional->>'audience', 'all'),
      v_photo, v_member, 'active', v_kind, v_attends, v_rate)
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role_name = EXCLUDED.role_name,
      gender = EXCLUDED.gender, audience = EXCLUDED.audience, photo_asset_id = EXCLUDED.photo_asset_id,
      membership_id = EXCLUDED.membership_id, status = 'active', staff_kind = EXCLUDED.staff_kind,
      attends = EXCLUDED.attends, commission_bps = EXCLUDED.commission_bps
    WHERE luminix.professionals.clinic_id = p_clinic;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid professional' USING ERRCODE = '22023'; END IF;

  IF v_attends THEN
    DELETE FROM luminix.professional_services WHERE clinic_id = p_clinic AND professional_id = v_id;
    FOR v_service IN SELECT (value #>> '{}')::uuid FROM jsonb_array_elements(p_professional->'serviceIds') LOOP
      SELECT is_sensitive, audience INTO v_sensitive, v_audience FROM luminix.services
        WHERE clinic_id = p_clinic AND id = v_service AND status = 'active';
      IF NOT FOUND THEN RAISE EXCEPTION 'Invalid professional service' USING ERRCODE = '22023'; END IF;
      v_audience := CASE WHEN v_sensitive
        THEN coalesce(p_professional->'serviceAudiences'->>v_service::text, v_audience, 'all') END;
      IF v_audience IS NOT NULL AND v_audience NOT IN ('all', 'women', 'men') THEN
        RAISE EXCEPTION 'Invalid professional audience' USING ERRCODE = '22023';
      END IF;
      INSERT INTO luminix.professional_services (clinic_id, professional_id, service_id, audience)
        VALUES (p_clinic, v_id, v_service, v_audience) ON CONFLICT DO NOTHING;
    END LOOP;

    -- Same day validation as onboarding: inside the clinic's opening hours for that weekday.
    FOR v_day IN SELECT value FROM jsonb_array_elements(p_professional->'days') LOOP
      SELECT w.is_available,
          (SELECT min(p->>'start') FROM jsonb_array_elements(w.periods) p) AS opens,
          (SELECT max(p->>'end') FROM jsonb_array_elements(w.periods) p) AS closes
        INTO v_clinic_day FROM luminix.weekly_availability w
        WHERE w.clinic_id = p_clinic AND w.weekday::text = v_day->>'weekday';
      IF jsonb_typeof(v_day) <> 'object' OR coalesce(v_day->>'weekday', '') !~ '^[0-6]$'
        OR coalesce(v_day->>'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        OR coalesce(v_day->>'end', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        OR jsonb_typeof(v_day->'enabled') IS DISTINCT FROM 'boolean'
        OR (v_day->'breaks' IS NOT NULL AND jsonb_typeof(v_day->'breaks') <> 'array')
        OR jsonb_array_length(coalesce(v_day->'breaks', '[]'::jsonb)) > 4
        OR ((v_day->>'enabled')::boolean AND (
          (v_day->>'start')::time >= (v_day->>'end')::time
          OR NOT coalesce(v_clinic_day.is_available, false)
          OR (v_day->>'start') < v_clinic_day.opens OR (v_day->>'end') > v_clinic_day.closes)) THEN
        RAISE EXCEPTION 'Invalid professional hours' USING ERRCODE = '22023';
      END IF;
      -- Breaks must be ordered, inside the day and not overlapping.
      v_cursor := v_day->>'start';
      FOR v_break IN SELECT value FROM jsonb_array_elements(coalesce(v_day->'breaks', '[]'::jsonb))
          ORDER BY value->>'start' LOOP
        IF coalesce(v_break->>'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          OR coalesce(v_break->>'end', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          OR (v_break->>'start') < v_cursor OR (v_break->>'end') <= (v_break->>'start')
          OR (v_break->>'end') > (v_day->>'end') THEN
          RAISE EXCEPTION 'Invalid professional break' USING ERRCODE = '22023';
        END IF;
        v_cursor := v_break->>'end';
      END LOOP;
      v_periods := CASE WHEN (v_day->>'enabled')::boolean THEN luminix.business_day_to_periods(v_day) ELSE '[]'::jsonb END;
      INSERT INTO luminix.professional_weekly_availability
          (clinic_id, professional_id, weekday, is_available, periods, day_schedule)
        VALUES (p_clinic, v_id, (v_day->>'weekday')::smallint, (v_day->>'enabled')::boolean, v_periods,
          jsonb_build_object('weekday', (v_day->>'weekday')::integer, 'enabled', (v_day->>'enabled')::boolean,
            'start', v_day->>'start', 'end', v_day->>'end', 'breaks', coalesce(v_day->'breaks', '[]'::jsonb)))
      ON CONFLICT (clinic_id, professional_id, weekday) DO UPDATE SET
        is_available = EXCLUDED.is_available, periods = EXCLUDED.periods,
        day_schedule = EXCLUDED.day_schedule, updated_at = now();
    END LOOP;

  END IF;

  UPDATE luminix.clinic_profiles SET team_mode = CASE WHEN (SELECT count(*) FROM luminix.professionals
      WHERE clinic_id = p_clinic AND status = 'active' AND attends) > 1 THEN 'team' ELSE 'solo' END
    WHERE clinic_id = p_clinic;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION luminix.archive_professional(p_clinic uuid, p_professional uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_attends boolean;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'professional:manage');
  SELECT attends INTO v_attends FROM luminix.professionals
    WHERE clinic_id = p_clinic AND id = p_professional AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Professional not found' USING ERRCODE = '22023'; END IF;
  IF v_attends AND (SELECT count(*) FROM luminix.professionals WHERE clinic_id = p_clinic AND status = 'active' AND attends) <= 1 THEN
    RAISE EXCEPTION 'Keep at least one professional' USING ERRCODE = '22023';
  END IF;
  UPDATE luminix.professionals SET status = 'archived', membership_id = NULL
    WHERE clinic_id = p_clinic AND id = p_professional;
  UPDATE luminix.clinic_profiles SET team_mode = CASE WHEN (SELECT count(*) FROM luminix.professionals
      WHERE clinic_id = p_clinic AND status = 'active' AND attends) > 1 THEN 'team' ELSE 'solo' END
    WHERE clinic_id = p_clinic;
END $$;

DROP FUNCTION luminix.list_staff_members(uuid);
CREATE FUNCTION luminix.list_staff_members(p_clinic uuid)
RETURNS TABLE (membership_id uuid, display_name text, contact_email text, role_name text,
  status text, firebase_uid text, is_self boolean, professional_id uuid,
  invited_at timestamptz, created_at timestamptz, photo_data text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_self uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_self FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'team:manage') a;
  RETURN QUERY
    SELECT m.id, m.display_name, m.contact_email, r.name, m.status, i.firebase_uid,
      m.id = v_self, p.id, m.invited_at, m.created_at, m.photo_data
    FROM luminix.clinic_memberships m
    JOIN luminix.roles r ON r.clinic_id = m.clinic_id AND r.id = m.role_id
    JOIN luminix.identities i ON i.id = m.identity_id
    LEFT JOIN luminix.professionals p ON p.clinic_id = m.clinic_id AND p.membership_id = m.id
      AND p.status = 'active'
    WHERE m.clinic_id = p_clinic
    ORDER BY (r.name = 'owner') DESC, m.status, coalesce(m.display_name, ''), m.created_at
    LIMIT 200;
END $$;
REVOKE ALL ON FUNCTION luminix.list_staff_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.list_staff_members(uuid) TO luminix_api;

CREATE FUNCTION luminix.attach_staff_invitation(p_clinic uuid, p_professional uuid, p_member uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'team:manage');
  UPDATE luminix.professionals SET membership_id = p_member
   WHERE clinic_id = p_clinic AND id = p_professional AND membership_id IS NULL AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE = '55000'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.attach_staff_invitation(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.attach_staff_invitation(uuid, uuid, uuid) TO luminix_api;

CREATE FUNCTION luminix.apply_onboarding_team_preferences() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  UPDATE luminix.professionals p
     SET commission_bps = nullif(person->>'commissionBps', '')::integer,
         gender = coalesce(person->>'gender', p.gender),
         membership_id = CASE WHEN NEW.payload->>'teamMode' = 'solo'
           AND person->>'id' = NEW.payload#>>'{professionals,0,id}'
           THEN NEW.created_by_membership_id ELSE p.membership_id END
    FROM jsonb_array_elements(NEW.payload->'professionals') person
   WHERE p.clinic_id = NEW.clinic_id AND p.id = (person->>'id')::uuid;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION luminix.apply_onboarding_team_preferences() FROM PUBLIC;
CREATE TRIGGER onboarding_team_preferences AFTER UPDATE OF status ON luminix.onboarding_drafts
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed')
  EXECUTE FUNCTION luminix.apply_onboarding_team_preferences();

CREATE OR REPLACE FUNCTION luminix.schedule_appointment_states(p_clinic uuid)
RETURNS TABLE (appointment_id uuid, state text, closed boolean)
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  WITH zone AS (
    SELECT coalesce((SELECT timezone FROM luminix.clinic_settings WHERE clinic_id = p_clinic),
      'America/Sao_Paulo') AS tz
  ), open AS (
    SELECT a.id, a.service_id, a.client_package_id, a.professional_id,
           (a.starts_at AT TIME ZONE zone.tz) AS ls, (a.ends_at AT TIME ZONE zone.tz) AS le
      FROM luminix.appointments a CROSS JOIN zone
     WHERE a.clinic_id = p_clinic AND a.status IN ('scheduled', 'confirmed') AND a.starts_at > now()
  ), day AS (
    SELECT open.*, ls::date AS d, extract(dow FROM ls)::int AS dow,
           extract(hour FROM ls)::int * 60 + extract(minute FROM ls)::int AS s,
           (le::date - ls::date) * 1440 + extract(hour FROM le)::int * 60
             + extract(minute FROM le)::int AS e
      FROM open
  ), rule AS (
    SELECT x.*,
      CASE
        WHEN x.professional_id IS NULL THEN coalesce(o.is_available, w.is_available, false)
        WHEN NOT coalesce(p.attends, false) THEN false
        WHEN po.id IS NOT NULL THEN coalesce(o.is_available, w.is_available, false) AND po.is_available
        WHEN o.id IS NOT NULL THEN o.is_available AND coalesce(pw.is_available, true)
        WHEN pw.id IS NOT NULL THEN pw.is_available
        ELSE coalesce(w.is_available, false)
      END AS available,
      CASE
        WHEN x.professional_id IS NULL OR po.id IS NOT NULL OR o.id IS NOT NULL
          THEN coalesce(o.periods, w.periods)
        WHEN pw.id IS NOT NULL THEN pw.periods
        ELSE w.periods
      END AS a_periods,
      CASE
        WHEN x.professional_id IS NULL THEN NULL
        WHEN po.id IS NOT NULL THEN po.periods
        WHEN o.id IS NOT NULL THEN pw.periods
        ELSE NULL
      END AS b_periods,
      EXISTS (
        SELECT 1 FROM luminix.schedule_closures c
         WHERE c.clinic_id = p_clinic AND x.d BETWEEN c.starts_on AND c.ends_on
           AND (c.professional_id IS NULL OR c.professional_id = x.professional_id)
      ) AS in_closure
      FROM day x
      LEFT JOIN luminix.professionals p ON p.clinic_id = p_clinic AND p.id = x.professional_id
      LEFT JOIN luminix.schedule_overrides o ON o.clinic_id = p_clinic AND o.local_date = x.d
      LEFT JOIN luminix.weekly_availability w ON w.clinic_id = p_clinic AND w.weekday = x.dow
      LEFT JOIN luminix.professional_schedule_overrides po ON po.clinic_id = p_clinic
        AND po.professional_id = x.professional_id AND po.local_date = x.d
      LEFT JOIN luminix.professional_weekly_availability pw ON pw.clinic_id = p_clinic
        AND pw.professional_id = x.professional_id AND pw.weekday = x.dow
  )
  SELECT r.id,
    CASE
      WHEN NOT r.available OR r.in_closure THEN 'out'
      WHEN NOT luminix.rental_fits(p_clinic, r.service_id, r.client_package_id, r.ls, r.le)
        OR luminix.exclusive_rental_blocks(p_clinic, r.service_id, r.d) THEN 'out'
      ELSE luminix.window_state(r.a_periods, r.b_periods, r.s, r.e)
    END,
    NOT r.available OR r.in_closure
  FROM rule r
$$;

CREATE OR REPLACE FUNCTION luminix.set_service_professionals(p_clinic uuid, p_service uuid, p_professionals uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_sensitive boolean; v_audience text; v_count integer;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_service IS NULL
    OR p_professionals IS NULL OR cardinality(p_professionals) > 100 THEN
    RAISE EXCEPTION 'Invalid service team' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  SELECT is_sensitive, audience INTO v_sensitive, v_audience FROM luminix.services
    WHERE clinic_id = p_clinic AND id = p_service AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid service' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_professionals) wanted(id)
      WHERE NOT EXISTS (SELECT 1 FROM luminix.professionals p
        WHERE p.clinic_id = p_clinic AND p.id = wanted.id AND p.status = 'active' AND p.attends)) THEN
    RAISE EXCEPTION 'Invalid professional' USING ERRCODE = '22023';
  END IF;
  DELETE FROM luminix.professional_services ps
    USING luminix.professionals p
    WHERE ps.clinic_id = p_clinic AND ps.service_id = p_service
      AND p.clinic_id = ps.clinic_id AND p.id = ps.professional_id AND p.status = 'active' AND p.attends
      AND NOT (ps.professional_id = ANY (p_professionals));
  INSERT INTO luminix.professional_services (clinic_id, professional_id, service_id, audience)
    SELECT DISTINCT p_clinic, wanted.id, p_service, CASE WHEN v_sensitive THEN coalesce(v_audience, 'all') END
      FROM unnest(p_professionals) wanted(id)
    ON CONFLICT DO NOTHING;
  SELECT count(*) INTO v_count FROM luminix.professional_services
    WHERE clinic_id = p_clinic AND service_id = p_service;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION luminix.record_team_payment(
  p_clinic uuid, p_recipient uuid, p_professional boolean, p_month date,
  p_salary integer, p_rate integer, p_expected integer, p_paid_on date, p_method text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_name text; v_member uuid; v_configured_rate integer := 0; v_base bigint := 0; v_commission bigint; v_amount bigint; v_entry uuid;
BEGIN
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'finance:manage');
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR p_recipient IS NULL OR p_professional IS NULL OR p_paid_on IS NULL OR p_month IS NULL
    OR extract(day FROM p_month) <> 1 OR p_salary IS NULL OR p_salary NOT BETWEEN 0 AND 100000000
    OR p_rate IS NULL OR p_rate NOT BETWEEN 0 AND 10000 OR (NOT p_professional AND p_rate <> 0) THEN
    RAISE EXCEPTION 'Invalid payroll' USING ERRCODE = '22023';
  END IF;

  IF p_professional THEN
    SELECT membership_id INTO v_member FROM luminix.professionals
     WHERE clinic_id = p_clinic AND id = p_recipient FOR SHARE;
  ELSE v_member := p_recipient;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_clinic::text || ':' || coalesce(v_member, p_recipient)::text || ':' || p_month::text, 0));
  IF EXISTS (
    SELECT FROM luminix.finance_team_payments t JOIN luminix.finance_entries e
      ON e.clinic_id = t.clinic_id AND e.id = t.finance_entry_id
    WHERE t.clinic_id = p_clinic AND t.month = p_month AND e.status = 'active'
      AND ((p_professional AND t.professional_id = p_recipient)
        OR t.membership_id = v_member)
  ) THEN
    RAISE EXCEPTION 'O pagamento deste mês já foi lançado.' USING ERRCODE = '55000';
  END IF;

  IF p_professional THEN
    SELECT display_name, coalesce(commission_bps, 0) INTO v_name, v_configured_rate FROM luminix.professionals
     WHERE clinic_id = p_clinic AND id = p_recipient AND status = 'active';
    SELECT cents INTO v_base FROM luminix.finance_team_receipts(p_clinic, p_month)
     WHERE professional_id = p_recipient;
  ELSE
    SELECT coalesce(nullif(btrim(m.display_name), ''), 'Pessoa da equipe') INTO v_name
      FROM luminix.clinic_memberships m
     WHERE m.clinic_id = p_clinic AND m.id = p_recipient AND m.status = 'active'
       AND NOT EXISTS (SELECT FROM luminix.professionals p
         WHERE p.clinic_id = m.clinic_id AND p.membership_id = m.id AND p.status = 'active');
  END IF;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Pessoa indisponível para lançamento.' USING ERRCODE = '55000';
  END IF;

  IF p_rate <> v_configured_rate THEN
    RAISE EXCEPTION 'A comissão mudou. Confira o cadastro da pessoa e recarregue o Financeiro.' USING ERRCODE = '55000';
  END IF;
  v_base := coalesce(v_base, 0);
  v_commission := round(v_base::numeric * p_rate / 10000);
  v_amount := p_salary + v_commission;
  IF v_amount IS DISTINCT FROM p_expected OR v_amount NOT BETWEEN 1 AND 100000000 THEN
    RAISE EXCEPTION 'O total mudou ou é inválido. Confira os valores novamente.' USING ERRCODE = '55000';
  END IF;
  v_entry := luminix.save_finance_entry(p_clinic, jsonb_build_object(
    'kind', 'expense', 'amountCents', v_amount, 'occurredOn', to_char(p_paid_on, 'YYYY-MM-DD'),
    'description', left('Remuneração ' || to_char(p_month, 'MM/YYYY') || ' · ' || v_name, 160),
    'category', 'Equipe', 'method', p_method));
  INSERT INTO luminix.finance_team_payments
    (clinic_id, finance_entry_id, professional_id, membership_id, month, salary_cents,
     commission_bps, commission_base_cents, commission_cents)
  VALUES (p_clinic, v_entry, CASE WHEN p_professional THEN p_recipient END,
    CASE WHEN NOT p_professional THEN p_recipient END, p_month, p_salary, p_rate, v_base, v_commission);
  RETURN v_entry;
END $$;

DROP FUNCTION luminix.finance_team_month(uuid, date);
CREATE FUNCTION luminix.finance_team_month(p_clinic uuid, p_month date)
RETURNS TABLE (recipient_id uuid, name text, professional boolean, base_cents bigint, configured_commission_bps integer, attends boolean,
  entry_id uuid, salary_cents integer, commission_cents integer, commission_bps integer, paid_on date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'finance:manage');
  RETURN QUERY
  WITH paid AS (
    SELECT t.*, e.occurred_on
      FROM luminix.finance_team_payments t
      JOIN luminix.finance_entries e ON e.clinic_id = t.clinic_id AND e.id = t.finance_entry_id
     WHERE t.clinic_id = p_clinic AND t.month = p_month AND e.status = 'active'
  ), recipients AS (
    SELECT p.id, p.display_name, true AS is_professional, coalesce(p.commission_bps, 0) AS configured_rate, p.membership_id AS member_id, p.attends AS is_attending
      FROM luminix.professionals p WHERE p.clinic_id = p_clinic
        AND (p.status = 'active' OR EXISTS (SELECT FROM paid WHERE paid.professional_id = p.id))
    UNION ALL
    SELECT m.id, coalesce(nullif(btrim(m.display_name), ''), 'Pessoa da equipe'), false, 0, m.id, false
      FROM luminix.clinic_memberships m WHERE m.clinic_id = p_clinic
        AND (m.status = 'active' OR EXISTS (SELECT FROM paid WHERE membership_id = m.id))
        AND NOT EXISTS (SELECT FROM luminix.professionals p
          WHERE p.clinic_id = m.clinic_id AND p.membership_id = m.id AND p.status = 'active')
  )
  SELECT r.id, r.display_name, r.is_professional, coalesce(t.commission_base_cents, f.cents, 0), r.configured_rate, r.is_attending,
    t.finance_entry_id, t.salary_cents, t.commission_cents, t.commission_bps, t.occurred_on
    FROM recipients r
    LEFT JOIN luminix.finance_team_receipts(p_clinic, p_month) f ON r.is_professional AND f.professional_id = r.id
    LEFT JOIN LATERAL (
      SELECT * FROM paid x WHERE (r.is_professional AND x.professional_id = r.id)
        OR x.membership_id = r.member_id
      ORDER BY x.occurred_on DESC, x.id DESC LIMIT 1
    ) t ON true
   ORDER BY lower(r.display_name), r.id;
END $$;
REVOKE ALL ON FUNCTION luminix.finance_team_month(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.finance_team_month(uuid, date) TO luminix_api;
