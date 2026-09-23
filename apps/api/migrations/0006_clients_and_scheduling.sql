-- First operational slice for clinic-local CRM and scheduling.
-- Additive migration: no legacy data is copied and existing rows keep their meaning.

ALTER TABLE luminix.clinic_clients
  ADD COLUMN contact_email text,
  ADD COLUMN birth_date date,
  ADD COLUMN notes text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT clinic_clients_contact_email_check CHECK (
    contact_email IS NULL OR (
      length(contact_email) <= 254
      AND contact_email = lower(trim(contact_email))
      AND contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  ADD CONSTRAINT clinic_clients_notes_check CHECK (notes IS NULL OR length(notes) <= 4000);

CREATE FUNCTION luminix.valid_schedule_periods(periods jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT jsonb_typeof(periods) = 'array'
    AND jsonb_array_length(periods) <= 8
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(periods) AS item
      WHERE jsonb_typeof(item) <> 'object'
        OR item->>'start' !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
        OR item->>'end' !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
        OR item->>'start' >= item->>'end'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(periods) WITH ORDINALITY AS a(item, position)
      JOIN jsonb_array_elements(periods) WITH ORDINALITY AS b(item, position)
        ON a.position < b.position
      WHERE a.item->>'start' < b.item->>'end'
        AND b.item->>'start' < a.item->>'end'
    )
$$;

CREATE TABLE luminix.weekly_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_available boolean NOT NULL DEFAULT false,
  periods jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    luminix.valid_schedule_periods(periods)
    AND (is_available OR periods = '[]'::jsonb)
  ),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  UNIQUE (clinic_id, weekday)
);

CREATE TABLE luminix.schedule_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  local_date date NOT NULL,
  is_available boolean NOT NULL DEFAULT false,
  periods jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    luminix.valid_schedule_periods(periods)
    AND (is_available OR periods = '[]'::jsonb)
  ),
  reason text CHECK (reason IS NULL OR length(trim(reason)) BETWEEN 1 AND 240),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  UNIQUE (clinic_id, local_date)
);

CREATE TABLE luminix.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  clinic_client_id uuid NOT NULL,
  service_id uuid NOT NULL,
  professional_id uuid,
  created_by_membership_id uuid,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('scheduled', 'confirmed', 'completed', 'canceled', 'no_show')),
  booking_source text NOT NULL CHECK (booking_source IN ('manager', 'client', 'import')),
  override_reasons text[] NOT NULL DEFAULT '{}'
    CHECK (override_reasons <@ ARRAY['past', 'outside_availability', 'overlap']::text[]),
  notes text CHECK (notes IS NULL OR length(notes) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  FOREIGN KEY (clinic_id, clinic_client_id) REFERENCES luminix.clinic_clients(clinic_id, id),
  FOREIGN KEY (clinic_id, service_id) REFERENCES luminix.services(clinic_id, id),
  FOREIGN KEY (clinic_id, professional_id) REFERENCES luminix.professionals(clinic_id, id),
  FOREIGN KEY (clinic_id, created_by_membership_id)
    REFERENCES luminix.clinic_memberships(clinic_id, id)
);

CREATE INDEX clinic_clients_name_search
  ON luminix.clinic_clients (clinic_id, lower(display_name), id);
CREATE INDEX appointments_clinic_timeline
  ON luminix.appointments (clinic_id, starts_at, id);
CREATE INDEX appointments_client_timeline
  ON luminix.appointments (clinic_id, clinic_client_id, starts_at DESC);
CREATE INDEX appointments_professional_timeline
  ON luminix.appointments (clinic_id, professional_id, starts_at)
  WHERE professional_id IS NOT NULL AND status IN ('scheduled', 'confirmed');

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['weekly_availability', 'schedule_overrides', 'appointments'] LOOP
    EXECUTE format('ALTER TABLE luminix.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE luminix.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY clinic_scope ON luminix.%I USING (clinic_id = luminix.current_clinic_id()) WITH CHECK (clinic_id = luminix.current_clinic_id())',
      table_name
    );
    EXECUTE format(
      'CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.%I FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move()',
      table_name
    );
    EXECUTE format(
      'CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.%I FOR EACH ROW EXECUTE FUNCTION luminix.audit_change()',
      table_name
    );
  END LOOP;
