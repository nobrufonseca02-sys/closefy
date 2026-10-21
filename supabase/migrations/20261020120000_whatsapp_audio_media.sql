-- Stores downloaded WhatsApp voice notes so the Closefy inbox can play them
-- back instead of showing a text placeholder. Audio bytes never pass through
-- the database: the worker uploads them to a private Storage bucket and only
-- the resulting object path is kept on the message row.

ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS media_path TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-audio', 'whatsapp-audio', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can read WhatsApp audio"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'whatsapp-audio');

-- Re-create with an appended, defaulted parameter: existing callers that omit
-- p_media_path keep working unchanged.
CREATE OR REPLACE FUNCTION public.sync_whatsapp_message(
  p_business_phone TEXT,
  p_remote_jid TEXT,
  p_phone_number TEXT,
  p_display_name TEXT,
  p_wa_message_id TEXT,
  p_content TEXT,
  p_message_type TEXT,
  p_message_at TIMESTAMPTZ,
  p_from_me BOOLEAN,
  p_is_history BOOLEAN DEFAULT false,
  p_media_path TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_conversation_id UUID;
BEGIN
  IF p_wa_message_id IS NULL OR btrim(p_wa_message_id) = '' THEN
    RAISE EXCEPTION 'WhatsApp message ID is required';
  END IF;
  IF p_content IS NULL OR char_length(btrim(p_content)) = 0 THEN
    RAISE EXCEPTION 'WhatsApp message content is required';
  END IF;

  v_conversation_id := public.sync_whatsapp_conversation(
    p_business_phone,
    p_remote_jid,
    p_phone_number,
    p_display_name,
    p_message_at,
    p_from_me
  );

  INSERT INTO public.whatsapp_messages (
    conversation_id,
    wa_message_id,
    direction,
    message_type,
    content,
    is_history,
    status,
    sent_at,
    media_path
  ) VALUES (
    v_conversation_id,
    p_wa_message_id,
    CASE WHEN p_from_me THEN 'outbound' ELSE 'inbound' END,
    CASE
      WHEN p_message_type IN ('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'reaction')
      THEN p_message_type
      ELSE 'unknown'
    END,
    left(p_content, 4000),
    p_is_history,
    CASE WHEN p_from_me THEN 'sent' ELSE 'received' END,
    coalesce(p_message_at, now()),
    nullif(btrim(coalesce(p_media_path, '')), '')
  )
  ON CONFLICT (conversation_id, wa_message_id) DO UPDATE SET
    media_path = coalesce(whatsapp_messages.media_path, EXCLUDED.media_path);

  RETURN v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.worker_sync_whatsapp_message(
  p_integration_token TEXT,
  p_business_phone TEXT,
  p_remote_jid TEXT,
  p_phone_number TEXT,
  p_display_name TEXT,
  p_wa_message_id TEXT,
  p_content TEXT,
  p_message_type TEXT,
  p_message_at TIMESTAMPTZ,
  p_from_me BOOLEAN,
  p_is_history BOOLEAN DEFAULT false,
  p_media_path TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.verify_whatsapp_worker_token(p_integration_token);
  RETURN public.sync_whatsapp_message(
    p_business_phone, p_remote_jid, p_phone_number, p_display_name, p_wa_message_id,
    p_content, p_message_type, p_message_at, p_from_me, p_is_history, p_media_path
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_whatsapp_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_whatsapp_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, BOOLEAN, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.worker_sync_whatsapp_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_sync_whatsapp_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, BOOLEAN, TEXT) TO anon;
