import "dotenv/config";

const ALLOWED_BUSINESS_PHONE = "5521994177491";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

const configuredPhone = digits(
  process.env.WHATSAPP_BUSINESS_PHONE_NUMBER || ALLOWED_BUSINESS_PHONE,
);
if (configuredPhone !== ALLOWED_BUSINESS_PHONE) {
  throw new Error("WHATSAPP_BUSINESS_PHONE_NUMBER is not authorized for this Closefy integration");
}

export const config = {
  supabaseUrl: required("SUPABASE_URL"),
  supabaseKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    required("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PUBLISHABLE_KEY"),
  // Kept separate from supabaseKey on purpose: the Lovable Cloud / integration
  // token deployment uses the publishable key plus worker_* RPC wrappers for
  // everything, including when this is also set. Storage has no equivalent
  // wrapper (uploads hit the Storage API directly, not a SQL function we
  // control), so it's the one thing that genuinely needs service-role to
  // bypass bucket RLS. Optional: audio upload just logs and falls back to a
  // text placeholder until this is configured.
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null,
  integrationToken: process.env.WHATSAPP_INTEGRATION_TOKEN?.trim() || null,
  businessPhoneDigits: configuredPhone,
  pairingMode: process.env.WHATSAPP_PAIRING_MODE === "true",
  authStateDir: process.env.WHATSAPP_AUTH_STATE_DIR?.trim() || "./auth_state",
  logLevel: process.env.LOG_LEVEL?.trim() || "info",
  port: Number(process.env.PORT || 3003),
};
