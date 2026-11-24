-- Onboarding: a chave Pix do sinal (ADR-037) informada na etapa Pagamentos vai para as regras do
-- espaço ao concluir. A API já valida e normaliza a chave ao salvar o rascunho; aqui ela é só
-- copiada, e só quando os pagamentos não são feitos pelo app (Stripe).

CREATE FUNCTION luminix.persist_completed_pix()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_pix jsonb := NEW.payload->'preferences'->'pix';
  v_type text := NEW.payload->'preferences'->'pix'->>'keyType';
  v_key text := nullif(btrim(NEW.payload->'preferences'->'pix'->>'key'), '');
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' OR OLD.status = 'completed'
    OR jsonb_typeof(v_pix) IS DISTINCT FROM 'object'
    OR coalesce((NEW.payload->'preferences'->>'acceptInApp')::boolean, false) THEN
    RETURN NEW;
  END IF;
  UPDATE luminix.booking_policies
     SET pix_key = CASE WHEN v_type IN ('cpf', 'cnpj', 'email', 'phone', 'random') THEN v_key END,
         pix_key_type = CASE WHEN v_key IS NOT NULL
           AND v_type IN ('cpf', 'cnpj', 'email', 'phone', 'random') THEN v_type END,
         pix_holder_name = nullif(btrim(v_pix->>'holderName'), ''),
         deposit_hold_minutes = CASE
           WHEN (v_pix->>'holdMinutes') ~ '^[0-9]+$'
             AND (v_pix->>'holdMinutes')::integer BETWEEN 15 AND 1440
           THEN (v_pix->>'holdMinutes')::integer ELSE deposit_hold_minutes END
   WHERE clinic_id = NEW.clinic_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION luminix.persist_completed_pix() FROM PUBLIC;
CREATE TRIGGER persist_completed_pix
  AFTER UPDATE ON luminix.onboarding_drafts
  FOR EACH ROW EXECUTE FUNCTION luminix.persist_completed_pix();
