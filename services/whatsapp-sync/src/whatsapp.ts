import { jidNormalizedUser, type Contact, type WAMessage } from "@whiskeysockets/baileys";

export type ContactDirectory = Map<string, Contact>;

export function isOneToOneJid(jid: string | null | undefined): jid is string {
  if (!jid) return false;
  const normalized = jidNormalizedUser(jid);
  return (
    normalized.endsWith("@s.whatsapp.net") ||
    normalized.endsWith("@c.us") ||
    normalized.endsWith("@lid")
  );
}

export function contactName(contact: Contact | undefined): string | null {
  return contact?.name?.trim() || contact?.verifiedName?.trim() || contact?.notify?.trim() || null;
}

export function addContacts(directory: ContactDirectory, contacts: Contact[]): void {
  for (const contact of contacts) {
    for (const id of [contact.id, contact.phoneNumber, contact.lid]) {
      if (id) directory.set(jidNormalizedUser(id), contact);
    }
  }
}

export function addLidMapping(directory: ContactDirectory, lid: string, phoneNumber: string): void {
  const normalizedLid = jidNormalizedUser(lid);
  const normalizedPhone = jidNormalizedUser(phoneNumber);
  const existing = directory.get(normalizedLid) || directory.get(normalizedPhone);
  addContacts(directory, [
    {
      ...(existing || {}),
      id: normalizedLid,
      lid: normalizedLid,
      phoneNumber: normalizedPhone,
    },
  ]);
}

export function resolvePeer(
  remoteJid: string | null | undefined,
  directory: ContactDirectory,
  alternateJid?: string | null,
): { remoteJid: string; phone: string; displayName: string | null } | null {
  if (!isOneToOneJid(remoteJid)) return null;

  const normalized = jidNormalizedUser(remoteJid);
  const contact = directory.get(normalized);
  const normalizedAlternate = alternateJid ? jidNormalizedUser(alternateJid) : null;
  const phoneJid = contact?.phoneNumber
    ? jidNormalizedUser(contact.phoneNumber)
    : normalizedAlternate?.endsWith("@s.whatsapp.net") || normalizedAlternate?.endsWith("@c.us")
      ? normalizedAlternate
      : normalized;

  if (!phoneJid.endsWith("@s.whatsapp.net") && !phoneJid.endsWith("@c.us")) return null;
  const phoneDigits = phoneJid.split("@")[0]?.replace(/\D/g, "") || "";
  if (phoneDigits.length < 10 || phoneDigits.length > 15) return null;

  return {
    remoteJid: normalized,
    phone: `+${phoneDigits}`,
    displayName: contactName(contact),
  };
}

export function messageTimestamp(message: WAMessage): Date {
  const value = message.messageTimestamp;
  let seconds = 0;
  if (typeof value === "number") seconds = value;
  else if (value && typeof value === "object" && "toNumber" in value) seconds = value.toNumber();
  return seconds > 0 ? new Date(seconds * 1000) : new Date();
}

export type ExtractedMessage = {
  type:
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
};

function unwrapMessage(message: WAMessage["message"]) {
  return (
    message?.ephemeralMessage?.message ||
    message?.viewOnceMessage?.message ||
    message?.viewOnceMessageV2?.message ||
    message?.documentWithCaptionMessage?.message ||
    message
  );
}

export function extractMessage(message: WAMessage): ExtractedMessage | null {
  const content = unwrapMessage(message.message);
  if (!content) return null;

  const text = content.conversation || content.extendedTextMessage?.text;
  if (text?.trim()) return { type: "text", content: text.trim() };

  if (content.imageMessage) {
    return { type: "image", content: content.imageMessage.caption?.trim() || "📷 Imagem" };
  }
  if (content.videoMessage) {
    return { type: "video", content: content.videoMessage.caption?.trim() || "🎥 Vídeo" };
  }
  if (content.audioMessage) return { type: "audio", content: "🎵 Áudio" };
  if (content.documentMessage) {
    return {
      type: "document",
      content:
        content.documentMessage.caption?.trim() ||
        content.documentMessage.fileName?.trim() ||
        "📄 Documento",
    };
  }
  if (content.stickerMessage) return { type: "sticker", content: "Sticker" };
  if (content.locationMessage) {
    const latitude = content.locationMessage.degreesLatitude;
    const longitude = content.locationMessage.degreesLongitude;
    return {
      type: "location",
      content:
        typeof latitude === "number" && typeof longitude === "number"
          ? `📍 Localização: ${latitude}, ${longitude}`
          : "📍 Localização",
    };
  }
  if (content.contactMessage) {
    return {
      type: "contact",
      content: `Contato: ${content.contactMessage.displayName?.trim() || "sem nome"}`,
    };
  }
  if (content.reactionMessage?.text) {
    return { type: "reaction", content: `Reação: ${content.reactionMessage.text}` };
  }

  if (content.protocolMessage || content.senderKeyDistributionMessage) return null;
  return { type: "unknown", content: "Mensagem não suportada" };
}
