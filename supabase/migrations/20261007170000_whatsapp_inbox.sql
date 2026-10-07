-- Full WhatsApp inbox for Closefy: conversations, messages, outbound queue and
-- connection health. Message bodies are stored because the authenticated CRM
-- now provides a send/receive conversation interface.

CREATE TABLE public.whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  business_phone TEXT NOT NULL,
  remote_jid TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  display_name TEXT,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_from_me BOOLEAN,
  unread_count INTEGER NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_phone, phone_number)
);

CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  wa_message_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (
    message_type IN ('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'reaction', 'unknown')
  ),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  is_history BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'received' CHECK (
    status IN ('pending', 'sending', 'sent', 'delivered', 'read', 'received', 'failed')
  ),
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, wa_message_id)
);

CREATE TABLE public.whatsapp_connection_status (
  business_phone TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
  history_complete BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  history_synced_at TIMESTAMPTZ,
  error_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX whatsapp_conversations_last_message_idx
  ON public.whatsapp_conversations(last_message_at DESC NULLS LAST);
CREATE INDEX whatsapp_messages_conversation_time_idx
  ON public.whatsapp_messages(conversation_id, sent_at ASC);
CREATE INDEX whatsapp_messages_outbound_queue_idx
  ON public.whatsapp_messages(status, created_at)
  WHERE direction = 'outbound' AND status = 'pending';

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_connection_status ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.whatsapp_conversations TO authenticated;
GRANT SELECT, INSERT ON public.whatsapp_messages TO authenticated;
GRANT SELECT ON public.whatsapp_connection_status TO authenticated;
GRANT ALL ON public.whatsapp_conversations, public.whatsapp_messages, public.whatsapp_connection_status TO service_role;

CREATE POLICY "Authenticated can read WhatsApp conversations"
  ON public.whatsapp_conversations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read WhatsApp messages"
  ON public.whatsapp_messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can queue outbound WhatsApp messages"
  ON public.whatsapp_messages FOR INSERT TO authenticated
  WITH CHECK (
    direction = 'outbound'
    AND status = 'pending'
    AND message_type = 'text'
    AND char_length(btrim(content)) BETWEEN 1 AND 4000
  );

CREATE POLICY "Authenticated can read WhatsApp connection status"
  ON public.whatsapp_connection_status FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_whatsapp_conversations_updated_at
  BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whatsapp_messages_updated_at
  BEFORE UPDATE ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whatsapp_connection_status_updated_at
  BEFORE UPDATE ON public.whatsapp_connection_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.bump_whatsapp_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.whatsapp_conversations
  SET
    last_message_preview = left(NEW.content, 500),
    last_message_at = NEW.sent_at,
    last_message_from_me = NEW.direction = 'outbound',
    unread_count = unread_count + CASE
      WHEN NEW.direction = 'inbound' AND NOT NEW.is_history THEN 1
      ELSE 0
    END
  WHERE id = NEW.conversation_id
    AND (last_message_at IS NULL OR NEW.sent_at >= last_message_at);
  RETURN NEW;
END;
$$;

CREATE TRIGGER bump_whatsapp_conversation_after_message
  AFTER INSERT ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_whatsapp_conversation_on_message();

CREATE OR REPLACE FUNCTION public.sync_whatsapp_conversation(
  p_business_phone TEXT,
  p_remote_jid TEXT,
  p_phone_number TEXT,
  p_display_name TEXT DEFAULT NULL,
  p_activity_at TIMESTAMPTZ DEFAULT now(),
  p_from_me BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_business_digits TEXT := regexp_replace(coalesce(p_business_phone, ''), '[^0-9]', '', 'g');
  v_phone_digits TEXT := regexp_replace(coalesce(p_phone_number, ''), '[^0-9]', '', 'g');
  v_business_phone TEXT;
  v_phone TEXT;
  v_lead_id UUID;
  v_conversation_id UUID;
BEGIN
  IF v_business_digits <> '5521994177491' THEN
    RAISE EXCEPTION 'WhatsApp business number is not authorized for this integration';
  END IF;
  IF length(v_phone_digits) < 10 OR length(v_phone_digits) > 15 THEN
    RAISE EXCEPTION 'Invalid WhatsApp contact phone number';
  END IF;

  v_business_phone := '+' || v_business_digits;
  v_phone := '+' || v_phone_digits;
  v_lead_id := public.sync_whatsapp_lead(
    v_business_phone,
    p_remote_jid,
    v_phone,
    p_display_name,
    p_activity_at,
    p_from_me
  );

  INSERT INTO public.whatsapp_conversations (
    lead_id,
    business_phone,
    remote_jid,
    phone_number,
    display_name,
    last_message_at,
    last_message_from_me
  ) VALUES (
    v_lead_id,
    v_business_phone,
    p_remote_jid,
    v_phone,
    nullif(btrim(coalesce(p_display_name, '')), ''),
    p_activity_at,
    p_from_me
  )
  ON CONFLICT (business_phone, phone_number) DO UPDATE
  SET
    lead_id = coalesce(whatsapp_conversations.lead_id, EXCLUDED.lead_id),
    remote_jid = EXCLUDED.remote_jid,
    display_name = coalesce(EXCLUDED.display_name, whatsapp_conversations.display_name),
    last_message_at = greatest(
      coalesce(whatsapp_conversations.last_message_at, '-infinity'::timestamptz),
      EXCLUDED.last_message_at
    ),
    last_message_from_me = CASE
      WHEN whatsapp_conversations.last_message_at IS NULL
        OR EXCLUDED.last_message_at >= whatsapp_conversations.last_message_at
      THEN EXCLUDED.last_message_from_me
      ELSE whatsapp_conversations.last_message_from_me
    END
  RETURNING id INTO v_conversation_id;

  RETURN v_conversation_id;
END;
$$;

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
  p_is_history BOOLEAN DEFAULT false
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
    sent_at
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
    coalesce(p_message_at, now())
  )
  ON CONFLICT (conversation_id, wa_message_id) DO NOTHING;

  RETURN v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_whatsapp_outbound_messages(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  outbound_id UUID,
  conversation_id UUID,
  remote_jid TEXT,
  phone_number TEXT,
  content TEXT,
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
    RETURNING message.id, message.conversation_id, message.content, message.attempts
  )
  SELECT
    updated.id,
    updated.conversation_id,
    conversation.remote_jid,
    conversation.phone_number,
    updated.content,
    updated.attempts
  FROM updated
  JOIN public.whatsapp_conversations AS conversation ON conversation.id = updated.conversation_id;
$$;

CREATE OR REPLACE FUNCTION public.complete_whatsapp_outbound_message(
  p_message_id UUID,
  p_wa_message_id TEXT,
  p_sent_at TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.whatsapp_messages
  SET status = 'sent', wa_message_id = p_wa_message_id, sent_at = coalesce(p_sent_at, now()), error_message = NULL
  WHERE id = p_message_id AND direction = 'outbound' AND status = 'sending';
$$;

CREATE OR REPLACE FUNCTION public.fail_whatsapp_outbound_message(
  p_message_id UUID,
  p_error_message TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.whatsapp_messages
  SET status = 'failed', error_message = left(coalesce(p_error_message, 'Falha ao enviar'), 500)
  WHERE id = p_message_id AND direction = 'outbound' AND status = 'sending';
$$;

CREATE OR REPLACE FUNCTION public.update_whatsapp_message_delivery(
  p_wa_message_id TEXT,
  p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_status NOT IN ('delivered', 'read') THEN RAISE EXCEPTION 'Invalid delivery status'; END IF;
  UPDATE public.whatsapp_messages
  SET status = CASE
    WHEN status = 'read' THEN 'read'
    WHEN p_status = 'read' THEN 'read'
    WHEN status IN ('sent', 'delivered') THEN 'delivered'
    ELSE status
  END
  WHERE wa_message_id = p_wa_message_id AND direction = 'outbound';
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_whatsapp_conversation_read(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.whatsapp_conversations SET unread_count = 0 WHERE id = p_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_whatsapp_message(p_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.whatsapp_messages
  SET status = 'pending', error_message = NULL
  WHERE id = p_message_id AND direction = 'outbound' AND status = 'failed';
END;
$$;

CREATE OR REPLACE FUNCTION public.start_whatsapp_conversation(
  p_phone_number TEXT,
  p_display_name TEXT,
  p_message TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_digits TEXT := regexp_replace(coalesce(p_phone_number, ''), '[^0-9]', '', 'g');
  v_conversation_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF length(v_digits) IN (10, 11) THEN v_digits := '55' || v_digits; END IF;
  IF length(v_digits) < 10 OR length(v_digits) > 15 THEN RAISE EXCEPTION 'Invalid phone number'; END IF;
  IF char_length(btrim(coalesce(p_message, ''))) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'Message must contain between 1 and 4000 characters';
  END IF;

  v_conversation_id := public.sync_whatsapp_conversation(
    '5521994177491',
    v_digits || '@s.whatsapp.net',
    v_digits,
    p_display_name,
    now(),
    true
  );

  INSERT INTO public.whatsapp_messages (conversation_id, direction, message_type, content, status)
  VALUES (v_conversation_id, 'outbound', 'text', btrim(p_message), 'pending');

  RETURN v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_whatsapp_connection(
  p_business_phone TEXT,
  p_connected BOOLEAN,
  p_history_complete BOOLEAN,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_digits TEXT := regexp_replace(coalesce(p_business_phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF v_digits <> '5521994177491' THEN RAISE EXCEPTION 'Unauthorized WhatsApp number'; END IF;
  INSERT INTO public.whatsapp_connection_status (
    business_phone, status, history_complete, last_seen_at, history_synced_at, error_message
  ) VALUES (
    '+' || v_digits,
    CASE WHEN p_connected THEN 'connected' ELSE CASE WHEN p_error_message IS NULL THEN 'disconnected' ELSE 'error' END END,
    p_history_complete,
    now(),
    CASE WHEN p_history_complete THEN now() ELSE NULL END,
    p_error_message
  )
  ON CONFLICT (business_phone) DO UPDATE SET
    status = EXCLUDED.status,
    history_complete = whatsapp_connection_status.history_complete OR EXCLUDED.history_complete,
    last_seen_at = now(),
    history_synced_at = coalesce(whatsapp_connection_status.history_synced_at, EXCLUDED.history_synced_at),
    error_message = EXCLUDED.error_message;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_whatsapp_conversation(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_whatsapp_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_whatsapp_outbound_messages(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_whatsapp_outbound_message(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_whatsapp_outbound_message(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_whatsapp_message_delivery(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_whatsapp_connection(TEXT, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sync_whatsapp_conversation(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_whatsapp_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_outbound_messages(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_whatsapp_outbound_message(UUID, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_whatsapp_outbound_message(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_whatsapp_message_delivery(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_whatsapp_connection(TEXT, BOOLEAN, BOOLEAN, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.mark_whatsapp_conversation_read(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.retry_whatsapp_message(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_whatsapp_conversation(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_whatsapp_conversation_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retry_whatsapp_message(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_whatsapp_conversation(TEXT, TEXT, TEXT) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'whatsapp_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'whatsapp_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'whatsapp_connection_status'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_connection_status;
  END IF;
END;
$$;
