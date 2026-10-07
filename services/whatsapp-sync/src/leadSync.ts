import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type LeadSyncInput = {
  remoteJid: string;
  phone: string;
  displayName: string | null;
  messageAt: Date;
  fromMe: boolean;
};

export async function syncLead(input: LeadSyncInput): Promise<string | null> {
  const { data, error } = await supabase.rpc("sync_whatsapp_lead", {
    p_business_phone: config.businessPhoneDigits,
    p_remote_jid: input.remoteJid,
    p_phone_number: input.phone,
    p_display_name: input.displayName,
    p_message_at: input.messageAt.toISOString(),
    p_from_me: input.fromMe,
  });

  if (error) throw new Error(`Closefy lead sync failed: ${error.message}`);
  return data as string | null;
}
