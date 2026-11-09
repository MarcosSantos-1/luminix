-- Activity inbox (read / archived / hidden per person) and accent-insensitive search.
-- audit_logs stays immutable: "apagar" and "arquivar" only change what one person sees.

CREATE TABLE luminix.activity_states (
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  membership_id uuid NOT NULL,
  -- No foreign key to audit_logs on purpose: it would make the immutable audit table depend on
  -- view state. Rows are only written by set_activity_state, from the clinic's own audit rows.
  audit_log_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('read', 'archived', 'hidden')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, membership_id, audit_log_id),
  FOREIGN KEY (clinic_id, membership_id) REFERENCES luminix.clinic_memberships(clinic_id, id)
);
ALTER TABLE luminix.activity_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.activity_states FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.activity_states
  USING (clinic_id = luminix.current_clinic_id()) WITH CHECK (clinic_id = luminix.current_clinic_id());
REVOKE ALL ON luminix.activity_states FROM PUBLIC;

-- Lowercase without accents, for search ("Lumière" matches "lumiere").
CREATE FUNCTION luminix.fold(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT translate(lower(coalesce(p_text, '')),
    'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ', 'aaaaaaeeeeiiiiooooouuuucnyy')
$$;
GRANT EXECUTE ON FUNCTION luminix.fold(text) TO luminix_api;

-- Human text for an audit entry (names only; never field values).
CREATE FUNCTION luminix.activity_text(p_clinic uuid, p_table text, p_key jsonb)
RETURNS TABLE (label text, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_id uuid := nullif(p_key->>'id', '')::uuid;
BEGIN
  IF p_table = 'appointments' THEN
    RETURN QUERY SELECT c.display_name, s.name || ' · ' ||
        to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
      FROM luminix.appointments a
      JOIN luminix.clinic_clients c ON c.clinic_id = a.clinic_id AND c.id = a.clinic_client_id
      JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
      WHERE a.clinic_id = p_clinic AND a.id = v_id;
  ELSIF p_table = 'clinic_clients' THEN
    RETURN QUERY SELECT display_name, NULL::text FROM luminix.clinic_clients WHERE clinic_id = p_clinic AND id = v_id;
  ELSIF p_table = 'services' THEN
    RETURN QUERY SELECT name, category FROM luminix.services WHERE clinic_id = p_clinic AND id = v_id;
  ELSIF p_table = 'finance_entries' THEN
    RETURN QUERY SELECT description, to_char(amount_cents / 100.0, 'FM999G999G990D00')
      FROM luminix.finance_entries WHERE clinic_id = p_clinic AND id = v_id;
  ELSIF p_table = 'inventory_movements' THEN
    RETURN QUERY SELECT i.name, CASE m.kind WHEN 'in' THEN 'Entrada' WHEN 'out' THEN 'Saída' ELSE 'Contagem' END
        || ' · saldo ' || trim(to_char(m.balance, 'FM99999990D##'))
      FROM luminix.inventory_movements m JOIN luminix.inventory_items i ON i.clinic_id = m.clinic_id AND i.id = m.item_id
      WHERE m.clinic_id = p_clinic AND m.id = v_id;
  ELSIF p_table = 'media_items' THEN
    RETURN QUERY SELECT f.name, i.title FROM luminix.media_items i
      JOIN luminix.media_folders f ON f.clinic_id = i.clinic_id AND f.id = i.folder_id
      WHERE i.clinic_id = p_clinic AND i.id = v_id;
  ELSIF p_table = 'promotions' THEN
    RETURN QUERY SELECT name, percent || '% de desconto' FROM luminix.promotions WHERE clinic_id = p_clinic AND id = v_id;
  ELSIF p_table = 'professionals' THEN
    RETURN QUERY SELECT display_name, role_name FROM luminix.professionals WHERE clinic_id = p_clinic AND id = v_id;
  ELSIF p_table = 'clinic_memberships' THEN
    RETURN QUERY SELECT coalesce(display_name, contact_email), NULL::text
      FROM luminix.clinic_memberships WHERE clinic_id = p_clinic AND id = v_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.activity_text(uuid, text, jsonb) FROM PUBLIC;

-- Inbox: unread + read; archived view: archived. Hidden entries never return.
CREATE FUNCTION luminix.list_activity(
  p_clinic uuid, p_view text, p_entity text, p_before timestamptz, p_limit integer)
RETURNS TABLE (id uuid, entity text, action text, label text, detail text, actor text,
  state text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_view NOT IN ('inbox', 'archived')
    OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid activity request' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'audit:read') a;
  RETURN QUERY
  SELECT l.id, l.entity_table, l.action, t.label, t.detail,
    coalesce(m.display_name, CASE WHEN r.name = 'owner' THEN p.owner_name END, 'Equipe'),
    s.state, l.created_at
  FROM luminix.audit_logs l
  LEFT JOIN luminix.activity_states s ON s.clinic_id = l.clinic_id AND s.membership_id = v_member
    AND s.audit_log_id = l.id
  LEFT JOIN luminix.clinic_memberships m ON m.clinic_id = l.clinic_id AND m.identity_id = l.actor_identity_id
  LEFT JOIN luminix.roles r ON r.clinic_id = m.clinic_id AND r.id = m.role_id
  LEFT JOIN luminix.clinic_profiles p ON p.clinic_id = l.clinic_id
  LEFT JOIN LATERAL luminix.activity_text(p_clinic, l.entity_table, l.entity_key) t ON true
  WHERE l.clinic_id = p_clinic
    AND l.entity_table IN ('appointments', 'clinic_clients', 'services', 'finance_entries',
      'inventory_movements', 'media_items', 'promotions', 'professionals', 'clinic_memberships')
    AND (l.action = 'INSERT' OR (l.entity_table IN ('appointments', 'services', 'clinic_memberships')
      AND 'status' = ANY (l.changed_fields)))
    AND (p_entity IS NULL OR l.entity_table = p_entity)
    AND (p_before IS NULL OR l.created_at < p_before)
    AND CASE p_view WHEN 'inbox' THEN s.state IS NULL OR s.state = 'read'
      ELSE s.state = 'archived' END
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit;
END $$;
REVOKE ALL ON FUNCTION luminix.list_activity(uuid, text, text, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.list_activity(uuid, text, text, timestamptz, integer) TO luminix_api;

CREATE FUNCTION luminix.unread_activity_count(p_clinic uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() THEN
    RAISE EXCEPTION 'Invalid clinic' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'audit:read') a;
  RETURN (SELECT count(*) FROM luminix.audit_logs l
    WHERE l.clinic_id = p_clinic AND l.created_at > now() - interval '30 days'
      AND l.actor_identity_id IS DISTINCT FROM nullif(current_setting('luminix.identity_id', true), '')::uuid
      AND l.entity_table IN ('appointments', 'clinic_clients', 'services', 'finance_entries',
        'inventory_movements', 'media_items', 'promotions', 'professionals', 'clinic_memberships')
      AND (l.action = 'INSERT' OR (l.entity_table IN ('appointments', 'services', 'clinic_memberships')
        AND 'status' = ANY (l.changed_fields)))
      AND NOT EXISTS (SELECT 1 FROM luminix.activity_states s WHERE s.clinic_id = p_clinic
        AND s.membership_id = v_member AND s.audit_log_id = l.id));
END $$;
REVOKE ALL ON FUNCTION luminix.unread_activity_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.unread_activity_count(uuid) TO luminix_api;

-- p_state NULL returns entries to the inbox as unread. p_all marks every inbox entry.
CREATE FUNCTION luminix.set_activity_state(p_clinic uuid, p_ids uuid[], p_state text, p_all boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_count integer;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR (p_state IS NOT NULL AND p_state NOT IN ('read', 'archived', 'hidden'))
    OR (NOT p_all AND (p_ids IS NULL OR cardinality(p_ids) NOT BETWEEN 1 AND 200)) THEN
    RAISE EXCEPTION 'Invalid activity change' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'audit:read') a;
  IF p_state IS NULL THEN
    DELETE FROM luminix.activity_states
      WHERE clinic_id = p_clinic AND membership_id = v_member AND audit_log_id = ANY (p_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
  END IF;
  INSERT INTO luminix.activity_states (clinic_id, membership_id, audit_log_id, state)
    SELECT p_clinic, v_member, l.id, p_state FROM luminix.audit_logs l
     WHERE l.clinic_id = p_clinic AND CASE WHEN p_all THEN l.created_at > now() - interval '90 days'
       AND l.entity_table IN ('appointments', 'clinic_clients', 'services', 'finance_entries',
         'inventory_movements', 'media_items', 'promotions', 'professionals', 'clinic_memberships')
       AND NOT EXISTS (SELECT 1 FROM luminix.activity_states s WHERE s.clinic_id = p_clinic
         AND s.membership_id = v_member AND s.audit_log_id = l.id AND s.state <> 'read')
       ELSE l.id = ANY (p_ids) END
  ON CONFLICT (clinic_id, membership_id, audit_log_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()
    WHERE luminix.activity_states.state <> 'hidden' OR EXCLUDED.state = 'hidden';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION luminix.set_activity_state(uuid, uuid[], text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_activity_state(uuid, uuid[], text, boolean) TO luminix_api;
