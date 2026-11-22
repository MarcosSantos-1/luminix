-- Existing rentals remain available throughout the effective opening hours.
ALTER TABLE luminix.resource_rentals
  ADD COLUMN available boolean NOT NULL DEFAULT true,
  ADD COLUMN start_minute smallint,
  ADD COLUMN duration_hours smallint,
  ADD CONSTRAINT rental_daily_window CHECK (
    (start_minute IS NULL AND duration_hours IS NULL) OR
    (start_minute IS NOT NULL AND duration_hours IS NOT NULL AND duration_hours IN (4,6,8,10)
      AND start_minute BETWEEN 0 AND 1440 - 60 * duration_hours));

CREATE FUNCTION luminix.set_rental_window(p_clinic uuid, p_rental uuid, p_available boolean,
  p_start integer, p_hours integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_available IS NULL THEN
    RAISE EXCEPTION 'Invalid rental' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  UPDATE luminix.resource_rentals SET available = p_available, start_minute = p_start,
    duration_hours = p_hours WHERE clinic_id = p_clinic AND id = p_rental;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rental not found' USING ERRCODE = 'P0002'; END IF;
END $$;

-- Half-open local minute ranges preserve breaks, special dates and closures.
CREATE FUNCTION luminix.equipment_windows(p_clinic uuid, p_device uuid, p_from date, p_to date)
RETURNS TABLE(day date, span int4range) LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT d.day::date, bounds.span FROM luminix.resource_rentals rr
    JOIN luminix.resources r ON r.clinic_id = rr.clinic_id AND r.id = rr.resource_id
    CROSS JOIN LATERAL generate_series(greatest(rr.starts_on,p_from)::timestamp,
      least(rr.ends_on,p_to)::timestamp, interval '1 day') d(day)
    LEFT JOIN luminix.schedule_overrides o ON o.clinic_id = rr.clinic_id AND o.local_date = d.day::date
    LEFT JOIN luminix.weekly_availability w ON w.clinic_id = rr.clinic_id AND w.weekday = extract(dow FROM d.day)
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(o.periods,w.periods,'[]')) p
    CROSS JOIN LATERAL (SELECT int4range((extract(epoch FROM (p->>'start')::time)/60)::int,
      (extract(epoch FROM (p->>'end')::time)/60)::int) *
      int4range(coalesce(rr.start_minute,0), coalesce(rr.start_minute + rr.duration_hours*60,1440)) AS span) bounds
    WHERE rr.clinic_id = p_clinic AND rr.resource_id = p_device AND rr.available AND r.status = 'active'
      AND rr.ends_on >= p_from AND rr.starts_on <= p_to AND coalesce(o.is_available,w.is_available,false)
      AND NOT isempty(bounds.span) AND NOT EXISTS (SELECT FROM luminix.schedule_closures c
        WHERE c.clinic_id = p_clinic AND c.professional_id IS NULL AND d.day::date BETWEEN c.starts_on AND c.ends_on)
$$;

CREATE FUNCTION luminix.service_rental_calendar(p_clinic uuid, p_service uuid, p_from date, p_to date)
RETURNS TABLE(day date, spans int4multirange) LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT win.day, range_agg(win.span) FROM luminix.service_resources sr
    JOIN luminix.resources r ON r.clinic_id = sr.clinic_id AND r.id = sr.resource_id
    CROSS JOIN LATERAL luminix.equipment_windows(p_clinic,r.id,p_from,p_to) win
    WHERE sr.clinic_id = p_clinic AND sr.service_id = p_service AND r.type = 'equipment'
      AND r.availability_mode = 'manual_release'
    GROUP BY win.day
$$;