END $$;

CREATE FUNCTION luminix.create_clinic_client(
  p_clinic uuid, p_name text, p_phone text, p_email text, p_birth_date date, p_notes text
) RETURNS luminix.clinic_clients
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE result luminix.clinic_clients%ROWTYPE;
BEGIN
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'client:manage');
  INSERT INTO luminix.clinic_clients
    (clinic_id, display_name, contact_phone, contact_email, birth_date, notes)
  VALUES (p_clinic, p_name, p_phone, p_email, p_birth_date, p_notes)
  RETURNING * INTO result;
  RETURN result;
END $$;

CREATE FUNCTION luminix.create_manager_appointment(
  p_clinic uuid, p_client uuid, p_service uuid, p_professional uuid,
  p_starts_at timestamptz, p_ends_at timestamptz, p_override_reasons text[], p_notes text
) RETURNS luminix.appointments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE result luminix.appointments%ROWTYPE; v_membership uuid;
BEGIN
  SELECT membership_id INTO v_membership FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'clinic:manage');
  INSERT INTO luminix.appointments
    (clinic_id, clinic_client_id, service_id, professional_id, created_by_membership_id,
     starts_at, ends_at, status, booking_source, override_reasons, notes)
  VALUES (p_clinic, p_client, p_service, p_professional, v_membership,
    p_starts_at, p_ends_at, 'confirmed', 'manager', p_override_reasons, p_notes)
  RETURNING * INTO result;
  RETURN result;
END $$;

CREATE FUNCTION luminix.save_weekly_availability(
  p_clinic uuid, p_weekday smallint, p_is_available boolean, p_periods jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'clinic:manage');
  INSERT INTO luminix.weekly_availability (clinic_id, weekday, is_available, periods)
  VALUES (p_clinic, p_weekday, p_is_available, p_periods)
  ON CONFLICT (clinic_id, weekday) DO UPDATE SET
    is_available = EXCLUDED.is_available, periods = EXCLUDED.periods, updated_at = now();
END $$;

CREATE FUNCTION luminix.save_schedule_override(
  p_clinic uuid, p_date date, p_use_default boolean, p_is_available boolean,
  p_periods jsonb, p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'clinic:manage');
  IF p_use_default THEN
    DELETE FROM luminix.schedule_overrides WHERE clinic_id = p_clinic AND local_date = p_date;
    RETURN;
  END IF;
  INSERT INTO luminix.schedule_overrides (clinic_id, local_date, is_available, periods, reason)
  VALUES (p_clinic, p_date, p_is_available, p_periods, p_reason)
  ON CONFLICT (clinic_id, local_date) DO UPDATE SET
    is_available = EXCLUDED.is_available, periods = EXCLUDED.periods,
    reason = EXCLUDED.reason, updated_at = now();
END $$;

REVOKE ALL ON FUNCTION luminix.create_clinic_client(uuid, text, text, text, date, text),
  luminix.create_manager_appointment(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text[], text),
  luminix.save_weekly_availability(uuid, smallint, boolean, jsonb),
  luminix.save_schedule_override(uuid, date, boolean, boolean, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.create_clinic_client(uuid, text, text, text, date, text),
  luminix.create_manager_appointment(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text[], text),
  luminix.save_weekly_availability(uuid, smallint, boolean, jsonb),
  luminix.save_schedule_override(uuid, date, boolean, boolean, jsonb, text) TO luminix_api;
GRANT SELECT ON luminix.clinic_clients, luminix.weekly_availability,
  luminix.schedule_overrides, luminix.appointments, luminix.services,
  luminix.professionals, luminix.clinic_settings TO luminix_api;
