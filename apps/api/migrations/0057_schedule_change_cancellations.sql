-- Cancelamentos por mudança de agenda (ADR-035).
-- 1. Locação exclusiva: o dia do aluguel fica reservado aos tratamentos daquele aparelho.
-- 2. schedule_fitting_appointments: atendimentos futuros que cabem na agenda atual. A API
--    compara antes/depois de uma mudança (horário, data especial, fechamento, locação) para
--    listar quem deixaria de caber e, se a gestora confirmar, cancelar e avisar.
-- 3. cancel_for_schedule_change: cancela com origem registrada para o aviso da cliente.

ALTER TABLE luminix.resource_rentals
  ADD COLUMN exclusive boolean NOT NULL DEFAULT false;

ALTER TABLE luminix.appointments
  ADD COLUMN canceled_at timestamptz,
  ADD COLUMN cancellation_origin text
    CHECK (cancellation_origin IS NULL OR cancellation_origin IN ('schedule_change'));

-- The manager books on an exclusive rental day only after confirming (chave mestra).
ALTER TABLE luminix.appointments DROP CONSTRAINT appointments_override_reasons_check;
ALTER TABLE luminix.appointments ADD CONSTRAINT appointments_override_reasons_check
  CHECK (override_reasons <@ ARRAY['past', 'outside_availability', 'overlap', 'closure',
    'equipment', 'exclusive']::text[]);

-- Every period of p_periods ('HH:MM' text) that holds [p_start, p_end].
CREATE FUNCTION luminix.periods_cover(p_periods jsonb, p_start text, p_end text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(p_periods, '[]'::jsonb)) p
     WHERE p->>'start' <= p_start AND p->>'end' >= p_end
  )
$$;
REVOKE ALL ON FUNCTION luminix.periods_cover(jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.periods_cover(jsonb, text, text) TO luminix_api;

-- Services not served by an exclusive rental of that day (NULL when the day is not exclusive).
CREATE FUNCTION luminix.exclusive_rental_blocks(p_clinic uuid, p_service uuid, p_day date)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM luminix.resource_rentals rr
      JOIN luminix.resources r ON r.clinic_id = rr.clinic_id AND r.id = rr.resource_id
     WHERE rr.clinic_id = p_clinic AND rr.exclusive AND r.status = 'active'
       AND p_day BETWEEN rr.starts_on AND rr.ends_on
  ) AND NOT EXISTS (
    SELECT 1 FROM luminix.resource_rentals rr
      JOIN luminix.resources r ON r.clinic_id = rr.clinic_id AND r.id = rr.resource_id
      JOIN luminix.service_resources sr ON sr.clinic_id = rr.clinic_id AND sr.resource_id = rr.resource_id
     WHERE rr.clinic_id = p_clinic AND rr.exclusive AND r.status = 'active'
       AND p_day BETWEEN rr.starts_on AND rr.ends_on AND sr.service_id = p_service
  )
$$;
REVOKE ALL ON FUNCTION luminix.exclusive_rental_blocks(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.exclusive_rental_blocks(uuid, uuid, date) TO luminix_api;

-- Future open appointments that the client agenda would still offer: same rules as the client
-- slots (space day, the professional's own date/week, closures, rented device, exclusive day).
-- Appointments spanning midnight never "fit", so a change never cancels them by itself.
CREATE FUNCTION luminix.schedule_fitting_appointments(p_clinic uuid)
RETURNS TABLE (appointment_id uuid) LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  WITH zone AS (
    SELECT coalesce((SELECT timezone FROM luminix.clinic_settings WHERE clinic_id = p_clinic),
      'America/Sao_Paulo') AS tz
  ), open AS (
    SELECT a.id, a.service_id, a.professional_id,
           (a.starts_at AT TIME ZONE zone.tz) AS ls, (a.ends_at AT TIME ZONE zone.tz) AS le
      FROM luminix.appointments a CROSS JOIN zone
     WHERE a.clinic_id = p_clinic AND a.status IN ('scheduled', 'confirmed') AND a.starts_at > now()
  ), day AS (
    SELECT id, service_id, professional_id, ls::date AS d, extract(dow FROM ls)::int AS dow,
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
     AND coalesce(cardinality(luminix.service_rental_days(p_clinic, x.service_id, x.d, x.d)), 1) > 0
     AND NOT luminix.exclusive_rental_blocks(p_clinic, x.service_id, x.d)
$$;
REVOKE ALL ON FUNCTION luminix.schedule_fitting_appointments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.schedule_fitting_appointments(uuid) TO luminix_api;

-- Cancels appointments that a schedule change pushed out. p_permission is the one the route
-- authorized for the change itself (hours, vacations, team or rented equipment).
CREATE FUNCTION luminix.cancel_for_schedule_change(
  p_clinic uuid, p_appointments uuid[], p_note text, p_permission text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_count integer;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR length(coalesce(p_note, '')) > 300 OR cardinality(p_appointments) > 500
    OR p_permission IS NULL OR p_permission NOT IN ('schedule:manage', 'vacation:manage', 'professional:manage',
      'service:manage') THEN
    RAISE EXCEPTION 'Invalid cancellation' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, p_permission);
  UPDATE luminix.appointments
     SET status = 'canceled', status_note = nullif(btrim(p_note), ''), canceled_at = now(),
         cancellation_origin = 'schedule_change', updated_at = now()
   WHERE clinic_id = p_clinic AND id = ANY(p_appointments)
     AND status IN ('scheduled', 'confirmed') AND starts_at > now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION luminix.cancel_for_schedule_change(uuid, uuid[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.cancel_for_schedule_change(uuid, uuid[], text, text) TO luminix_api;

-- Exclusive flag set on save, or switched later (same permission as the rental).
CREATE FUNCTION luminix.set_rental_exclusive(p_clinic uuid, p_rental uuid, p_exclusive boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_exclusive IS NULL THEN
    RAISE EXCEPTION 'Invalid rental' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage');
  UPDATE luminix.resource_rentals SET exclusive = p_exclusive
   WHERE clinic_id = p_clinic AND id = p_rental;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rental not found' USING ERRCODE = 'P0002'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.set_rental_exclusive(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_rental_exclusive(uuid, uuid, boolean) TO luminix_api;
