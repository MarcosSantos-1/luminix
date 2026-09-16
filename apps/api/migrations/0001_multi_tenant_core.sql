-- Applied transactionally. No data copied from other schemas/environments.
CREATE SCHEMA luminix;
REVOKE ALL ON SCHEMA luminix FROM PUBLIC;

CREATE TABLE luminix.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text UNIQUE CHECK (length(firebase_uid) BETWEEN 1 AND 128),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE luminix.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 80),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'suspended', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE luminix.permissions (
  code text PRIMARY KEY CHECK (code ~ '^[a-z_]+:[a-z_]+$'),
  description text NOT NULL
);
INSERT INTO luminix.permissions (code, description) VALUES
  ('clinic:manage', 'Editar estabelecimento'),
  ('team:manage', 'Gerenciar vínculos e papéis'),
  ('client:read', 'Consultar cadastro local de cliente'),
  ('client:manage', 'Editar cadastro local de cliente'),
  ('professional:manage', 'Gerenciar profissionais'),
  ('service:manage', 'Gerenciar serviços'),
  ('settings:manage', 'Gerenciar configurações'),
  ('onboarding:manage', 'Gerenciar onboarding'),
  ('audit:read', 'Consultar auditoria da clínica');

CREATE TABLE luminix.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  UNIQUE (clinic_id, name)
);

CREATE TABLE luminix.role_permissions (
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  role_id uuid NOT NULL,
  permission_code text NOT NULL REFERENCES luminix.permissions(code),
  PRIMARY KEY (clinic_id, role_id, permission_code),
  FOREIGN KEY (clinic_id, role_id) REFERENCES luminix.roles(clinic_id, id)
);

CREATE TABLE luminix.clinic_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  identity_id uuid NOT NULL REFERENCES luminix.identities(id),
  role_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  UNIQUE (clinic_id, identity_id),
  FOREIGN KEY (clinic_id, role_id) REFERENCES luminix.roles(clinic_id, id)
);

-- Minimal global record; no clinical data or recovery credentials.
CREATE TABLE luminix.client_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL UNIQUE REFERENCES luminix.identities(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE luminix.clinic_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  client_profile_id uuid REFERENCES luminix.client_profiles(id),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  contact_phone text CHECK (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  UNIQUE (clinic_id, client_profile_id)
);

CREATE TABLE luminix.professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  membership_id uuid,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  UNIQUE (clinic_id, membership_id),
  FOREIGN KEY (clinic_id, membership_id) REFERENCES luminix.clinic_memberships(clinic_id, id)
);

-- Tenant-owned editable taxonomy, not a closed global enum.
CREATE TABLE luminix.occupations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  UNIQUE (clinic_id, name)
);

CREATE TABLE luminix.professional_occupations (
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  professional_id uuid NOT NULL,
  occupation_id uuid NOT NULL,
  PRIMARY KEY (clinic_id, professional_id, occupation_id),
  FOREIGN KEY (clinic_id, professional_id) REFERENCES luminix.professionals(clinic_id, id),
  FOREIGN KEY (clinic_id, occupation_id) REFERENCES luminix.occupations(clinic_id, id)
);

CREATE TABLE luminix.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id)
);

CREATE TABLE luminix.professional_services (
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  professional_id uuid NOT NULL,
  service_id uuid NOT NULL,
  PRIMARY KEY (clinic_id, professional_id, service_id),
  FOREIGN KEY (clinic_id, professional_id) REFERENCES luminix.professionals(clinic_id, id),
  FOREIGN KEY (clinic_id, service_id) REFERENCES luminix.services(clinic_id, id)
);

