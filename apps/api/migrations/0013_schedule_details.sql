-- Persist schedule choices that the onboarding draft already carries, so a later
-- settings screen can read them without parsing only the draft JSON.

ALTER TABLE luminix.clinic_profiles
  ADD COLUMN home_service boolean NOT NULL DEFAULT false,
  ADD COLUMN default_break_start time,
  ADD COLUMN default_break_end time,
  ADD COLUMN holiday_hours jsonb,
  ADD CONSTRAINT clinic_profiles_default_break_check CHECK (
    (default_break_start IS NULL AND default_break_end IS NULL)
    OR (default_break_start IS NOT NULL AND default_break_end IS NOT NULL AND default_break_start < default_break_end)
  ),
  ADD CONSTRAINT clinic_profiles_holiday_hours_check CHECK (
    holiday_hours IS NULL OR jsonb_typeof(holiday_hours) = 'object'
  );

ALTER TABLE luminix.professionals
  ADD COLUMN holiday_hours jsonb,
  ADD CONSTRAINT professionals_holiday_hours_check CHECK (
    holiday_hours IS NULL OR jsonb_typeof(holiday_hours) = 'object'
  );

ALTER TABLE luminix.professional_weekly_availability
  ADD COLUMN home_visit boolean NOT NULL DEFAULT false,
  ADD COLUMN custom_break boolean NOT NULL DEFAULT false;

CREATE FUNCTION luminix.persist_completed_schedule_details()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_break jsonb;
  v_holiday jsonb;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;
  v_break := NEW.payload->'clinic'->'defaultBreak';
  v_holiday := NEW.payload->'clinic'->'holidayHours';
  UPDATE luminix.clinic_profiles
     SET home_service = coalesce((NEW.payload->'clinic'->>'homeService')::boolean, false),
         default_break_start = CASE
           WHEN jsonb_typeof(v_break) = 'object' THEN (v_break->>'start')::time
           ELSE NULL
         END,
         default_break_end = CASE
           WHEN jsonb_typeof(v_break) = 'object' THEN (v_break->>'end')::time
           ELSE NULL
         END,
         holiday_hours = CASE WHEN jsonb_typeof(v_holiday) = 'object' THEN v_holiday ELSE NULL END
   WHERE clinic_id = NEW.clinic_id;

  UPDATE luminix.professional_weekly_availability AS availability
     SET home_visit = coalesce((day.value->>'homeVisit')::boolean, false),
         custom_break = coalesce((day.value->>'customBreak')::boolean, false)
    FROM jsonb_array_elements(coalesce(NEW.payload->'professionalSchedules', '[]'::jsonb)) AS sched(value)
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(sched.value->'days', '[]'::jsonb)) AS day(value)
   WHERE availability.clinic_id = NEW.clinic_id
     AND availability.professional_id = (sched.value->>'professionalId')::uuid
     AND availability.weekday = (day.value->>'weekday')::smallint;

  UPDATE luminix.professionals AS professional
     SET holiday_hours = CASE
           WHEN jsonb_typeof(sched.value->'holidayHours') = 'object' THEN sched.value->'holidayHours'
           ELSE NULL
         END
    FROM jsonb_array_elements(coalesce(NEW.payload->'professionalSchedules', '[]'::jsonb)) AS sched(value)
   WHERE professional.clinic_id = NEW.clinic_id
     AND professional.id = (sched.value->>'professionalId')::uuid;
  RETURN NEW;
END $$;

CREATE TRIGGER persist_completed_schedule_details
  AFTER UPDATE ON luminix.onboarding_drafts
  FOR EACH ROW EXECUTE FUNCTION luminix.persist_completed_schedule_details();
