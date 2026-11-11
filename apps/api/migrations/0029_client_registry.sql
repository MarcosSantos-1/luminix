-- Clinic-local client registry: CPF, sex, origin and message consent, plus edit/archive paths.
-- Additive (expand step): create_clinic_client(6 args) from 0006 is kept so the API running in
-- production keeps working between this migration and the next deploy.

ALTER TABLE luminix.clinic_clients
  ADD COLUMN tax_id text,
  ADD COLUMN sex text,
  ADD COLUMN source text NOT NULL DEFAULT 'manager',
  ADD COLUMN marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN marketing_opt_in_at timestamptz,
  -- Format only (11 digits, no punctuation). Check digits are validated by the API.
  ADD CONSTRAINT clinic_clients_tax_id_check CHECK (tax_id IS NULL OR tax_id ~ '^[0-9]{11}$'),
  ADD CONSTRAINT clinic_clients_sex_check CHECK (
    sex IS NULL OR sex IN ('female', 'male', 'other', 'undisclosed')
  ),
  ADD CONSTRAINT clinic_clients_source_check CHECK (source IN ('manager', 'import', 'client_app')),
  -- Consent is a fact with a date: opted in <=> timestamp present.
  ADD CONSTRAINT clinic_clients_marketing_consent_check CHECK (
    marketing_opt_in = (marketing_opt_in_at IS NOT NULL)
  );

-- The same CPF cannot be two active-or-archived registrations in one clinic (reactivate instead).
CREATE UNIQUE INDEX clinic_clients_tax_id_unique
  ON luminix.clinic_clients (clinic_id, tax_id) WHERE tax_id IS NOT NULL;

-- Duplicate warning on create/edit and, later, matching invites by phone.
CREATE INDEX clinic_clients_phone_lookup
  ON luminix.clinic_clients (clinic_id, contact_phone) WHERE contact_phone IS NOT NULL;

CREATE FUNCTION luminix.create_clinic_client_v2(
  p_clinic uuid, p_name text, p_phone text, p_email text, p_birth_date date, p_notes text,
  p_tax_id text, p_sex text, p_marketing_opt_in boolean
) RETURNS luminix.clinic_clients
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE result luminix.clinic_clients%ROWTYPE;
BEGIN
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'client:manage');
  INSERT INTO luminix.clinic_clients
    (clinic_id, display_name, contact_phone, contact_email, birth_date, notes,
     tax_id, sex, source, marketing_opt_in, marketing_opt_in_at)
  VALUES (p_clinic, p_name, p_phone, p_email, p_birth_date, p_notes,
    p_tax_id, p_sex, 'manager', coalesce(p_marketing_opt_in, false),
    CASE WHEN coalesce(p_marketing_opt_in, false) THEN now() END)
  RETURNING * INTO result;
  RETURN result;
END $$;

-- Replaces every editable field. Returns no row when the client does not exist in the clinic.
CREATE FUNCTION luminix.update_clinic_client(
  p_clinic uuid, p_id uuid, p_name text, p_phone text, p_email text, p_birth_date date,
  p_notes text, p_tax_id text, p_sex text, p_marketing_opt_in boolean
) RETURNS SETOF luminix.clinic_clients
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'client:manage');
  RETURN QUERY
  UPDATE luminix.clinic_clients SET
    display_name = p_name,
    contact_phone = p_phone,
    contact_email = p_email,
    birth_date = p_birth_date,
    notes = p_notes,
    tax_id = p_tax_id,
    sex = p_sex,
    marketing_opt_in = coalesce(p_marketing_opt_in, false),
    -- Keep the original consent date while it stays opted in; clear it on opt-out.
    marketing_opt_in_at = CASE
      WHEN NOT coalesce(p_marketing_opt_in, false) THEN NULL
      ELSE coalesce(marketing_opt_in_at, now())
    END,
    updated_at = now()
  WHERE clinic_id = p_clinic AND id = p_id
  RETURNING *;
END $$;

CREATE FUNCTION luminix.set_clinic_client_status(p_clinic uuid, p_id uuid, p_status text)
RETURNS SETOF luminix.clinic_clients
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'client:manage');
  IF p_status NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION 'invalid client status' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  UPDATE luminix.clinic_clients SET status = p_status, updated_at = now()
   WHERE clinic_id = p_clinic AND id = p_id
  RETURNING *;
END $$;

REVOKE ALL ON FUNCTION
  luminix.create_clinic_client_v2(uuid, text, text, text, date, text, text, text, boolean),
  luminix.update_clinic_client(uuid, uuid, text, text, text, date, text, text, text, boolean),
  luminix.set_clinic_client_status(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  luminix.create_clinic_client_v2(uuid, text, text, text, date, text, text, text, boolean),
  luminix.update_clinic_client(uuid, uuid, text, text, text, date, text, text, text, boolean),
  luminix.set_clinic_client_status(uuid, uuid, text) TO luminix_api;