CREATE TABLE luminix.clinic_settings (
  clinic_id uuid PRIMARY KEY REFERENCES luminix.clinics(id),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo' CHECK (timezone = 'America/Sao_Paulo'),
  locale text NOT NULL DEFAULT 'pt-BR' CHECK (locale = 'pt-BR'),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One draft per clinic; a separate pre-clinic signup model remains out of scope.
CREATE TABLE luminix.onboarding_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL UNIQUE REFERENCES luminix.clinics(id),
  created_by_membership_id uuid NOT NULL,
  step text NOT NULL DEFAULT 'clinic' CHECK (step IN ('clinic', 'team', 'services', 'review')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'abandoned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  FOREIGN KEY (clinic_id, created_by_membership_id) REFERENCES luminix.clinic_memberships(clinic_id, id)
);

CREATE TABLE luminix.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  actor_identity_id uuid REFERENCES luminix.identities(id),
  database_actor text NOT NULL,
  entity_table text NOT NULL,
  entity_key jsonb NOT NULL CHECK (jsonb_typeof(entity_key) = 'object'),
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_fields text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Supports the intended tenant timeline query; identity index supports auth lookup.
CREATE INDEX audit_logs_clinic_timeline ON luminix.audit_logs(clinic_id, created_at DESC, id);
CREATE INDEX clinic_memberships_identity ON luminix.clinic_memberships(identity_id, clinic_id);

CREATE FUNCTION luminix.current_clinic_id() RETURNS uuid
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT nullif(current_setting('luminix.clinic_id', true), '')::uuid
$$;

-- Clinic selection is only a scope; backend membership validation is still mandatory.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'roles', 'role_permissions', 'clinic_memberships', 'clinic_clients', 'professionals',
    'occupations', 'professional_occupations', 'services', 'professional_services',
    'clinic_settings', 'onboarding_drafts', 'audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE luminix.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE luminix.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY clinic_scope ON luminix.%I USING (clinic_id = luminix.current_clinic_id()) WITH CHECK (clinic_id = luminix.current_clinic_id())', table_name);
  END LOOP;
END $$;
ALTER TABLE luminix.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.clinics FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.clinics
  USING (id = luminix.current_clinic_id()) WITH CHECK (id = luminix.current_clinic_id());

CREATE FUNCTION luminix.prevent_tenant_move() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF (to_jsonb(NEW)->>'clinic_id') IS DISTINCT FROM (to_jsonb(OLD)->>'clinic_id') THEN
    RAISE EXCEPTION 'Tenant ownership is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- Values are intentionally omitted: no phone/name/clinical snapshots in audit.
CREATE FUNCTION luminix.audit_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  old_data jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  new_data jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  row_data jsonb;
  row_clinic uuid;
  fields text[];
  row_key jsonb;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN old_data ELSE new_data END;
  row_clinic := CASE WHEN TG_TABLE_NAME = 'clinics' THEN (row_data->>'id')::uuid ELSE (row_data->>'clinic_id')::uuid END;
  SELECT coalesce(array_agg(key ORDER BY key), ARRAY[]::text[]) INTO fields
    FROM jsonb_object_keys(old_data || new_data) AS keys(key)
    WHERE old_data->key IS DISTINCT FROM new_data->key;
  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO row_key
    FROM jsonb_each(row_data)
    WHERE key = 'id' OR key = 'clinic_id' OR key IN ('role_id', 'permission_code', 'professional_id', 'occupation_id', 'service_id');
  INSERT INTO luminix.audit_logs (clinic_id, actor_identity_id, database_actor, entity_table, entity_key, action, changed_fields)
    VALUES (row_clinic, nullif(current_setting('luminix.identity_id', true), '')::uuid,
      session_user, TG_TABLE_NAME, row_key, TG_OP, fields);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION luminix.audit_change() FROM PUBLIC;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'clinics', 'roles', 'role_permissions', 'clinic_memberships', 'clinic_clients', 'professionals',
    'occupations', 'professional_occupations', 'services', 'professional_services',
    'clinic_settings', 'onboarding_drafts'
  ] LOOP
    EXECUTE format('CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.%I FOR EACH ROW EXECUTE FUNCTION luminix.audit_change()', table_name);
    IF table_name <> 'clinics' THEN
      EXECUTE format('CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.%I FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move()', table_name);
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION luminix.prevent_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are append-only' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER prevent_audit_mutation BEFORE UPDATE OR DELETE OR TRUNCATE ON luminix.audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION luminix.prevent_audit_mutation();

-- No runtime grants are implicit. Provision a non-owner/NOBYPASSRLS role separately.
REVOKE ALL ON ALL TABLES IN SCHEMA luminix FROM PUBLIC;
