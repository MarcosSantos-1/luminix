-- Keep every onboarding choice in queryable columns when the draft is formalized.
-- The draft row itself stays, with status, step, version and the full payload.

ALTER TABLE luminix.clinic_profiles
  ADD COLUMN team_mode text NOT NULL DEFAULT 'solo'
    CHECK (team_mode IN ('solo', 'team'));

ALTER TABLE luminix.professionals
  ADD COLUMN gender text
    CHECK (gender IS NULL OR gender IN ('female', 'male'));

ALTER TABLE luminix.weekly_availability
  ADD COLUMN day_schedule jsonb,
  ADD CONSTRAINT weekly_availability_day_schedule_check CHECK (
    day_schedule IS NULL OR jsonb_typeof(day_schedule) = 'object'
  );

ALTER TABLE luminix.professional_weekly_availability
  ADD COLUMN day_schedule jsonb,
  ADD CONSTRAINT professional_weekly_availability_day_schedule_check CHECK (
    day_schedule IS NULL OR jsonb_typeof(day_schedule) = 'object'
  );

CREATE OR REPLACE FUNCTION luminix.persist_completed_schedule_details()
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
         team_mode = CASE
           WHEN NEW.payload->>'teamMode' IN ('solo', 'team') THEN NEW.payload->>'teamMode'
           ELSE 'solo'
         END,
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

  UPDATE luminix.weekly_availability AS availability
     SET day_schedule = day.value
    FROM jsonb_array_elements(coalesce(NEW.payload->'businessHours', '[]'::jsonb)) AS day(value)
   WHERE availability.clinic_id = NEW.clinic_id
     AND availability.weekday = (day.value->>'weekday')::smallint;

  UPDATE luminix.professional_weekly_availability AS availability
     SET home_visit = coalesce((day.value->>'homeVisit')::boolean, false),
         custom_break = coalesce((day.value->>'customBreak')::boolean, false),
         day_schedule = day.value
    FROM jsonb_array_elements(coalesce(NEW.payload->'professionalSchedules', '[]'::jsonb)) AS sched(value)
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(sched.value->'days', '[]'::jsonb)) AS day(value)
   WHERE availability.clinic_id = NEW.clinic_id
     AND availability.professional_id = (sched.value->>'professionalId')::uuid
     AND availability.weekday = (day.value->>'weekday')::smallint;

  UPDATE luminix.professionals AS professional
     SET gender = CASE
           WHEN person.value->>'gender' IN ('female', 'male') THEN person.value->>'gender'
           ELSE professional.gender
         END,
         holiday_hours = CASE
           WHEN jsonb_typeof(matched.schedule->'holidayHours') = 'object' THEN matched.schedule->'holidayHours'
           ELSE NULL
         END
    FROM jsonb_array_elements(coalesce(NEW.payload->'professionals', '[]'::jsonb)) AS person(value)
    LEFT JOIN LATERAL (
      SELECT entry.value AS schedule
        FROM jsonb_array_elements(coalesce(NEW.payload->'professionalSchedules', '[]'::jsonb)) AS entry(value)
       WHERE entry.value->>'professionalId' = person.value->>'id'
       LIMIT 1
    ) AS matched ON true
   WHERE professional.clinic_id = NEW.clinic_id
     AND professional.id = (person.value->>'id')::uuid;
  RETURN NEW;
END $$;
