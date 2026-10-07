-- Synchronize one-to-one WhatsApp conversations with Closefy leads.
-- Message contents are intentionally not stored: only contact and activity metadata.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS whatsapp_jid TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_business_phone TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_last_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_last_message_from_me BOOLEAN,
  ADD COLUMN IF NOT EXISTS whatsapp_sync_source TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS leads_whatsapp_jid_unique
  ON public.leads (whatsapp_jid)
  WHERE whatsapp_jid IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_whatsapp_business_activity_idx
  ON public.leads (whatsapp_business_phone, whatsapp_last_message_at DESC)
  WHERE whatsapp_business_phone IS NOT NULL;

COMMENT ON COLUMN public.leads.whatsapp_jid IS
  'WhatsApp peer identifier used by the Closefy WhatsApp synchronization worker.';
COMMENT ON COLUMN public.leads.whatsapp_business_phone IS
  'Business WhatsApp number through which this lead is being handled.';
COMMENT ON COLUMN public.leads.whatsapp_last_message_at IS
  'Timestamp of the latest inbound or outbound WhatsApp message observed by the worker.';

CREATE OR REPLACE FUNCTION public.sync_whatsapp_lead(
  p_business_phone TEXT,
  p_remote_jid TEXT,
  p_phone_number TEXT,
  p_display_name TEXT DEFAULT NULL,
  p_message_at TIMESTAMPTZ DEFAULT now(),
  p_from_me BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_business_digits TEXT := regexp_replace(coalesce(p_business_phone, ''), '[^0-9]', '', 'g');
  v_phone_digits TEXT := regexp_replace(coalesce(p_phone_number, ''), '[^0-9]', '', 'g');
  v_phone TEXT;
  v_name TEXT := nullif(btrim(coalesce(p_display_name, '')), '');
  v_message_at TIMESTAMPTZ := coalesce(p_message_at, now());
  v_lead public.leads%ROWTYPE;
BEGIN
  IF v_business_digits <> '5521994177491' THEN
    RAISE EXCEPTION 'WhatsApp business number is not authorized for this integration';
  END IF;

  IF p_remote_jid IS NULL OR btrim(p_remote_jid) = '' THEN
    RAISE EXCEPTION 'WhatsApp remote JID is required';
  END IF;

  IF length(v_phone_digits) < 10 OR length(v_phone_digits) > 15 THEN
    RAISE EXCEPTION 'Invalid WhatsApp contact phone number';
  END IF;

  IF v_phone_digits = v_business_digits THEN
    RETURN NULL;
  END IF;

  v_phone := '+' || v_phone_digits;
  v_name := coalesce(v_name, 'Contato ' || v_phone);

  -- Serializes concurrent events for the same phone so two messages cannot create
  -- duplicate leads before either transaction commits.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_business_digits || ':' || v_phone_digits, 0));

  SELECT l.*
  INTO v_lead
  FROM public.leads AS l
  WHERE l.whatsapp_jid = p_remote_jid
     OR regexp_replace(coalesce(l.whatsapp, ''), '[^0-9]', '', 'g') = v_phone_digits
  ORDER BY
    CASE WHEN l.whatsapp_jid = p_remote_jid THEN 0 ELSE 1 END,
    l.updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.leads
    SET
      nome_cliente = CASE
        WHEN nome_cliente = whatsapp
          OR nome_cliente = 'Contato ' || whatsapp
          OR nome_cliente LIKE 'Contato +%'
        THEN v_name
        ELSE nome_cliente
      END,
      whatsapp = v_phone,
      whatsapp_jid = coalesce(whatsapp_jid, p_remote_jid),
      whatsapp_business_phone = '+' || v_business_digits,
      whatsapp_last_message_at = greatest(
        coalesce(whatsapp_last_message_at, '-infinity'::timestamptz),
        v_message_at
      ),
      whatsapp_last_message_from_me = CASE
        WHEN whatsapp_last_message_at IS NULL OR v_message_at >= whatsapp_last_message_at THEN p_from_me
        ELSE whatsapp_last_message_from_me
      END,
      whatsapp_sync_source = 'baileys',
      whatsapp_synced_at = now(),
      origem = coalesce(origem, 'WhatsApp'),
      tags = CASE WHEN 'WhatsApp' = ANY(tags) THEN tags ELSE array_append(tags, 'WhatsApp') END,
      etapa_funil = CASE
        WHEN NOT p_from_me AND etapa_funil = 'prospectando' THEN 'conectado'
        ELSE etapa_funil
      END,
      ultima_atividade_em = greatest(ultima_atividade_em, v_message_at)
    WHERE id = v_lead.id;

    RETURN v_lead.id;
  END IF;

  INSERT INTO public.leads (
    nome_cliente,
    nome_empresa,
    whatsapp,
    temperatura,
    etapa_funil,
    origem,
    tags,
    ultima_atividade_em,
    whatsapp_jid,
    whatsapp_business_phone,
    whatsapp_last_message_at,
    whatsapp_last_message_from_me,
    whatsapp_sync_source,
    whatsapp_synced_at
  ) VALUES (
    v_name,
    'Não informado',
    v_phone,
    'precisa_qualificacao',
    CASE WHEN p_from_me THEN 'prospectando' ELSE 'conectado' END,
    'WhatsApp',
    ARRAY['WhatsApp'],
    v_message_at,
    p_remote_jid,
    '+' || v_business_digits,
    v_message_at,
    p_from_me,
    'baileys',
    now()
  )
  RETURNING id INTO v_lead.id;

  RETURN v_lead.id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_whatsapp_lead(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_whatsapp_lead(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN)
  TO service_role;

COMMENT ON FUNCTION public.sync_whatsapp_lead(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN) IS
  'Idempotently creates or updates a Closefy lead from a one-to-one WhatsApp conversation.';
