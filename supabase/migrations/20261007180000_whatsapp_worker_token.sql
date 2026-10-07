-- Allow the external WhatsApp worker to use the public project key together
-- with a dedicated high-entropy integration token. The token itself is never
-- stored; only its SHA-256 digest is kept in the database.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.whatsapp_worker_credentials (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  token_hash TEXT NOT NULL CHECK (char_length(token_hash) = 64),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_worker_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_worker_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.whatsapp_worker_credentials TO service_role;

CREATE OR REPLACE FUNCTION public.verify_whatsapp_worker_token(p_integration_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_expected_hash TEXT;
  v_received_hash TEXT;
BEGIN
  IF p_integration_token IS NULL OR char_length(p_integration_token) < 32 THEN
    RAISE EXCEPTION 'Invalid WhatsApp worker credential';
  END IF;

  SELECT token_hash INTO v_expected_hash
  FROM public.whatsapp_worker_credentials
  WHERE singleton = true;

  v_received_hash := encode(digest(convert_to(p_integration_token, 'UTF8'), 'sha256'), 'hex');
  IF v_expected_hash IS NULL OR v_received_hash <> v_expected_hash THEN
    RAISE EXCEPTION 'Invalid WhatsApp worker credential';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_whatsapp_worker_token(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.worker_sync_whatsapp_conversation(
  p_integration_token TEXT,
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
BEGIN
  PERFORM public.verify_whatsapp_worker_token(p_integration_token);
  RETURN public.sync_whatsapp_conversation(
    p_business_phone, p_remote_jid, p_phone_number, p_display_name, p_activity_at, p_from_me
  );
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
  p_is_history BOOLEAN DEFAULT false
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
    p_content, p_message_type, p_message_at, p_from_me, p_is_history
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.worker_claim_whatsapp_outbound_messages(
  p_integration_token TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  outbound_id UUID,
  conversation_id UUID,
  remote_jid TEXT,
  phone_number TEXT,
  content TEXT,
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

CREATE OR REPLACE FUNCTION public.worker_complete_whatsapp_outbound_message(
  p_integration_token TEXT,
  p_message_id UUID,
  p_wa_message_id TEXT,
  p_sent_at TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.verify_whatsapp_worker_token(p_integration_token);
  PERFORM public.complete_whatsapp_outbound_message(p_message_id, p_wa_message_id, p_sent_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.worker_fail_whatsapp_outbound_message(
  p_integration_token TEXT,
  p_message_id UUID,
  p_error_message TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.verify_whatsapp_worker_token(p_integration_token);
  PERFORM public.fail_whatsapp_outbound_message(p_message_id, p_error_message);
END;
$$;

CREATE OR REPLACE FUNCTION public.worker_update_whatsapp_message_delivery(
  p_integration_token TEXT,
  p_wa_message_id TEXT,
  p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.verify_whatsapp_worker_token(p_integration_token);
  PERFORM public.update_whatsapp_message_delivery(p_wa_message_id, p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.worker_heartbeat_whatsapp_connection(
  p_integration_token TEXT,
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
BEGIN
  PERFORM public.verify_whatsapp_worker_token(p_integration_token);
  PERFORM public.heartbeat_whatsapp_connection(
    p_business_phone, p_connected, p_history_complete, p_error_message
  );
END;
$$;

REVOKE ALL ON FUNCTION public.worker_sync_whatsapp_conversation(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.worker_sync_whatsapp_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, BOOLEAN) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.worker_claim_whatsapp_outbound_messages(TEXT, INTEGER) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.worker_complete_whatsapp_outbound_message(TEXT, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.worker_fail_whatsapp_outbound_message(TEXT, UUID, TEXT) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.worker_update_whatsapp_message_delivery(TEXT, TEXT, TEXT) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.worker_heartbeat_whatsapp_connection(TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION public.worker_sync_whatsapp_conversation(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION public.worker_sync_whatsapp_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION public.worker_claim_whatsapp_outbound_messages(TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.worker_complete_whatsapp_outbound_message(TEXT, UUID, TEXT, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION public.worker_fail_whatsapp_outbound_message(TEXT, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.worker_update_whatsapp_message_delivery(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.worker_heartbeat_whatsapp_connection(TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT) TO anon;
