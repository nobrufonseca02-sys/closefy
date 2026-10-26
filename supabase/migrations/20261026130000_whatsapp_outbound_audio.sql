-- Lets the Closefy inbox record and send a WhatsApp voice note, not just play
-- received ones. The authenticated user uploads the recorded clip straight to
-- the whatsapp-audio bucket (under outbound/, separate from the worker's
-- inbound paths) and then queues an outbound message referencing it; the
-- worker downloads it (via the whatsapp-audio-download edge function, same
-- shared-secret model as everything else it calls) and sends it as a real
-- WhatsApp voice note.

CREATE POLICY "Authenticated can upload outbound WhatsApp audio"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'whatsapp-audio' AND (storage.foldername(name))[1] = 'outbound');

DROP POLICY IF EXISTS "Authenticated can queue outbound WhatsApp messages" ON public.whatsapp_messages;

CREATE POLICY "Authenticated can queue outbound WhatsApp messages"
  ON public.whatsapp_messages FOR INSERT TO authenticated
  WITH CHECK (
    direction = 'outbound'
    AND status = 'pending'
    AND (
      (message_type = 'text' AND char_length(btrim(content)) BETWEEN 1 AND 4000)
      OR (message_type = 'audio' AND media_path IS NOT NULL AND media_path LIKE 'outbound/%')
    )
  );

DROP FUNCTION IF EXISTS public.claim_whatsapp_outbound_messages(INTEGER);
DROP FUNCTION IF EXISTS public.worker_claim_whatsapp_outbound_messages(TEXT, INTEGER);

CREATE FUNCTION public.claim_whatsapp_outbound_messages(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  outbound_id UUID,
  conversation_id UUID,
  remote_jid TEXT,
  phone_number TEXT,
  content TEXT,
  message_type TEXT,
  media_path TEXT,
  attempts INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH claimed AS (
    SELECT pending.id
    FROM public.whatsapp_messages AS pending
    WHERE pending.direction = 'outbound' AND pending.status = 'pending'
    ORDER BY pending.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 10), 50))
  ), updated AS (
    UPDATE public.whatsapp_messages AS message
    SET status = 'sending', attempts = message.attempts + 1, error_message = NULL
    FROM claimed
    WHERE message.id = claimed.id
    RETURNING message.id, message.conversation_id, message.content, message.message_type, message.media_path, message.attempts
  )
  SELECT
    updated.id,
    updated.conversation_id,
    conversation.remote_jid,
    conversation.phone_number,
    updated.content,
    updated.message_type,
    updated.media_path,
    updated.attempts
  FROM updated
  JOIN public.whatsapp_conversations AS conversation ON conversation.id = updated.conversation_id;
$$;

CREATE FUNCTION public.worker_claim_whatsapp_outbound_messages(
  p_integration_token TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  outbound_id UUID,
  conversation_id UUID,
  remote_jid TEXT,
  phone_number TEXT,
  content TEXT,
  message_type TEXT,
  media_path TEXT,
  attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.verify_whatsapp_worker_token(p_integration_token);
  RETURN QUERY SELECT * FROM public.claim_whatsapp_outbound_messages(p_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_outbound_messages(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_outbound_messages(INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.worker_claim_whatsapp_outbound_messages(TEXT, INTEGER) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_claim_whatsapp_outbound_messages(TEXT, INTEGER) TO anon;
