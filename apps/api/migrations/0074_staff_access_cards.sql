-- "Seu acesso" needs the clinic's face and where a draft still is, so the same
-- account can tell a space she owns from one where she is on the team.

DROP FUNCTION luminix.list_staff_clinics(uuid, uuid);
CREATE FUNCTION luminix.list_staff_clinics(p_identity uuid, p_after uuid DEFAULT NULL)
RETURNS TABLE (
  clinic_id uuid, clinic_name text, clinic_status text, role_name text, clinic_code text,
  clinic_slug text, clinic_theme text, logo_key text, draft_step text, draft_progress integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT c.id, c.name, c.status, r.name, c.share_code, c.slug,
         coalesce(s.theme, 'rosa'),
         logo.large_object_key,
         CASE WHEN c.status = 'draft' THEN d.step ELSE NULL END,
         CASE WHEN c.status = 'draft' THEN d.progress ELSE NULL END
    FROM luminix.clinic_memberships m
    JOIN luminix.identities i ON i.id = m.identity_id AND i.status = 'active'
    JOIN luminix.clinics c ON c.id = m.clinic_id AND c.status IN ('draft', 'active')
    JOIN luminix.roles r ON r.clinic_id = m.clinic_id AND r.id = m.role_id
    LEFT JOIN luminix.clinic_settings s ON s.clinic_id = c.id
    LEFT JOIN luminix.clinic_profiles p ON p.clinic_id = c.id
    LEFT JOIN luminix.media_assets logo
      ON logo.clinic_id = c.id AND logo.id = p.logo_asset_id
     AND logo.status = 'ready' AND logo.kind = 'clinic_logo'
    LEFT JOIN luminix.onboarding_drafts d ON d.clinic_id = c.id AND c.status = 'draft'
   WHERE m.identity_id = p_identity AND m.status = 'active'
     AND (p_after IS NULL OR c.id > p_after)
   ORDER BY c.id
   LIMIT 51
$$;
REVOKE ALL ON FUNCTION luminix.list_staff_clinics(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.list_staff_clinics(uuid, uuid) TO luminix_api;
