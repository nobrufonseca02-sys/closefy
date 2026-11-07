ALTER TABLE public.whatsapp_sessions ADD COLUMN legacy_auth boolean NOT NULL DEFAULT false;
UPDATE public.whatsapp_sessions SET legacy_auth=true WHERE business_phone IS NOT NULL;
CREATE OR REPLACE FUNCTION public.enforce_record_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE parent_owner uuid;
BEGIN
 IF NEW.user_id IS NULL THEN RAISE EXCEPTION 'Record owner required'; END IF;
 IF TG_OP='UPDATE' THEN IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Record owner cannot change'; END IF; END IF;
 IF TG_TABLE_NAME IN ('lead_feedbacks','lead_history','important_links','sales','whatsapp_conversations') THEN
 IF NEW.lead_id IS NOT NULL THEN
 SELECT user_id INTO parent_owner FROM public.leads WHERE id=NEW.lead_id;
 IF parent_owner IS DISTINCT FROM NEW.user_id THEN RAISE EXCEPTION 'Lead belongs to another account'; END IF;
 END IF; END IF;
 IF TG_TABLE_NAME='whatsapp_messages' THEN
 SELECT user_id INTO parent_owner FROM public.whatsapp_conversations WHERE id=NEW.conversation_id;
 IF parent_owner IS DISTINCT FROM NEW.user_id THEN RAISE EXCEPTION 'Conversation belongs to another account'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.request_whatsapp_pairing(p_disconnect boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE sid uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 INSERT INTO public.whatsapp_sessions(user_id,desired_state,status) VALUES(auth.uid(),CASE WHEN p_disconnect THEN 'disconnected' ELSE 'connected' END,CASE WHEN p_disconnect THEN 'disconnected' ELSE 'requested' END)
 ON CONFLICT(user_id) DO UPDATE SET desired_state=EXCLUDED.desired_state,
 status=CASE WHEN p_disconnect THEN 'disconnecting' WHEN whatsapp_sessions.status='connected' AND whatsapp_sessions.last_seen_at>now()-interval '90 seconds' THEN 'connected' ELSE 'requested' END,
 qr_data_url=NULL,qr_expires_at=NULL,error_message=NULL,updated_at=now()
 RETURNING id INTO sid;
 RETURN sid;
END; $$;
REVOKE ALL ON FUNCTION public.request_whatsapp_pairing(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_whatsapp_pairing(boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.worker_lease_whatsapp_sessions(p_integration_token text,p_worker_id uuid) RETURNS SETOF public.whatsapp_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.verify_whatsapp_worker_token(p_integration_token);
 RETURN QUERY WITH eligible AS (
 SELECT id FROM public.whatsapp_sessions WHERE desired_state='connected' AND (worker_id=p_worker_id OR lease_until IS NULL OR lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 100
 ), leased AS (UPDATE public.whatsapp_sessions s SET worker_id=p_worker_id,lease_until=now()+interval '60 seconds' FROM eligible e WHERE s.id=e.id RETURNING s.*)
 SELECT * FROM leased
 UNION ALL SELECT * FROM public.whatsapp_sessions WHERE worker_id=p_worker_id AND desired_state='disconnected' AND lease_until>now();
END; $$;
CREATE OR REPLACE FUNCTION public.worker_session_call(p_integration_token text,p_session_id uuid,p_worker_id uuid,p_operation text,p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE sess public.whatsapp_sessions%ROWTYPE; result jsonb; sid uuid; digits text;
BEGIN
 PERFORM public.verify_whatsapp_worker_token(p_integration_token);
 SELECT * INTO sess FROM public.whatsapp_sessions WHERE id=p_session_id FOR UPDATE;
 IF sess.id IS NULL OR sess.worker_id IS DISTINCT FROM p_worker_id OR sess.lease_until IS NULL OR sess.lease_until<now() THEN RAISE EXCEPTION 'Session lease not owned'; END IF;
 PERFORM set_config('closefy.whatsapp_user',sess.user_id::text,true);
 IF p_operation='status' THEN
  IF p_payload->>'status' NOT IN ('pairing','connected','disconnected','error') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF p_payload->>'status' IN ('connected','pairing') AND sess.desired_state<>'connected' THEN RAISE EXCEPTION 'Session cancelled'; END IF;
  digits:=regexp_replace(coalesce(p_payload->>'business_phone',sess.business_phone),'[^0-9]','','g');
  IF p_payload->>'status'='connected' AND (digits IS NULL OR length(digits) NOT BETWEEN 10 AND 15) THEN RAISE EXCEPTION 'Invalid connected number'; END IF;
  IF p_payload->>'status'='pairing' AND coalesce(p_payload->>'qr_data_url','') NOT LIKE 'data:image/png;base64,%' THEN RAISE EXCEPTION 'Invalid QR'; END IF;
  UPDATE public.whatsapp_sessions SET
   business_phone=CASE WHEN p_payload->>'status'='connected' THEN '+'||digits ELSE business_phone END,
   status=p_payload->>'status',last_seen_at=now(),
   history_complete=history_complete OR coalesce((p_payload->>'history_complete')::boolean,false),
   qr_data_url=CASE WHEN p_payload->>'status'='pairing' THEN p_payload->>'qr_data_url' ELSE NULL END,
   qr_expires_at=CASE WHEN p_payload->>'status'='pairing' THEN now()+interval '45 seconds' ELSE NULL END,
   error_message=left(p_payload->>'error_message',500),updated_at=now()
  WHERE id=sess.id;
  RETURN '{}'::jsonb;
 END IF;
 IF sess.desired_state<>'connected' THEN RAISE EXCEPTION 'Session disconnected'; END IF;
 IF p_operation='sync_conversation' THEN
 sid:=public.sync_whatsapp_conversation(sess.business_phone,p_payload->>'p_remote_jid',p_payload->>'p_phone_number',p_payload->>'p_display_name',(p_payload->>'p_activity_at')::timestamptz,(p_payload->>'p_from_me')::boolean); RETURN to_jsonb(sid);
 ELSIF p_operation='sync_message' THEN
 sid:=public.sync_whatsapp_message(sess.business_phone,p_payload->>'p_remote_jid',p_payload->>'p_phone_number',p_payload->>'p_display_name',p_payload->>'p_wa_message_id',p_payload->>'p_content',p_payload->>'p_message_type',(p_payload->>'p_message_at')::timestamptz,(p_payload->>'p_from_me')::boolean,(p_payload->>'p_is_history')::boolean,p_payload->>'p_media_path'); RETURN to_jsonb(sid);
 ELSIF p_operation='claim' THEN
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO result FROM public.claim_whatsapp_outbound_messages(coalesce((p_payload->>'p_limit')::integer,10)) x; RETURN result;
 ELSIF p_operation='complete' THEN
 PERFORM public.complete_whatsapp_outbound_message((p_payload->>'p_message_id')::uuid,p_payload->>'p_wa_message_id',(p_payload->>'p_sent_at')::timestamptz);
 ELSIF p_operation='fail' THEN
 PERFORM public.fail_whatsapp_outbound_message((p_payload->>'p_message_id')::uuid,p_payload->>'p_error_message');
 ELSIF p_operation='delivery' THEN
 PERFORM public.update_whatsapp_message_delivery(p_payload->>'p_wa_message_id',p_payload->>'p_status');
 ELSE RAISE EXCEPTION 'Unsupported session operation'; END IF;
 RETURN '{}'::jsonb;
END; $$;
REVOKE ALL ON FUNCTION public.worker_lease_whatsapp_sessions(text,uuid),public.worker_session_call(text,uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.worker_lease_whatsapp_sessions(text,uuid),public.worker_session_call(text,uuid,uuid,text,jsonb) TO anon,authenticated,service_role;