DO $$ DECLARE t text; owner_id uuid; BEGIN
 SELECT id INTO owner_id FROM auth.users WHERE lower(email)='nobrufonseca01@hotmail.com';
 IF owner_id IS NULL THEN RAISE EXCEPTION 'Principal account missing'; END IF;
 FOREACH t IN ARRAY ARRAY['leads','lead_feedbacks','lead_history','important_links','sales','tag_catalog','whatsapp_conversations','whatsapp_messages','whatsapp_connection_status'] LOOP
 EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid()',t);
 EXECUTE format('UPDATE public.%I SET user_id=$1 WHERE user_id IS NULL',t) USING owner_id;
 EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(user_id)',t||'_user_id_idx',t);
 END LOOP;
END $$;
ALTER TABLE public.tag_catalog DROP CONSTRAINT IF EXISTS tag_catalog_name_key;
CREATE UNIQUE INDEX tag_catalog_user_name_key ON public.tag_catalog(user_id,name);
DROP INDEX IF EXISTS public.leads_whatsapp_jid_unique;
CREATE UNIQUE INDEX leads_user_whatsapp_jid_unique ON public.leads(user_id,whatsapp_jid) WHERE whatsapp_jid IS NOT NULL;
ALTER TABLE public.whatsapp_conversations DROP CONSTRAINT IF EXISTS whatsapp_conversations_business_phone_phone_number_key;
CREATE UNIQUE INDEX whatsapp_conversations_owner_phone_key ON public.whatsapp_conversations(user_id,business_phone,phone_number);
CREATE TABLE public.whatsapp_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL DEFAULT auth.uid() UNIQUE,
 business_phone text UNIQUE, desired_state text NOT NULL DEFAULT 'connected',
 status text NOT NULL DEFAULT 'requested', qr_data_url text, qr_expires_at timestamptz,
 last_seen_at timestamptz, history_complete boolean NOT NULL DEFAULT false,
 error_message text, worker_id uuid, lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_sessions TO authenticated;
GRANT ALL ON public.whatsapp_sessions TO service_role;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.whatsapp_sessions FOR SELECT TO authenticated USING (user_id=auth.uid());
INSERT INTO public.whatsapp_sessions(user_id,business_phone,status,last_seen_at,history_complete)
 SELECT user_id,business_phone,status,last_seen_at,history_complete FROM public.whatsapp_connection_status LIMIT 1;
CREATE OR REPLACE FUNCTION public.enforce_record_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE parent_owner uuid;
BEGIN
 IF NEW.user_id IS NULL THEN RAISE EXCEPTION 'Record owner required'; END IF;
 IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Record owner cannot change'; END IF;
 IF TG_TABLE_NAME IN ('lead_feedbacks','lead_history','important_links','sales','whatsapp_conversations') AND NEW.lead_id IS NOT NULL THEN
  SELECT user_id INTO parent_owner FROM public.leads WHERE id=NEW.lead_id;
  IF parent_owner IS DISTINCT FROM NEW.user_id THEN RAISE EXCEPTION 'Lead belongs to another account'; END IF;
 END IF;
 IF TG_TABLE_NAME='whatsapp_messages' THEN
  SELECT user_id INTO parent_owner FROM public.whatsapp_conversations WHERE id=NEW.conversation_id;
  IF parent_owner IS DISTINCT FROM NEW.user_id THEN RAISE EXCEPTION 'Conversation belongs to another account'; END IF;
 END IF;
 RETURN NEW;
END; $$;
DO $$ DECLARE r record; t text; BEGIN
 FOR r IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename=ANY(ARRAY['leads','lead_feedbacks','lead_history','important_links','sales','tag_catalog','whatsapp_conversations','whatsapp_messages','whatsapp_connection_status']) LOOP
 EXECUTE format('DROP POLICY %I ON public.%I',r.policyname,r.tablename); END LOOP;
 FOREACH t IN ARRAY ARRAY['leads','lead_feedbacks','lead_history','important_links','sales','tag_catalog','whatsapp_conversations','whatsapp_messages','whatsapp_connection_status'] LOOP
 EXECUTE format('CREATE TRIGGER enforce_record_owner BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_record_owner()',t);
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 IF t LIKE 'whatsapp_%' THEN
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 EXECUTE format('CREATE POLICY owner_read ON public.%I FOR SELECT TO authenticated USING (user_id=auth.uid())',t);
 ELSE
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
 EXECUTE format('CREATE POLICY owner_access ON public.%I FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid())',t);
 END IF;
 END LOOP;
