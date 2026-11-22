-- Regra de impacto da agenda (ADR-035, revisão):
-- * dia fechado (espaço fechado, data especial fechada, fechamento/férias, folga da
--   profissional) cancela TODOS os atendimentos daquele dia/profissional;
-- * horário reduzido: o atendimento só é cancelado se não começar dentro do expediente ou se
--   menos da metade dele couber; se começa dentro e ao menos metade cabe, só passa do horário
--   (aviso na confirmação, sem cancelar). Ex.: 15h–19h com fechamento às 17h fica;
--   16h30–18h com fechamento às 17h é cancelado.

CREATE FUNCTION luminix.hhmm(p text) RETURNS integer LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog AS $$
  SELECT split_part(p, ':', 1)::int * 60 + split_part(p, ':', 2)::int
$$;
REVOKE ALL ON FUNCTION luminix.hhmm(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.hhmm(text) TO luminix_api;

-- 'ok' (fits), 'overrun' (starts inside and at least half fits) or 'out'. p_b NULL = no limit.
CREATE FUNCTION luminix.window_state(p_a jsonb, p_b jsonb, p_s integer, p_e integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  WITH a AS (
    SELECT luminix.hhmm(x->>'start') AS s, luminix.hhmm(x->>'end') AS e
      FROM jsonb_array_elements(coalesce(p_a, '[]'::jsonb)) x
  ), b AS (
    SELECT luminix.hhmm(x->>'start') AS s, luminix.hhmm(x->>'end') AS e
      FROM jsonb_array_elements(coalesce(p_b, '[]'::jsonb)) x
    UNION ALL SELECT 0, 1440 WHERE p_b IS NULL
  ), w AS (
    SELECT greatest(a.s, b.s) AS s, least(a.e, b.e) AS e FROM a CROSS JOIN b
     WHERE greatest(a.s, b.s) < least(a.e, b.e)
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM w WHERE w.s <= p_s AND w.e >= p_e) THEN 'ok'
    WHEN EXISTS (SELECT 1 FROM w WHERE w.s <= p_s AND p_s < w.e)
      AND (SELECT coalesce(sum(greatest(0, least(p_e, w.e) - greatest(p_s, w.s))), 0) FROM w) * 2
        >= p_e - p_s THEN 'overrun'
    ELSE 'out' END
$$;
REVOKE ALL ON FUNCTION luminix.window_state(jsonb, jsonb, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.window_state(jsonb, jsonb, integer, integer) TO luminix_api;

-- State of every future open appointment against the current agenda. `closed` = the day is
-- closed for it (space, closure, the professional's day off or leave).
CREATE FUNCTION luminix.schedule_appointment_states(p_clinic uuid)
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
REVOKE ALL ON FUNCTION luminix.schedule_appointment_states(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.schedule_appointment_states(uuid) TO luminix_api;
