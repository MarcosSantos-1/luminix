-- Configuration only. No charge, refund, session debit or booking enforcement.
-- Zero means no retention; null on a service inherits the clinic preference.
ALTER TABLE luminix.booking_policies
  ADD COLUMN late_change_retention_percent integer NOT NULL DEFAULT 0
    CHECK (late_change_retention_percent BETWEEN 0 AND 100),
  ADD COLUMN no_show_retention_percent integer NOT NULL DEFAULT 0
    CHECK (no_show_retention_percent BETWEEN 0 AND 100);

ALTER TABLE luminix.services
  ADD COLUMN late_change_retention_percent integer
    CHECK (late_change_retention_percent BETWEEN 0 AND 100),
  ADD COLUMN no_show_retention_percent integer
    CHECK (no_show_retention_percent BETWEEN 0 AND 100);

CREATE FUNCTION luminix.persist_completed_attendance_preferences()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_preferences jsonb := NEW.payload->'preferences';
  v_service jsonb;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;
  -- Completion already authorizes and materializes records in the same transaction.
  -- An explicit clinic predicate remains mandatory even inside this definer trigger.
  UPDATE luminix.booking_policies
     SET late_change_retention_percent = coalesce((v_preferences->>'lateChangeRetentionPercent')::integer, 0),
         no_show_retention_percent = coalesce((v_preferences->>'noShowRetentionPercent')::integer, 0)
   WHERE clinic_id = NEW.clinic_id;
  FOR v_service IN SELECT value FROM jsonb_array_elements(NEW.payload->'services') LOOP
    UPDATE luminix.services
       SET late_change_retention_percent = (v_service->>'lateChangeRetentionPercent')::integer,
           no_show_retention_percent = (v_service->>'noShowRetentionPercent')::integer
     WHERE clinic_id = NEW.clinic_id AND id = (v_service->>'id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Service not in completed clinic' USING ERRCODE = '23503';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION luminix.persist_completed_attendance_preferences() FROM PUBLIC;
CREATE TRIGGER persist_completed_attendance_preferences
  AFTER UPDATE ON luminix.onboarding_drafts
  FOR EACH ROW EXECUTE FUNCTION luminix.persist_completed_attendance_preferences();