END $$;
GRANT INSERT ON public.whatsapp_messages TO authenticated;
CREATE POLICY owner_queue ON public.whatsapp_messages FOR INSERT TO authenticated WITH CHECK (
 user_id=auth.uid() AND direction='outbound' AND status='pending' AND wa_message_id IS NULL AND attempts=0
 AND EXISTS (SELECT 1 FROM public.whatsapp_conversations c JOIN public.whatsapp_sessions s ON s.user_id=c.user_id AND s.business_phone=c.business_phone WHERE c.id=conversation_id AND c.user_id=auth.uid() AND s.desired_state='connected' AND s.status='connected' AND s.last_seen_at>now()-interval '90 seconds')
 AND ((message_type='text' AND char_length(btrim(content)) BETWEEN 1 AND 4000 AND media_path IS NULL)
 OR (message_type='audio' AND media_path LIKE 'outbound/'||auth.uid()::text||'/'||conversation_id::text||'/%')));
DROP POLICY IF EXISTS "Authenticated can read WhatsApp audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload outbound WhatsApp audio" ON storage.objects;
CREATE POLICY owner_audio_read ON storage.objects FOR SELECT TO authenticated USING (
 bucket_id='whatsapp-audio' AND ((storage.foldername(name))[2]=auth.uid()::text
 OR EXISTS(SELECT 1 FROM public.whatsapp_messages m WHERE m.user_id=auth.uid() AND m.media_path=name)));
CREATE POLICY owner_audio_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='whatsapp-audio' AND (storage.foldername(name))[1]='outbound' AND (storage.foldername(name))[2]=auth.uid()::text
 AND EXISTS(SELECT 1 FROM public.whatsapp_conversations c WHERE c.user_id=auth.uid() AND c.id::text=(storage.foldername(name))[3]));
