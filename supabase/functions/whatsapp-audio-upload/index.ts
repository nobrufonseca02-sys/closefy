// Uploads a WhatsApp voice-note straight into the whatsapp-audio Storage
// bucket. Runs with the service_role key Supabase injects automatically into
// every deployed edge function, so it's the one place that can bypass the
// bucket's RLS without the Node worker ever holding that key itself. Auth is
// the same shared-secret model as the worker_* RPCs (see
// verify_whatsapp_worker_token in supabase/migrations), not a Supabase JWT.
import { createClient } from "jsr:@supabase/supabase-js@2";

const AUDIO_BUCKET = "whatsapp-audio";

function extensionFor(mimetype: string): string {
  const subtype = mimetype.split(";")[0]?.split("/")[1]?.trim().toLowerCase();
  if (subtype === "ogg") return "ogg";
  if (subtype === "mp4" || subtype === "m4a" || subtype === "aac") return "m4a";
  if (subtype === "mpeg" || subtype === "mp3") return "mp3";
  if (subtype === "webm") return "webm";
  if (subtype === "wav" || subtype === "x-wav") return "wav";
  return "bin";
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const integrationToken = req.headers.get("x-integration-token");
  const waMessageId = req.headers.get("x-wa-message-id");
  const contentType = req.headers.get("content-type") || "application/octet-stream";

  if (!integrationToken || !waMessageId) {
    return json({ error: "Missing x-integration-token or x-wa-message-id header" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Edge function is missing its Supabase service credentials" }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { error: tokenError } = await admin.rpc("verify_whatsapp_worker_token", {
    p_integration_token: integrationToken,
  });
  if (tokenError) return json({ error: "Invalid worker credential" }, 401);

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) return json({ error: "Empty audio payload" }, 400);

  const safeId = waMessageId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const path = `${safeId}.${extensionFor(contentType)}`;

  const { error: uploadError } = await admin.storage
    .from(AUDIO_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (uploadError) return json({ error: uploadError.message }, 500);

  return json({ path }, 200);
});
