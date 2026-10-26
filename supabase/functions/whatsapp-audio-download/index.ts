// Lets the Node worker fetch an outbound voice note the authenticated user
// recorded in the Closefy inbox, so it can hand the bytes to Baileys and send
// a real WhatsApp voice message. Runs with the service_role key Supabase
// injects automatically, same shared-secret auth model as every worker_* RPC
// (see verify_whatsapp_worker_token in supabase/migrations).
import { createClient } from "jsr:@supabase/supabase-js@2";

const AUDIO_BUCKET = "whatsapp-audio";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const integrationToken = req.headers.get("x-integration-token");
  const objectPath = new URL(req.url).searchParams.get("path");
  if (!integrationToken || !objectPath) {
    return json({ error: "Missing x-integration-token header or path query param" }, 400);
  }
  if (!objectPath.startsWith("outbound/")) {
    return json({ error: "Only outbound/ paths can be downloaded" }, 403);
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

  const { data, error } = await admin.storage.from(AUDIO_BUCKET).download(objectPath);
  if (error || !data) {
    return json({ error: error?.message || "Audio file not found" }, 404);
  }

  return new Response(data, {
    status: 200,
    headers: { "content-type": data.type || "application/octet-stream" },
  });
});
