-- Stock categories are a text on each product. Renaming one renames it on every product, and
-- removing one leaves its products without category (nothing else is deleted).
CREATE FUNCTION luminix.rename_inventory_category(p_clinic uuid, p_from text, p_to text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_count integer;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id()
    OR length(coalesce(btrim(p_from), '')) NOT BETWEEN 1 AND 60
    OR length(coalesce(p_to, '')) > 60 THEN
    RAISE EXCEPTION 'Invalid category' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'inventory:manage');
  UPDATE luminix.inventory_items SET category = nullif(btrim(p_to), ''), updated_at = now()
    WHERE clinic_id = p_clinic AND status = 'active' AND category = btrim(p_from);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION luminix.rename_inventory_category(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.rename_inventory_category(uuid, text, text) TO luminix_api;
