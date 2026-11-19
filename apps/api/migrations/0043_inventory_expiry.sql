-- Validade dos produtos do estoque. Cada produto diz se controla validade e guarda a data do
-- que está na prateleira agora (o próximo a vencer). Ao repor, a data pode ser atualizada.
-- Não substitui o controle por lote exigido em normas sanitárias; é um lembrete para o gestor.

ALTER TABLE luminix.inventory_items
  ADD COLUMN tracks_expiry boolean NOT NULL DEFAULT false,
  ADD COLUMN expires_on date,
  ADD CONSTRAINT inventory_items_expiry_check CHECK (tracks_expiry OR expires_on IS NULL);

CREATE INDEX inventory_items_expiry_idx ON luminix.inventory_items (clinic_id, expires_on)
  WHERE status = 'active' AND tracks_expiry AND expires_on IS NOT NULL;

-- Liga/desliga a validade de um produto ativo da clínica e guarda a data (NULL: ainda sem data).
CREATE FUNCTION luminix.set_inventory_expiry(p_clinic uuid, p_item uuid, p_tracks boolean, p_expires date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_item IS NULL OR p_tracks IS NULL
    OR (p_expires IS NOT NULL AND (NOT p_tracks
      OR p_expires NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31')) THEN
    RAISE EXCEPTION 'Invalid expiry' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'inventory:manage');
  UPDATE luminix.inventory_items SET tracks_expiry = p_tracks,
      expires_on = CASE WHEN p_tracks THEN p_expires END, updated_at = now()
    WHERE clinic_id = p_clinic AND id = p_item AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item unavailable' USING ERRCODE = 'P0002'; END IF;
END $$;
REVOKE ALL ON FUNCTION luminix.set_inventory_expiry(uuid, uuid, boolean, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.set_inventory_expiry(uuid, uuid, boolean, date) TO luminix_api;
