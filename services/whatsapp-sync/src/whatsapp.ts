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
    for (const id of [contact.id, contact.jid, contact.lid]) {
      if (id) directory.set(jidNormalizedUser(id), contact);
    }
  }
}

export function resolvePeer(
  remoteJid: string | null | undefined,
  directory: ContactDirectory,
): { remoteJid: string; phone: string; displayName: string | null } | null {
  if (!isOneToOneJid(remoteJid)) return null;

  const normalized = jidNormalizedUser(remoteJid);
  const contact = directory.get(normalized);
  const phoneJid = contact?.jid ? jidNormalizedUser(contact.jid) : normalized;

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
