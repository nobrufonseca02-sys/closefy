export type WhatsAppConversation = {
  id: string;
  lead_id: string | null;
  business_phone: string;
  remote_jid: string;
  phone_number: string;
  display_name: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  last_message_from_me: boolean | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
};

export type WhatsAppMessage = {
  id: string;
  conversation_id: string;
  wa_message_id: string | null;
  direction: "inbound" | "outbound";
  message_type:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "document"
    | "sticker"
    | "location"
    | "contact"
    | "reaction"
    | "unknown";
  content: string;
  media_path: string | null;
  is_history: boolean;
  status: "pending" | "sending" | "sent" | "delivered" | "read" | "received" | "failed";
  error_message: string | null;
  attempts: number;
  sent_at: string;
  created_at: string;
  updated_at: string;
};

export type WhatsAppSessionStatus =
  "requested" | "pairing" | "connected" | "disconnecting" | "disconnected" | "error";

export type WhatsAppSession = {
  id: string;
  user_id: string;
  business_phone: string | null;
  desired_state: "connected" | "disconnected";
  status: WhatsAppSessionStatus;
  qr_data_url: string | null;
  qr_expires_at: string | null;
  last_seen_at: string | null;
  history_complete: boolean;
  error_message: string | null;
  legacy_auth: boolean;
  created_at: string;
  updated_at: string;
};

export function isConnectionLive(session: WhatsAppSession | null | undefined): boolean {
  if (!session || session.status !== "connected" || !session.last_seen_at) return false;
  return Date.now() - new Date(session.last_seen_at).getTime() < 90_000;
}

export function isQrExpired(session: WhatsAppSession | null | undefined): boolean {
  if (!session?.qr_expires_at) return true;
  return Date.now() >= new Date(session.qr_expires_at).getTime();
}

export function conversationName(conversation: WhatsAppConversation): string {
  return conversation.display_name?.trim() || conversation.phone_number;
}

export function formatWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return phone;
}
