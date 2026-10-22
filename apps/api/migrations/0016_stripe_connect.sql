-- Additive account binding, separate from preferences materialized on completion.
-- No financial/identity documents, account sessions or secrets are stored here.
CREATE TABLE luminix.stripe_connect_accounts (
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  platform_account_id text NOT NULL CHECK (platform_account_id ~ '^acct_[A-Za-z0-9]+$'),
  livemode boolean NOT NULL DEFAULT false,
  account_id text CHECK (account_id ~ '^acct_[A-Za-z0-9]+$'),
  creation_key uuid NOT NULL DEFAULT gen_random_uuid(),
  creation_started_at timestamptz NOT NULL DEFAULT now(),
  connected_at timestamptz,
  PRIMARY KEY (clinic_id, platform_account_id, livemode),
  UNIQUE (account_id),
  CHECK ((account_id IS NULL) = (connected_at IS NULL))
);
ALTER TABLE luminix.stripe_connect_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.stripe_connect_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.stripe_connect_accounts
  USING (clinic_id = luminix.current_clinic_id()) WITH CHECK (clinic_id = luminix.current_clinic_id());
CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.stripe_connect_accounts
  FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.stripe_connect_accounts
  FOR EACH ROW EXECUTE FUNCTION luminix.audit_change();
REVOKE ALL ON luminix.stripe_connect_accounts FROM PUBLIC;
GRANT SELECT ON luminix.stripe_connect_accounts TO luminix_api;

CREATE FUNCTION luminix.reserve_stripe_connect(p_clinic uuid, p_platform text, p_live boolean)
RETURNS SETOF luminix.stripe_connect_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Clinic access denied' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  INSERT INTO luminix.stripe_connect_accounts(clinic_id, platform_account_id, livemode)
    VALUES (p_clinic, p_platform, p_live) ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT * FROM luminix.stripe_connect_accounts
    WHERE clinic_id = p_clinic AND platform_account_id = p_platform AND livemode = p_live;
END $$;

CREATE FUNCTION luminix.bind_stripe_connect(p_clinic uuid, p_platform text, p_live boolean, p_key uuid, p_account text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Clinic access denied' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'settings:manage');
  UPDATE luminix.stripe_connect_accounts SET account_id = p_account, connected_at = now()
    WHERE clinic_id = p_clinic AND platform_account_id = p_platform AND livemode = p_live
      AND creation_key = p_key AND account_id IS NULL;
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM luminix.stripe_connect_accounts
    WHERE clinic_id = p_clinic AND platform_account_id = p_platform AND livemode = p_live
      AND creation_key = p_key AND account_id = p_account) THEN
    RAISE EXCEPTION 'Account binding conflict' USING ERRCODE = '23505';
  END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.reserve_stripe_connect(uuid,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION luminix.bind_stripe_connect(uuid,text,boolean,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.reserve_stripe_connect(uuid,text,boolean),
  luminix.bind_stripe_connect(uuid,text,boolean,uuid,text) TO luminix_api;
