-- Configuration only: deposits do not initiate charges or change retention rules.
ALTER TABLE luminix.booking_policies
  ADD COLUMN deposit_scope text NOT NULL DEFAULT 'none'
    CHECK (deposit_scope IN ('none', 'all', 'threshold', 'special', 'selected')),
  ADD COLUMN deposit_percent integer NOT NULL DEFAULT 20
    CHECK (deposit_percent BETWEEN 1 AND 100),
  ADD COLUMN deposit_threshold_cents integer NOT NULL DEFAULT 30000
    CHECK (deposit_threshold_cents BETWEEN 1 AND 100000000);
ALTER TABLE luminix.services
  ADD COLUMN deposit_required boolean NOT NULL DEFAULT false;

CREATE FUNCTION luminix.persist_completed_deposit_preferences()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_preferences jsonb := NEW.payload->'preferences';
  v_service jsonb;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;
  UPDATE luminix.booking_policies
     SET deposit_scope = coalesce(v_preferences->>'depositScope', 'none'),
         deposit_percent = coalesce((v_preferences->>'depositPercent')::integer, 20),
         deposit_threshold_cents = coalesce((v_preferences->>'depositThresholdCents')::integer, 30000)
   WHERE clinic_id = NEW.clinic_id;
  FOR v_service IN SELECT value FROM jsonb_array_elements(NEW.payload->'services') LOOP
    UPDATE luminix.services
       SET deposit_required = coalesce((v_service->>'depositRequired')::boolean, false)
     WHERE clinic_id = NEW.clinic_id AND id = (v_service->>'id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Service not in completed clinic' USING ERRCODE = '23503';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION luminix.persist_completed_deposit_preferences() FROM PUBLIC;
CREATE TRIGGER persist_completed_deposit_preferences
  AFTER UPDATE ON luminix.onboarding_drafts
  FOR EACH ROW EXECUTE FUNCTION luminix.persist_completed_deposit_preferences();
