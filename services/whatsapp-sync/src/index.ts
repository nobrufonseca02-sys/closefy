import makeWASocket, {
  Browsers,
  DisconnectReason,
  jidDecode,
  jidNormalizedUser,
  useMultiFileAuthState as loadMultiFileAuthState,
  type Chat,
  type Contact,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import { config } from "./config.js";
import { startHealthServer, type SyncStatus } from "./health.js";
import { syncLead } from "./leadSync.js";
import { log } from "./logger.js";
import {
  addContacts,
  isOneToOneJid,
  messageTimestamp,
  resolvePeer,
  type ContactDirectory,
} from "./whatsapp.js";

const contacts: ContactDirectory = new Map();
const pendingMessages = new Map<string, WAMessage>();
const pendingChats = new Map<string, Chat>();
const status: SyncStatus = {
  connected: false,
  historyComplete: false,
  synced: 0,
  skipped: 0,
  pending: 0,
  failed: 0,
};
let stoppedForWrongNumber = false;
let retryingPending = false;

function refreshPendingCount(): void {
  status.pending = pendingMessages.size + pendingChats.size;
}

function ownPhoneFromSocket(sock: WASocket): string | null {
  const decoded = jidDecode(sock.user?.id);
  const digits = decoded?.user?.replace(/\D/g, "") || "";
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

async function syncMessage(message: WAMessage): Promise<void> {
  const peer = resolvePeer(message.key.remoteJid, contacts);
  if (!peer) {
    const jid = message.key.remoteJid ? jidNormalizedUser(message.key.remoteJid) : null;
    if (jid?.endsWith("@lid")) {
      pendingMessages.set(
        message.key.id || `${jid}:${messageTimestamp(message).getTime()}`,
        message,
      );
      refreshPendingCount();
    } else {
      status.skipped += 1;
    }
    return;
  }
  if (peer.phone.replace(/\D/g, "") === config.businessPhoneDigits) {
    status.skipped += 1;
    return;
  }

  try {
    await syncLead({
      ...peer,
      displayName:
        peer.displayName || (!message.key.fromMe ? message.pushName?.trim() || null : null),
      messageAt: messageTimestamp(message),
      fromMe: Boolean(message.key.fromMe),
    });
    status.synced += 1;
  } catch (error) {
    status.failed += 1;
    log.error({
      event: "lead_sync_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function syncChat(chat: Chat): Promise<void> {
  const peer = resolvePeer(chat.id, contacts);
  if (!peer) {
    if (isOneToOneJid(chat.id) && jidNormalizedUser(chat.id).endsWith("@lid")) {
      pendingChats.set(jidNormalizedUser(chat.id), chat);
      refreshPendingCount();
    } else {
      status.skipped += 1;
    }
    return;
  }
  if (peer.phone.replace(/\D/g, "") === config.businessPhoneDigits) {
    status.skipped += 1;
    return;
  }

  const rawTimestamp = Number(chat.conversationTimestamp || chat.lastMessageRecvTimestamp || 0);
  const messageAt = rawTimestamp > 0 ? new Date(rawTimestamp * 1000) : new Date();
  try {
    await syncLead({ ...peer, messageAt, fromMe: true });
    status.synced += 1;
  } catch (error) {
    status.failed += 1;
    log.error({
      event: "chat_sync_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function syncWithConcurrency<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency = 5,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item) await worker(item);
    }
  });
  await Promise.all(runners);
}

async function retryPending(): Promise<void> {
  if (retryingPending || (!pendingMessages.size && !pendingChats.size)) return;
  retryingPending = true;
  try {
    const messages = [...pendingMessages.values()];
    const chats = [...pendingChats.values()];
    pendingMessages.clear();
    pendingChats.clear();
    refreshPendingCount();
    await syncWithConcurrency(messages, syncMessage);
    await syncWithConcurrency(chats, syncChat);
  } finally {
    retryingPending = false;
  }
}

async function start(): Promise<void> {
  const { state, saveCreds } = await loadMultiFileAuthState(config.authStateDir);
  const sock = makeWASocket({
    auth: state,
    browser: Browsers.macOS("Desktop"),
    syncFullHistory: true,
    shouldSyncHistoryMessage: () => true,
    markOnlineOnConnect: false,
    logger: log.child({ component: "baileys" }),
  });

  sock.ev.on("creds.update", saveCreds);

  if (config.pairingMode && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(config.businessPhoneDigits);
        process.stdout.write(`\nCódigo de pareamento do WhatsApp: ${code}\n`);
        process.stdout.write(
          "No celular: WhatsApp > Aparelhos conectados > Conectar com número de telefone.\n\n",
        );
      } catch (error) {
        log.error({
          event: "pairing_code_failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 3000);
  }

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      const ownPhone = ownPhoneFromSocket(sock);
      if (ownPhone && ownPhone !== config.businessPhoneDigits) {
        stoppedForWrongNumber = true;
        status.connected = false;
        log.fatal({
          event: "wrong_whatsapp_number",
          message: "The paired WhatsApp account is not authorized",
        });
        sock.end(new Error("Wrong WhatsApp business number"));
        return;
      }

      status.connected = true;
      log.info({ event: "whatsapp_connected" });
    }

    if (connection === "close") {
      status.connected = false;
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
        ?.output?.statusCode;
      const shouldReconnect = !stoppedForWrongNumber && statusCode !== DisconnectReason.loggedOut;
      log.warn({ event: "whatsapp_disconnected", statusCode, shouldReconnect });
      if (shouldReconnect) {
        void start().catch((error) =>
          log.error({ event: "reconnect_failed", error: error.message }),
        );
      }
    }
  });

  sock.ev.on("contacts.upsert", (updates: Contact[]) => {
    addContacts(contacts, updates);
    void retryPending();
  });
  sock.ev.on("contacts.update", (updates) => {
    addContacts(contacts, updates as Contact[]);
    void retryPending();
  });
  sock.ev.on("chats.phoneNumberShare", ({ lid, jid }) => {
    const existing = contacts.get(jidNormalizedUser(lid));
    addContacts(contacts, [{ ...(existing || {}), id: lid, lid, jid }]);
    void retryPending();
  });

  sock.ev.on(
    "messaging-history.set",
    async ({ contacts: historyContacts, chats, messages, isLatest, progress }) => {
      addContacts(contacts, historyContacts);

      // Messages contain direction information, so they take precedence. Chats with no
      // message in this history batch are still imported to cover every existing thread.
      const latestByChat = new Map<string, WAMessage>();
      for (const message of messages) {
        const jid = message.key.remoteJid ? jidNormalizedUser(message.key.remoteJid) : null;
        if (!jid) continue;
        const current = latestByChat.get(jid);
        if (!current || messageTimestamp(message) > messageTimestamp(current))
          latestByChat.set(jid, message);
      }

      await syncWithConcurrency([...latestByChat.values()], syncMessage);
      const chatsWithoutMessages = chats.filter(
        (chat) => !latestByChat.has(jidNormalizedUser(chat.id)),
      );
      await syncWithConcurrency(chatsWithoutMessages, syncChat);

      if (isLatest || progress === 100) status.historyComplete = true;
      log.info({
        event: "history_batch_synced",
        chats: chats.length,
        messages: messages.length,
        isLatest: Boolean(isLatest),
        progress: progress ?? null,
        synced: status.synced,
        skipped: status.skipped,
        pending: status.pending,
        failed: status.failed,
      });
    },
  );

  sock.ev.on("messages.upsert", async ({ messages }) => {
    await syncWithConcurrency(messages, syncMessage);
  });
}

startHealthServer(status);
start().catch((error) => {
  log.fatal({
    event: "startup_failed",
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});

process.on("unhandledRejection", (reason) => {
  log.error({
    event: "unhandled_rejection",
    error: reason instanceof Error ? reason.message : String(reason),
  });
});
