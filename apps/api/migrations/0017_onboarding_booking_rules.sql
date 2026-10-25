-- Additive configuration only; client booking enforcement is a separate delivery.
-- Nullable defaults preserve existing clinics' behavior until explicitly configured.
ALTER TABLE luminix.booking_policies
  ADD COLUMN booking_notice_minutes integer CHECK (booking_notice_minutes BETWEEN 0 AND 10080),
  ADD COLUMN booking_window_days integer CHECK (booking_window_days BETWEEN 7 AND 365),
  ADD COLUMN rescheduling_notice_minutes integer CHECK (rescheduling_notice_minutes BETWEEN 0 AND 20160),
  ADD COLUMN client_instructions text NOT NULL DEFAULT '' CHECK (char_length(client_instructions) <= 500);

-- Follow the existing completion-trigger pattern; never use draft data as operational data.
CREATE FUNCTION luminix.persist_completed_booking_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_preferences jsonb := NEW.payload->'preferences';
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;
  UPDATE luminix.booking_policies
     SET booking_notice_minutes = (v_preferences->>'bookingNoticeHours')::integer * 60,
         booking_window_days = (v_preferences->>'bookingWindowDays')::integer,
         rescheduling_notice_minutes = (v_preferences->>'reschedulingHours')::integer * 60,
         client_instructions = coalesce(v_preferences->>'clientInstructions', '')
   WHERE clinic_id = NEW.clinic_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION luminix.persist_completed_booking_rules() FROM PUBLIC;
CREATE TRIGGER persist_completed_booking_rules
  AFTER UPDATE ON luminix.onboarding_drafts
  FOR EACH ROW EXECUTE FUNCTION luminix.persist_completed_booking_rules();
