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
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  businessPhoneDigits: configuredPhone,
  pairingMode: process.env.WHATSAPP_PAIRING_MODE === "true",
  authStateDir: process.env.WHATSAPP_AUTH_STATE_DIR?.trim() || "./auth_state",
  logLevel: process.env.LOG_LEVEL?.trim() || "info",
  port: Number(process.env.PORT || 3003),
};
