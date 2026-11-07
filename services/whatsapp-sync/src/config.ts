import "dotenv/config";
import { randomUUID } from "node:crypto";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

// One worker process can now hold leases on many tenants' WhatsApp sessions
// at once (see worker_lease_whatsapp_sessions / worker_session_call in
// drizzle/migrations/0002 and 0003). There is no more single authorized
// business number: every session's own phone is whatever number its owner
// pairs, discovered dynamically when that session connects.
export const config = {
  supabaseUrl: required("SUPABASE_URL"),
  supabaseKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    required("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PUBLISHABLE_KEY"),
  // Required (not optional): every session RPC (worker_lease_whatsapp_sessions,
  // worker_session_call) is SECURITY DEFINER and gated on this shared secret,
  // not a Supabase user session, since the worker never logs in as anyone.
  integrationToken: required("WHATSAPP_INTEGRATION_TOKEN"),
  // Stable per *process start*, not persisted across restarts: leases expire
  // in 60s (see worker_lease_whatsapp_sessions), so a restart just re-leases
  // under a fresh id within one polling cycle. No continuity to preserve.
  workerId: randomUUID(),
  // Parent directory; each session gets its own `<authStateRoot>/<sessionId>/`
  // subfolder so N concurrent Baileys sockets never share credential files.
  authStateRoot: process.env.WHATSAPP_AUTH_STATE_DIR?.trim() || "./auth_state",
  // How often the manager asks the database which sessions it should be
  // running right now. Must stay comfortably under the 60s lease window so
  // an already-running session's lease renews before it would expire.
  leasePollIntervalMs: Number(process.env.WHATSAPP_LEASE_POLL_MS || 20_000),
  logLevel: process.env.LOG_LEVEL?.trim() || "info",
  port: Number(process.env.PORT || 3003),
};