CREATE FUNCTION luminix.requires_rental(p_clinic uuid, p_service uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT s.booking_mode = 'manual_release' OR EXISTS (
    SELECT FROM luminix.service_resources sr JOIN luminix.resources r
      ON r.clinic_id = sr.clinic_id AND r.id = sr.resource_id
    WHERE sr.clinic_id = p_clinic AND sr.service_id = s.id AND r.type = 'equipment' AND r.availability_mode = 'manual_release')
    FROM luminix.services s WHERE s.clinic_id = p_clinic AND s.id = p_service
$$;

CREATE OR REPLACE FUNCTION luminix.service_rental_days(p_clinic uuid, p_service uuid, p_from date, p_to date)
RETURNS text[] LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN luminix.requires_rental(p_clinic,p_service) THEN ARRAY(
    SELECT day::text FROM luminix.service_rental_calendar(p_clinic,p_service,p_from,p_to) c
    WHERE EXISTS (SELECT FROM unnest(c.spans) span WHERE upper(span)-lower(span) >=
      (SELECT duration_minutes FROM luminix.services WHERE clinic_id=p_clinic AND id=p_service)) ORDER BY day) END
$$;

CREATE FUNCTION luminix.booking_rental_hours(p_clinic uuid, p_service uuid, p_package uuid, p_day date)
RETURNS int4multirange LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  WITH items AS (SELECT p_service AS id UNION SELECT i.service_id FROM luminix.client_package_items i
    JOIN luminix.client_packages cp ON cp.clinic_id = i.clinic_id AND cp.id = i.client_package_id
    WHERE i.clinic_id = p_clinic AND cp.id = p_package AND cp.kind = 'combo')
  SELECT range_intersect_agg(coalesce(c.spans,'{}'::int4multirange)) FROM items
    LEFT JOIN LATERAL luminix.service_rental_calendar(p_clinic,items.id,p_day,p_day) c ON true
    WHERE luminix.requires_rental(p_clinic,items.id)
$$;

CREATE FUNCTION luminix.minute_pairs(p_ranges int4multirange) RETURNS jsonb
LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_array(lower(r),upper(r)) ORDER BY lower(r)),'[]') FROM unnest(p_ranges) r
$$;

CREATE FUNCTION luminix.rental_fits(p_clinic uuid, p_service uuid, p_package uuid,
  p_start timestamp, p_end timestamp) RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN spans IS NULL THEN true WHEN p_end > p_start::date + interval '1 day' THEN false
    ELSE spans @> int4range(floor(extract(epoch FROM p_start-p_start::date)/60)::int,
      ceil(extract(epoch FROM p_end-p_start::date)/60)::int) END
    FROM luminix.booking_rental_hours(p_clinic,p_service,p_package,p_start::date) spans
$$;

CREATE OR REPLACE FUNCTION luminix.check_appointment_equipment() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE zone text;
BEGIN
  SELECT timezone INTO zone FROM luminix.clinic_settings WHERE clinic_id = NEW.clinic_id;
  IF NOT luminix.rental_fits(NEW.clinic_id,NEW.service_id,NEW.client_package_id,
    NEW.starts_at AT TIME ZONE coalesce(zone,'America/Sao_Paulo'), NEW.ends_at AT TIME ZONE coalesce(zone,'America/Sao_Paulo')) THEN
    RAISE EXCEPTION 'Equipment unavailable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION luminix.exclusive_rental_blocks(p_clinic uuid, p_service uuid, p_day date)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM luminix.resource_rentals rr
      JOIN luminix.resources r ON r.clinic_id = rr.clinic_id AND r.id = rr.resource_id
     WHERE rr.clinic_id = p_clinic AND rr.available AND rr.exclusive AND r.status = 'active'
       AND p_day BETWEEN rr.starts_on AND rr.ends_on
  ) AND NOT EXISTS (
    SELECT 1 FROM luminix.resource_rentals rr
      JOIN luminix.resources r ON r.clinic_id = rr.clinic_id AND r.id = rr.resource_id
      JOIN luminix.service_resources sr ON sr.clinic_id = rr.clinic_id AND sr.resource_id = rr.resource_id
     WHERE rr.clinic_id = p_clinic AND rr.available AND rr.exclusive AND r.status = 'active'
       AND p_day BETWEEN rr.starts_on AND rr.ends_on AND sr.service_id = p_service
  )
$$;