CREATE OR REPLACE FUNCTION public.whatsapp_worker_owner() RETURNS uuid LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$ SELECT coalesce(nullif(current_setting('closefy.whatsapp_user',true),''),'f253fc8c-d221-4880-8989-2844ab4047e2')::uuid $$;
CREATE OR REPLACE FUNCTION public.assert_whatsapp_number(p_phone text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.whatsapp_sessions WHERE user_id=public.whatsapp_worker_owner() AND business_phone='+'||regexp_replace(p_phone,'[^0-9]','','g') AND desired_state='connected') THEN RAISE EXCEPTION 'WhatsApp number not owned by session'; END IF;
END; $$;
DO $$ DECLARE r record; d text; BEGIN
 FOR r IN SELECT oid,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('sync_whatsapp_lead','sync_whatsapp_conversation','sync_whatsapp_message','heartbeat_whatsapp_connection','claim_whatsapp_outbound_messages','complete_whatsapp_outbound_message','fail_whatsapp_outbound_message','update_whatsapp_message_delivery','mark_whatsapp_conversation_read','retry_whatsapp_message','start_whatsapp_conversation') LOOP
 d:=pg_get_functiondef(r.oid);
 IF r.proname IN ('sync_whatsapp_lead','sync_whatsapp_conversation') THEN
 d:=regexp_replace(d,'  IF v_business_digits <> ''5521994177491'' THEN.*?  END IF;','  PERFORM public.assert_whatsapp_number(p_business_phone);','s');
 END IF;
 IF r.proname='sync_whatsapp_lead' THEN
 d:=replace(d,E'WHERE l.whatsapp_jid = p_remote_jid\n     OR',E'WHERE l.user_id=public.whatsapp_worker_owner() AND (l.whatsapp_jid = p_remote_jid\n     OR');
 d:=replace(d,E'= v_phone_digits\n  ORDER BY',E'= v_phone_digits)\n  ORDER BY');
 d:=replace(d,E'    nome_cliente,',E'    user_id,\n    nome_cliente,');
 d:=replace(d,E'    v_name,',E'    public.whatsapp_worker_owner(),\n    v_name,');
 ELSIF r.proname='sync_whatsapp_conversation' THEN
 d:=replace(d,E'    lead_id,',E'    user_id,\n    lead_id,');
 d:=replace(d,E'    v_lead_id,',E'    public.whatsapp_worker_owner(),\n    v_lead_id,');
 d:=replace(d,'ON CONFLICT (business_phone, phone_number)','ON CONFLICT (user_id, business_phone, phone_number)');
 ELSIF r.proname='sync_whatsapp_message' THEN
 d:=replace(d,E'    conversation_id,',E'    user_id,\n    conversation_id,');
 d:=replace(d,E'    v_conversation_id,',E'    public.whatsapp_worker_owner(),\n    v_conversation_id,');
 ELSIF r.proname='heartbeat_whatsapp_connection' THEN
 d:=replace(d,'IF v_digits <> ''5521994177491'' THEN RAISE EXCEPTION ''Unauthorized WhatsApp number''; END IF;','PERFORM public.assert_whatsapp_number(p_business_phone);');
 d:=replace(d,'business_phone, status, history_complete','user_id, business_phone, status, history_complete');
 d:=replace(d,'    ''+'' || v_digits,','    public.whatsapp_worker_owner(), ''+'' || v_digits,');
 ELSIF r.proname='claim_whatsapp_outbound_messages' THEN
 d:=replace(d,'WHERE pending.direction = ''outbound''','WHERE pending.user_id=public.whatsapp_worker_owner() AND pending.direction = ''outbound''');
 ELSIF r.proname IN ('complete_whatsapp_outbound_message','fail_whatsapp_outbound_message') THEN
 d:=replace(d,'WHERE id = p_message_id','WHERE user_id=public.whatsapp_worker_owner() AND id = p_message_id');
 ELSIF r.proname='update_whatsapp_message_delivery' THEN
 d:=replace(d,'WHERE wa_message_id = p_wa_message_id','WHERE user_id=public.whatsapp_worker_owner() AND wa_message_id = p_wa_message_id');
 ELSIF r.proname='mark_whatsapp_conversation_read' THEN
 d:=replace(d,'WHERE id = p_conversation_id','WHERE id = p_conversation_id AND user_id=auth.uid()');
 ELSIF r.proname='retry_whatsapp_message' THEN
 d:=replace(d,'WHERE id = p_message_id','WHERE id = p_message_id AND user_id=auth.uid()');
 ELSIF r.proname='start_whatsapp_conversation' THEN
 d:=replace(d,'v_conversation_id UUID;','v_conversation_id UUID; v_business_phone text;');
 d:=replace(d,'  v_conversation_id := public.sync_whatsapp_conversation(',E'  SELECT business_phone INTO v_business_phone FROM public.whatsapp_sessions WHERE user_id=auth.uid() AND status=''connected'' AND desired_state=''connected'' AND last_seen_at>now()-interval ''90 seconds'';\n  IF v_business_phone IS NULL THEN RAISE EXCEPTION ''Connect WhatsApp first''; END IF;\n  PERFORM set_config(''closefy.whatsapp_user'',auth.uid()::text,true);\n  v_conversation_id := public.sync_whatsapp_conversation(');
 d:=replace(d,'''5521994177491'',','v_business_phone,');
 d:=replace(d,'(conversation_id, direction, message_type, content, status)','(user_id, conversation_id, direction, message_type, content, status)');
 d:=replace(d,'VALUES (v_conversation_id, ''outbound''','VALUES (auth.uid(), v_conversation_id, ''outbound''');
 END IF;
 EXECUTE d;
 END LOOP;
END $$;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE '%whatsapp%' OR p.proname='assert_whatsapp_number') AND p.proname NOT LIKE 'worker_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.sig);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.sig);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.start_whatsapp_conversation(text,text,text),public.mark_whatsapp_conversation_read(uuid),public.retry_whatsapp_message(uuid) TO authenticated;