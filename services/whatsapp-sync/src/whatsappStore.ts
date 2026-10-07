import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function workerRpc(name: string): string {
  return config.integrationToken ? `worker_${name}` : name;
}

function workerParams<T extends Record<string, unknown>>(
  params: T,
): T & {
  p_integration_token?: string;
} {
  return config.integrationToken
    ? { ...params, p_integration_token: config.integrationToken }
    : params;
}

export type ConversationSyncInput = {
  remoteJid: string;
  phone: string;
  displayName: string | null;
  activityAt: Date;
  fromMe: boolean;
};

export type MessageSyncInput = ConversationSyncInput & {
  waMessageId: string;
  content: string;
  messageType: string;
  isHistory: boolean;
};

export type ClaimedOutboundMessage = {
  outbound_id: string;
  conversation_id: string;
  remote_jid: string;
  phone_number: string;
  content: string;
  attempts: number;
};

export async function syncConversation(input: ConversationSyncInput): Promise<string> {
  const { data, error } = await supabase.rpc(
    workerRpc("sync_whatsapp_conversation"),
    workerParams({
      p_business_phone: config.businessPhoneDigits,
      p_remote_jid: input.remoteJid,
      p_phone_number: input.phone,
      p_display_name: input.displayName,
      p_activity_at: input.activityAt.toISOString(),
      p_from_me: input.fromMe,
    }),
  );
  if (error) throw new Error(`Closefy conversation sync failed: ${error.message}`);
  return data as string;
}

export async function syncMessage(input: MessageSyncInput): Promise<string> {
  const { data, error } = await supabase.rpc(
    workerRpc("sync_whatsapp_message"),
    workerParams({
      p_business_phone: config.businessPhoneDigits,
      p_remote_jid: input.remoteJid,
      p_phone_number: input.phone,
      p_display_name: input.displayName,
      p_wa_message_id: input.waMessageId,
      p_content: input.content,
      p_message_type: input.messageType,
      p_message_at: input.activityAt.toISOString(),
      p_from_me: input.fromMe,
      p_is_history: input.isHistory,
    }),
  );
  if (error) throw new Error(`Closefy message sync failed: ${error.message}`);
  return data as string;
}

export async function claimOutboundMessages(limit = 10): Promise<ClaimedOutboundMessage[]> {
  const { data, error } = await supabase.rpc(
    workerRpc("claim_whatsapp_outbound_messages"),
    workerParams({
      p_limit: limit,
    }),
  );
  if (error) throw new Error(`Could not claim outbound messages: ${error.message}`);
  return (data || []) as ClaimedOutboundMessage[];
}

export async function completeOutboundMessage(
  messageId: string,
  waMessageId: string,
  sentAt: Date,
): Promise<void> {
  const { error } = await supabase.rpc(
    workerRpc("complete_whatsapp_outbound_message"),
    workerParams({
      p_message_id: messageId,
      p_wa_message_id: waMessageId,
      p_sent_at: sentAt.toISOString(),
    }),
  );
  if (error) throw new Error(`Could not complete outbound message: ${error.message}`);
}

export async function failOutboundMessage(messageId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc(
    workerRpc("fail_whatsapp_outbound_message"),
    workerParams({
      p_message_id: messageId,
      p_error_message: reason,
    }),
  );
  if (error) throw new Error(`Could not fail outbound message: ${error.message}`);
}

export async function updateMessageDelivery(
  waMessageId: string,
  status: "delivered" | "read",
): Promise<void> {
  const { error } = await supabase.rpc(
    workerRpc("update_whatsapp_message_delivery"),
    workerParams({
      p_wa_message_id: waMessageId,
      p_status: status,
    }),
  );
  if (error) throw new Error(`Could not update message delivery: ${error.message}`);
}

export async function heartbeat(
  connected: boolean,
  historyComplete: boolean,
  errorMessage: string | null = null,
): Promise<void> {
  const { error } = await supabase.rpc(
    workerRpc("heartbeat_whatsapp_connection"),
    workerParams({
      p_business_phone: config.businessPhoneDigits,
      p_connected: connected,
      p_history_complete: historyComplete,
      p_error_message: errorMessage,
    }),
  );
  if (error) throw new Error(`Could not update WhatsApp heartbeat: ${error.message}`);
}
