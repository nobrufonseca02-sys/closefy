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
  is_history: boolean;
  status: "pending" | "sending" | "sent" | "delivered" | "read" | "received" | "failed";
  error_message: string | null;
  attempts: number;
  sent_at: string;
  created_at: string;
  updated_at: string;
};

export type WhatsAppConnectionStatus = {
  business_phone: string;
  status: "connected" | "disconnected" | "error";
  history_complete: boolean;
  last_seen_at: string;
  history_synced_at: string | null;
  error_message: string | null;
  updated_at: string;
};

export function isConnectionLive(connection: WhatsAppConnectionStatus | null | undefined): boolean {
  if (!connection || connection.status !== "connected") return false;
  return Date.now() - new Date(connection.last_seen_at).getTime() < 90_000;
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
