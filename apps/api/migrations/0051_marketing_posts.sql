-- Calendário de postagens (Marketing): o que o espaço vai postar, onde, quando e com que legenda.
-- Uma ideia sem data também cabe (scheduled_on NULL). Pode apontar para uma foto do acervo.
CREATE TABLE luminix.marketing_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES luminix.clinics(id),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  caption text NOT NULL DEFAULT '' CHECK (length(caption) <= 2200),
  scheduled_on date,
  scheduled_time text CHECK (scheduled_time IS NULL OR scheduled_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  channels text[] NOT NULL DEFAULT '{}' CHECK (
    channels <@ ARRAY['instagram', 'facebook', 'whatsapp', 'tiktok', 'google']::text[]),
  format text NOT NULL DEFAULT 'post' CHECK (format IN ('post', 'carousel', 'reels', 'stories', 'status')),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('idea', 'planned', 'published')),
  media_item_id uuid,
  created_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, id),
  FOREIGN KEY (clinic_id, media_item_id) REFERENCES luminix.media_items(clinic_id, id),
  FOREIGN KEY (clinic_id, created_by_membership_id) REFERENCES luminix.clinic_memberships(clinic_id, id)
);
CREATE INDEX marketing_posts_day ON luminix.marketing_posts (clinic_id, scheduled_on);
ALTER TABLE luminix.marketing_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminix.marketing_posts FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_scope ON luminix.marketing_posts
  USING (clinic_id = luminix.current_clinic_id())
  WITH CHECK (clinic_id = luminix.current_clinic_id());
CREATE TRIGGER prevent_tenant_move BEFORE UPDATE ON luminix.marketing_posts
  FOR EACH ROW EXECUTE FUNCTION luminix.prevent_tenant_move();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON luminix.marketing_posts
  FOR EACH ROW EXECUTE FUNCTION luminix.audit_change();
REVOKE ALL ON luminix.marketing_posts FROM PUBLIC;
GRANT SELECT ON luminix.marketing_posts TO luminix_api;

-- Create or update a post (service:manage, like promotions). p_delete removes it.
CREATE FUNCTION luminix.save_marketing_post(p_clinic uuid, p_post uuid, p_data jsonb, p_delete boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_member uuid; v_id uuid; v_media uuid;
BEGIN
  IF p_clinic IS DISTINCT FROM luminix.current_clinic_id() OR p_post IS NULL THEN
    RAISE EXCEPTION 'Invalid post' USING ERRCODE = '22023';
  END IF;
  SELECT a.membership_id INTO v_member FROM luminix.authorize_staff_clinic(
    nullif(current_setting('luminix.identity_id', true), '')::uuid, p_clinic, 'service:manage') a;
  IF p_delete THEN
    DELETE FROM luminix.marketing_posts WHERE clinic_id = p_clinic AND id = p_post;
    RETURN p_post;
  END IF;
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object'
    OR jsonb_typeof(coalesce(p_data->'channels', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Invalid post' USING ERRCODE = '22023';
  END IF;
  v_media := nullif(p_data->>'mediaItemId', '')::uuid;
  IF v_media IS NOT NULL THEN
    PERFORM 1 FROM luminix.media_items WHERE clinic_id = p_clinic AND id = v_media AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid media' USING ERRCODE = '22023'; END IF;
  END IF;
  INSERT INTO luminix.marketing_posts (id, clinic_id, title, caption, scheduled_on, scheduled_time,
      channels, format, status, media_item_id, created_by_membership_id)
    VALUES (p_post, p_clinic, btrim(p_data->>'title'), coalesce(p_data->>'caption', ''),
      nullif(p_data->>'scheduledOn', '')::date, nullif(p_data->>'scheduledTime', ''),
      ARRAY(SELECT jsonb_array_elements_text(coalesce(p_data->'channels', '[]'::jsonb))),
      coalesce(p_data->>'format', 'post'), coalesce(p_data->>'status', 'planned'), v_media, v_member)
  ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, caption = EXCLUDED.caption,
      scheduled_on = EXCLUDED.scheduled_on, scheduled_time = EXCLUDED.scheduled_time,
      channels = EXCLUDED.channels, format = EXCLUDED.format, status = EXCLUDED.status,
      media_item_id = EXCLUDED.media_item_id, updated_at = now()
    WHERE luminix.marketing_posts.clinic_id = p_clinic
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid post' USING ERRCODE = '22023'; END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION luminix.save_marketing_post(uuid, uuid, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION luminix.save_marketing_post(uuid, uuid, jsonb, boolean) TO luminix_api;
