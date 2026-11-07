import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Audio upload/download go through dedicated edge functions keyed by
// wa_message_id / an explicit outbound/<user_id>/... storage path, not by
// session — they need no per-tenant routing of their own (see
// supabase/functions/whatsapp-audio-{upload,download}), just the same shared
// integration token every worker_* RPC uses.
// ---------------------------------------------------------------------------

export async function uploadAudioMedia(
  waMessageId: string,
  buffer: Buffer,
  mimetype: string,
): Promise<string> {
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

export async function downloadOutboundAudio(
  mediaPath: string,
): Promise<{ buffer: Buffer; mimetype: string }> {
  const url = new URL(`${config.supabaseUrl}/functions/v1/whatsapp-audio-download`);
  url.searchParams.set("path", mediaPath);
  const response = await fetch(url, {
    headers: { "x-integration-token": config.integrationToken },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(`Could not download WhatsApp audio: ${payload?.error || response.statusText}`);
  }
  const mimetype = response.headers.get("content-type") || "audio/ogg";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mimetype };
}

// ---------------------------------------------------------------------------
// Everything else is per-session and goes through the single worker_session_call
// gateway (drizzle/migrations/0003_private_whatsapp_pairing.sql): it checks this
// worker actually holds the lease for p_session_id, then scopes every nested
// call to that session's own user_id before touching any tenant data. Direct
// calls to the old worker_sync_whatsapp_* RPCs are still possible but fall back
// to a hardcoded legacy account (see 0002) — never call those from here.
// ---------------------------------------------------------------------------

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

export type ClaimedOutboundMessage = {
  outbound_id: string;
  conversation_id: string;
  remote_jid: string;
  phone_number: string;
  content: string;
  message_type: string;
  media_path: string | null;
  attempts: number;
};

export type SessionStatusReport =
  | { status: "pairing"; qrDataUrl: string }
  | { status: "connected"; businessPhone: string; historyComplete?: boolean }
  | { status: "disconnected" }
  | { status: "error"; errorMessage: string };

export type SessionStore = ReturnType<typeof createSessionStore>;

export function createSessionStore(sessionId: string) {
  async function call(operation: string, payload: Record<string, unknown> = {}): Promise<unknown> {
    const { data, error } = await supabase.rpc("worker_session_call", {
      p_integration_token: config.integrationToken,
      p_session_id: sessionId,
      p_worker_id: config.workerId,
      p_operation: operation,
      p_payload: payload,
    });
    if (error) throw new Error(`Closefy session [${operation}] failed: ${error.message}`);
    return data;
  }

  return {
    sessionId,

    async reportStatus(report: SessionStatusReport): Promise<void> {
      await call("status", {
        status: report.status,
        ...(report.status === "pairing" ? { qr_data_url: report.qrDataUrl } : {}),
        ...(report.status === "connected"
          ? { business_phone: report.businessPhone, history_complete: report.historyComplete }
          : {}),
        ...(report.status === "error" ? { error_message: report.errorMessage } : {}),
      });
    },

    async syncConversation(input: ConversationSyncInput): Promise<string> {
      return (await call("sync_conversation", {
        p_remote_jid: input.remoteJid,
        p_phone_number: input.phone,
        p_display_name: input.displayName,
        p_activity_at: input.activityAt.toISOString(),
        p_from_me: input.fromMe,
      })) as string;
    },

    async syncMessage(input: MessageSyncInput): Promise<string> {
      return (await call("sync_message", {
        p_remote_jid: input.remoteJid,
        p_phone_number: input.phone,
        p_display_name: input.displayName,
        p_wa_message_id: input.waMessageId,
        p_content: input.content,
        p_message_type: input.messageType,
        p_message_at: input.activityAt.toISOString(),
        p_from_me: input.fromMe,
        p_is_history: input.isHistory,
        p_media_path: input.mediaPath ?? null,
      })) as string;
    },

    async claimOutboundMessages(limit = 10): Promise<ClaimedOutboundMessage[]> {
      return ((await call("claim", { p_limit: limit })) || []) as ClaimedOutboundMessage[];
    },

    async completeOutboundMessage(messageId: string, waMessageId: string, sentAt: Date): Promise<void> {
      await call("complete", {
        p_message_id: messageId,
        p_wa_message_id: waMessageId,
        p_sent_at: sentAt.toISOString(),
      });
    },

    async failOutboundMessage(messageId: string, reason: string): Promise<void> {
      await call("fail", { p_message_id: messageId, p_error_message: reason });
    },

    async updateMessageDelivery(waMessageId: string, status: "delivered" | "read"): Promise<void> {
      await call("delivery", { p_wa_message_id: waMessageId, p_status: status });
    },
  };
}

// ---------------------------------------------------------------------------
// Fleet-level: which sessions should this worker be running right now.
// ---------------------------------------------------------------------------

export type LeasedSession = {
  id: string;
  user_id: string;
  business_phone: string | null;
  desired_state: "connected" | "disconnected";
  status: string;
  legacy_auth: boolean;
};

export async function leaseSessions(): Promise<LeasedSession[]> {
  const { data, error } = await supabase.rpc("worker_lease_whatsapp_sessions", {
    p_integration_token: config.integrationToken,
    p_worker_id: config.workerId,
  });
  if (error) throw new Error(`Could not lease WhatsApp sessions: ${error.message}`);
  return (data || []) as LeasedSession[];
}
