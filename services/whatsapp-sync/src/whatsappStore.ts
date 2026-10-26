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
  mediaPath?: string | null;
};

// Storage has no SECURITY DEFINER-style wrapper to lean on like the RPC
// calls do, so bucket writes need an actually privileged caller. Rather than
// handing this worker a standing service-role key, the privileged part runs
// inside the whatsapp-audio-upload edge function (which gets service_role
// access automatically from Supabase); this just calls it with the same
// shared integration token used for every other worker_* RPC.
export async function uploadAudioMedia(
  waMessageId: string,
  buffer: Buffer,
  mimetype: string,
): Promise<string> {
  if (!config.integrationToken) {
    throw new Error("WHATSAPP_INTEGRATION_TOKEN is required to upload WhatsApp audio");
  }
  const response = await fetch(`${config.supabaseUrl}/functions/v1/whatsapp-audio-upload`, {
    method: "POST",
    headers: {
      "content-type": mimetype,
      "x-integration-token": config.integrationToken,
      "x-wa-message-id": waMessageId,
    },
    body: new Uint8Array(buffer),
  });
  const payload = (await response.json().catch(() => null)) as
    | { path?: string; error?: string }
    | null;
  if (!response.ok || !payload?.path) {
    throw new Error(`Could not upload WhatsApp audio: ${payload?.error || response.statusText}`);
  }
  return payload.path;
}

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

function isMissingMediaPathOverload(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST202" &&
    typeof error.message === "string" &&
    error.message.includes("p_media_path")
  );
}

export async function syncMessage(input: MessageSyncInput): Promise<string> {
  const baseParams = {
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
  };

  const { data, error } = await supabase.rpc(
    workerRpc("sync_whatsapp_message"),
    workerParams({ ...baseParams, p_media_path: input.mediaPath ?? null }),
  );
  if (!error) return data as string;

  // The media_path migration may not be applied yet on this project. Fall
  // back to the pre-migration call shape so plain message sync never breaks
  // because of an audio-only feature lagging behind in the database.
  if (!isMissingMediaPathOverload(error)) {
    throw new Error(`Closefy message sync failed: ${error.message}`);
  }
  const fallback = await supabase.rpc(workerRpc("sync_whatsapp_message"), workerParams(baseParams));
  if (fallback.error) {
    throw new Error(`Closefy message sync failed: ${fallback.error.message}`);
  }
  return fallback.data as string;
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
