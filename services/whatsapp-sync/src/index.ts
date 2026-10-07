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
import { log } from "./logger.js";
import { acquireSingleInstanceLock } from "./singleInstance.js";
import {
  addContacts,
  addLidMapping,
  extractMessage,
  isOneToOneJid,
  messageTimestamp,
  resolvePeer,
  type ContactDirectory,
} from "./whatsapp.js";
import {
  claimOutboundMessages,
  completeOutboundMessage,
  failOutboundMessage,
  heartbeat,
  syncConversation,
  syncMessage as persistMessage,
  updateMessageDelivery,
} from "./whatsappStore.js";

const contacts: ContactDirectory = new Map();
const pendingMessages = new Map<string, { message: WAMessage; isHistory: boolean }>();
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
let currentSocket: WASocket | null = null;
let outboundPollRunning = false;

function refreshPendingCount(): void {
  status.pending = pendingMessages.size + pendingChats.size;
}

function ownPhoneFromSocket(sock: WASocket): string | null {
  const decoded = jidDecode(sock.user?.id);
  const digits = decoded?.user?.replace(/\D/g, "") || "";
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

async function resolvePeerWithLidMapping(
  remoteJid: string | null | undefined,
  alternateJid?: string | null,
) {
  let peer = resolvePeer(remoteJid, contacts, alternateJid);
  if (peer || !remoteJid || !currentSocket) return peer;

  const normalized = jidNormalizedUser(remoteJid);
  if (!normalized.endsWith("@lid")) return null;
  const phoneJid = await currentSocket.signalRepository.lidMapping.getPNForLID(normalized);
  if (!phoneJid) return null;
  addLidMapping(contacts, normalized, phoneJid);
  peer = resolvePeer(remoteJid, contacts, alternateJid);
  return peer;
}

async function processMessage(message: WAMessage, isHistory = false): Promise<void> {
  const peer = await resolvePeerWithLidMapping(message.key.remoteJid, message.key.remoteJidAlt);
  if (!peer) {
    const jid = message.key.remoteJid ? jidNormalizedUser(message.key.remoteJid) : null;
    if (jid?.endsWith("@lid")) {
      pendingMessages.set(message.key.id || `${jid}:${messageTimestamp(message).getTime()}`, {
        message,
        isHistory,
      });
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

  const extracted = extractMessage(message);
  if (!extracted) {
    status.skipped += 1;
    return;
  }

  try {
    await persistMessage({
      ...peer,
      displayName:
        peer.displayName || (!message.key.fromMe ? message.pushName?.trim() || null : null),
      activityAt: messageTimestamp(message),
      fromMe: Boolean(message.key.fromMe),
      waMessageId: message.key.id || `${peer.remoteJid}:${messageTimestamp(message).getTime()}`,
      content: extracted.content,
      messageType: extracted.type,
      isHistory,
    });
    status.synced += 1;
  } catch (error) {
    status.failed += 1;
    log.error({
      event: "message_sync_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function processChat(chat: Chat): Promise<void> {
  if (!chat.id) {
    status.skipped += 1;
    return;
  }
  const peer = await resolvePeerWithLidMapping(chat.id);
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
  const activityAt = rawTimestamp > 0 ? new Date(rawTimestamp * 1000) : new Date();
  try {
    await syncConversation({ ...peer, activityAt, fromMe: true });
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
    await syncWithConcurrency(messages, ({ message, isHistory }) =>
      processMessage(message, isHistory),
    );
    await syncWithConcurrency(chats, processChat);
  } finally {
    retryingPending = false;
  }
}

async function start(): Promise<void> {
  const { state, saveCreds } = await loadMultiFileAuthState(config.authStateDir);
  const sock = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu("Chrome"),
    syncFullHistory: true,
    shouldSyncHistoryMessage: () => true,
    markOnlineOnConnect: false,
    emitOwnEvents: false,
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
      currentSocket = sock;
      log.info({ event: "whatsapp_connected" });
      void heartbeat(true, status.historyComplete).catch((error) =>
        log.error({ event: "heartbeat_failed", error: error.message }),
      );
    }

    if (connection === "close") {
      status.connected = false;
      if (currentSocket === sock) currentSocket = null;
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
        ?.output?.statusCode;
      const shouldReconnect = !stoppedForWrongNumber && statusCode !== DisconnectReason.loggedOut;
      log.warn({ event: "whatsapp_disconnected", statusCode, shouldReconnect });
      void heartbeat(false, status.historyComplete).catch((error) =>
        log.error({ event: "heartbeat_failed", error: error.message }),
      );
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
  sock.ev.on("lid-mapping.update", ({ lid, pn }) => {
    addLidMapping(contacts, lid, pn);
    void retryPending();
  });

  sock.ev.on(
    "messaging-history.set",
    async ({ contacts: historyContacts, chats, messages, lidPnMappings, isLatest, progress }) => {
      addContacts(contacts, historyContacts);
      for (const mapping of lidPnMappings || []) {
        addLidMapping(contacts, mapping.lid, mapping.pn);
      }

      const sortedMessages = [...messages].sort(
        (a, b) => messageTimestamp(a).getTime() - messageTimestamp(b).getTime(),
      );
      await syncWithConcurrency(sortedMessages, (message) => processMessage(message, true));

      const chatsWithMessages = new Set(
        messages
          .map((message) => message.key.remoteJid)
          .filter((jid): jid is string => typeof jid === "string" && jid.length > 0)
          .map(jidNormalizedUser),
      );
      const chatsWithoutMessages = chats.filter(
        (chat) => chat.id && !chatsWithMessages.has(jidNormalizedUser(chat.id)),
      );
      await syncWithConcurrency(chatsWithoutMessages, processChat);
      await retryPending();

      if (isLatest || progress === 100) status.historyComplete = true;
      if (status.historyComplete) {
        void heartbeat(status.connected, true).catch((error) =>
          log.error({ event: "heartbeat_failed", error: error.message }),
        );
      }
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
    await syncWithConcurrency(messages, (message) => processMessage(message, false));
  });

  sock.ev.on("message-receipt.update", async (updates) => {
    await syncWithConcurrency(updates, async ({ key, receipt }) => {
      if (!key.id || !key.fromMe) return;
      const deliveryStatus = receipt.readTimestamp
        ? "read"
        : receipt.receiptTimestamp || receipt.deliveredDeviceJid?.length
          ? "delivered"
          : null;
      if (deliveryStatus) await updateMessageDelivery(key.id, deliveryStatus);
    });
  });
}

async function pollOutboundMessages(): Promise<void> {
  if (outboundPollRunning || !currentSocket || !status.connected) return;
  outboundPollRunning = true;
  try {
    const socket = currentSocket;
    const messages = await claimOutboundMessages(10);
    for (const message of messages) {
      try {
        const sent = await socket.sendMessage(message.remote_jid, { text: message.content });
        if (!sent?.key.id) throw new Error("WhatsApp did not return a message ID");
        await completeOutboundMessage(message.outbound_id, sent.key.id, messageTimestamp(sent));
        status.synced += 1;
      } catch (error) {
        status.failed += 1;
        const reason = error instanceof Error ? error.message : String(error);
        await failOutboundMessage(message.outbound_id, reason).catch((storeError) =>
          log.error({ event: "outbound_failure_persist_failed", error: storeError.message }),
        );
        log.error({ event: "outbound_message_failed", error: reason });
      }
    }
  } catch (error) {
    log.error({
      event: "outbound_poll_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    outboundPollRunning = false;
  }
}

async function main(): Promise<void> {
  const releaseLock = await acquireSingleInstanceLock(config.authStateDir);
  const shutdown = async () => {
    await releaseLock().catch((error) =>
      log.error({ event: "worker_lock_release_failed", error: error.message }),
    );
  };
  const handleSignal = async () => {
    await shutdown();
    process.exit(0);
  };
  process.once("SIGINT", () => void handleSignal());
  process.once("SIGTERM", () => void handleSignal());
  process.once("beforeExit", () => void shutdown());

  startHealthServer(status);
  setInterval(() => void pollOutboundMessages(), 1200);
  setInterval(() => {
    void heartbeat(status.connected, status.historyComplete).catch((error) =>
      log.error({ event: "heartbeat_failed", error: error.message }),
    );
  }, 30_000);
  await start();
}

main().catch((error) => {
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
