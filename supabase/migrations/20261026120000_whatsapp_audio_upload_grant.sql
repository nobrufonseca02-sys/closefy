-- Lets the whatsapp-audio-upload edge function (running with the
-- service_role key that Supabase injects automatically into every deployed
-- function) call the existing worker-token check. The prior migration only
-- granted this to PUBLIC by default and then revoked it from PUBLIC, anon
-- and authenticated, never explicitly re-granting it to service_role.
GRANT EXECUTE ON FUNCTION public.verify_whatsapp_worker_token(TEXT) TO service_role;
