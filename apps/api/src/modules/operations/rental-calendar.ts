// Used with the appointment alias "a". A combo needs every treatment on the same day.
export const appointmentRentalDates = `CASE WHEN a.client_package_id IS NULL THEN
  luminix.service_rental_days(a.clinic_id,a.service_id,luminix.clinic_today(),'infinity')
ELSE (
  WITH calendars AS MATERIALIZED (
    SELECT luminix.service_rental_days(a.clinic_id, ids.service_id,luminix.clinic_today(),'infinity') AS days
      FROM (SELECT a.service_id UNION
            SELECT i.service_id FROM luminix.client_package_items i
              JOIN luminix.client_packages p ON p.clinic_id = i.clinic_id AND p.id = i.client_package_id
             WHERE i.clinic_id = a.clinic_id AND p.id = a.client_package_id AND p.kind = 'combo') ids
  )
  SELECT CASE WHEN count(days) > 0 THEN ARRAY(
    SELECT day FROM calendars CROSS JOIN LATERAL unnest(days) day
    GROUP BY day HAVING count(*) = (SELECT count(days) FROM calendars) ORDER BY day
  ) END FROM calendars
) END`