CREATE OR REPLACE FUNCTION luminix.schedule_fitting_appointments(p_clinic uuid)
RETURNS TABLE (appointment_id uuid) LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  WITH zone AS (
    SELECT coalesce((SELECT timezone FROM luminix.clinic_settings WHERE clinic_id = p_clinic),
      'America/Sao_Paulo') AS tz
  ), open AS (
    SELECT a.id, a.service_id, a.client_package_id, a.professional_id,
           (a.starts_at AT TIME ZONE zone.tz) AS ls, (a.ends_at AT TIME ZONE zone.tz) AS le
      FROM luminix.appointments a CROSS JOIN zone
     WHERE a.clinic_id = p_clinic AND a.status IN ('scheduled', 'confirmed') AND a.starts_at > now()
  ), day AS (
    SELECT id, service_id, client_package_id, ls, le, professional_id, ls::date AS d, extract(dow FROM ls)::int AS dow,
           to_char(ls, 'HH24:MI') AS s, to_char(le, 'HH24:MI') AS e
      FROM open WHERE le::date = ls::date
  )
  SELECT x.id FROM day x
    LEFT JOIN luminix.schedule_overrides o ON o.clinic_id = p_clinic AND o.local_date = x.d
    LEFT JOIN luminix.weekly_availability w ON w.clinic_id = p_clinic AND w.weekday = x.dow
    LEFT JOIN luminix.professional_schedule_overrides po ON po.clinic_id = p_clinic
      AND po.professional_id = x.professional_id AND po.local_date = x.d
    LEFT JOIN luminix.professional_weekly_availability pw ON pw.clinic_id = p_clinic
      AND pw.professional_id = x.professional_id AND pw.weekday = x.dow
   WHERE NOT EXISTS (
       SELECT 1 FROM luminix.schedule_closures c
        WHERE c.clinic_id = p_clinic AND x.d BETWEEN c.starts_on AND c.ends_on
          AND (c.professional_id IS NULL OR c.professional_id = x.professional_id))
     AND CASE
       WHEN x.professional_id IS NULL THEN
         coalesce(o.is_available, w.is_available, false)
           AND luminix.periods_cover(coalesce(o.periods, w.periods), x.s, x.e)
       WHEN po.id IS NOT NULL THEN
         coalesce(o.is_available, w.is_available, false)
           AND luminix.periods_cover(coalesce(o.periods, w.periods), x.s, x.e)
           AND po.is_available AND luminix.periods_cover(po.periods, x.s, x.e)
       WHEN o.id IS NOT NULL THEN
         o.is_available AND luminix.periods_cover(o.periods, x.s, x.e)
           AND (pw.id IS NULL OR (pw.is_available AND luminix.periods_cover(pw.periods, x.s, x.e)))
       WHEN pw.id IS NOT NULL THEN
         pw.is_available AND luminix.periods_cover(pw.periods, x.s, x.e)
       ELSE coalesce(w.is_available, false) AND luminix.periods_cover(w.periods, x.s, x.e)
     END
     AND luminix.rental_fits(p_clinic,x.service_id,x.client_package_id,x.ls,x.le)
     AND NOT luminix.exclusive_rental_blocks(p_clinic, x.service_id, x.d)
$$;
REVOKE ALL ON FUNCTION luminix.set_rental_window(uuid,uuid,boolean,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_rental_window(uuid,uuid,boolean,integer,integer) TO luminix_api;
REVOKE ALL ON FUNCTION luminix.equipment_windows(uuid,uuid,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.equipment_windows(uuid,uuid,date,date) TO luminix_api;
REVOKE ALL ON FUNCTION luminix.service_rental_calendar(uuid,uuid,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.service_rental_calendar(uuid,uuid,date,date) TO luminix_api;
REVOKE ALL ON FUNCTION luminix.requires_rental(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.requires_rental(uuid,uuid) TO luminix_api;
REVOKE ALL ON FUNCTION luminix.booking_rental_hours(uuid,uuid,uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.booking_rental_hours(uuid,uuid,uuid,date) TO luminix_api;
REVOKE ALL ON FUNCTION luminix.minute_pairs(int4multirange) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.minute_pairs(int4multirange) TO luminix_api;
REVOKE ALL ON FUNCTION luminix.rental_fits(uuid,uuid,uuid,timestamp,timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.rental_fits(uuid,uuid,uuid,timestamp,timestamp) TO luminix_api;

-- "Deixar disponível" no aparelho: entra na divulgação (banner 2:1 na página das clientes e
-- post para as redes do espaço, a gerar em Marketing). Só guarda a escolha por enquanto.
ALTER TABLE luminix.resources ADD COLUMN promote boolean NOT NULL DEFAULT false;

CREATE FUNCTION luminix.set_equipment_promotion(p_clinic uuid, p_equipment uuid, p_promote boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_promote IS NULL THEN
    RAISE EXCEPTION 'Invalid equipment' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  UPDATE luminix.resources SET promote = p_promote
   WHERE clinic_id = p_clinic AND id = p_equipment AND type = 'equipment';
  IF NOT FOUND THEN RAISE EXCEPTION 'Equipment not found' USING ERRCODE = 'P0002'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.set_equipment_promotion(uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_equipment_promotion(uuid,uuid,boolean) TO luminix_api;
