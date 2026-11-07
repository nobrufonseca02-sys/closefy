import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidDecode,
  jidNormalizedUser,
  useMultiFileAuthState as loadMultiFileAuthState,
  type Chat,
  type Contact,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { config } from "./config.js";
import { startHealthServer, type SessionHealth } from "./health.js";
import { log as rootLog } from "./logger.js";
import { toWhatsAppVoice } from "./audioConvert.js";
import { acquireSingleInstanceLock } from "./singleInstance.js";
import {
  addContacts,
  addLidMapping,
  downloadAudioBuffer,
  extractMessage,
  isOneToOneJid,
  messageTimestamp,
  resolvePeer,
  type ContactDirectory,
} from "./whatsapp.js";
import {
  createSessionStore,
  downloadOutboundAudio,
  leaseSessions,
  uploadAudioMedia,
  type LeasedSession,
  type SessionStore,
} from "./whatsappStore.js";

const HEARTBEAT_INTERVAL_MS = 30_000;
const OUTBOUND_POLL_INTERVAL_MS = 1_200;

// ---------------------------------------------------------------------------
// One SessionWorker = one tenant's WhatsApp connection: its own Baileys
// socket, its own auth_state folder, its own contact directory and its own
// sync counters. Everything that used to be module-level global state in the
// single-tenant version now lives on the instance so N of these can run
// side by side in one process.
// ---------------------------------------------------------------------------
class SessionWorker {
  readonly sessionId: string;
  readonly userId: string;
  readonly authStateDir: string;
  private readonly legacyAuth: boolean;
  private readonly store: SessionStore;
  private readonly log: typeof rootLog;

  private contacts: ContactDirectory = new Map();
  private pendingMessages = new Map<string, { message: WAMessage; isHistory: boolean }>();
  private pendingChats = new Map<string, Chat>();
  health: SessionHealth;

  private socket: WASocket | null = null;
  private ownPhoneDigits: string | null = null;
  private stopping = false;
  private retryingPending = false;
  private outboundPollRunning = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private outboundTimer: NodeJS.Timeout | null = null;
  private releaseLock: (() => Promise<void>) | null = null;

  constructor(session: LeasedSession) {
    this.sessionId = session.id;
    this.userId = session.user_id;
    this.legacyAuth = session.legacy_auth;
    this.authStateDir = path.join(config.authStateRoot, session.id);
    this.store = createSessionStore(session.id);
    this.log = rootLog.child({ sessionId: session.id, userId: session.user_id });
    this.health = {
      sessionId: session.id,
      userId: session.user_id,
      businessPhone: session.business_phone,
      connected: false,
      historyComplete: false,
      synced: 0,
      skipped: 0,
      pending: 0,
      failed: 0,
    };
  }

  private refreshPendingCount(): void {
    this.health.pending = this.pendingMessages.size + this.pendingChats.size;
  }

  private ownPhoneFromSocket(sock: WASocket): string | null {
    const decoded = jidDecode(sock.user?.id);
    const digits = decoded?.user?.replace(/\D/g, "") || "";
    return digits.length >= 10 && digits.length <= 15 ? digits : null;
  }

  private async resolvePeerWithLidMapping(
    remoteJid: string | null | undefined,
    alternateJid?: string | null,
  ) {
    let peer = resolvePeer(remoteJid, this.contacts, alternateJid);
    if (peer || !remoteJid || !this.socket) return peer;

    const normalized = jidNormalizedUser(remoteJid);
    if (!normalized.endsWith("@lid")) return null;
    const phoneJid = await this.socket.signalRepository.lidMapping.getPNForLID(normalized);
    if (!phoneJid) return null;
    addLidMapping(this.contacts, normalized, phoneJid);
    peer = resolvePeer(remoteJid, this.contacts, alternateJid);
    return peer;
  }

  private async processMessage(message: WAMessage, isHistory = false): Promise<void> {
    const peer = await this.resolvePeerWithLidMapping(message.key.remoteJid, message.key.remoteJidAlt);
    if (!peer) {
      const jid = message.key.remoteJid ? jidNormalizedUser(message.key.remoteJid) : null;
      if (jid?.endsWith("@lid")) {
        this.pendingMessages.set(message.key.id || `${jid}:${messageTimestamp(message).getTime()}`, {
          message,
          isHistory,
        });
        this.refreshPendingCount();
      } else {
        this.health.skipped += 1;
      }
      return;
    }
    if (peer.phone.replace(/\D/g, "") === this.ownPhoneDigits) {
      this.health.skipped += 1;
      return;
    }

    const extracted = extractMessage(message);
    if (!extracted) {
      this.health.skipped += 1;
      return;
    }

    const waMessageId = message.key.id || `${peer.remoteJid}:${messageTimestamp(message).getTime()}`;
    let mediaPath: string | null = null;
    if (extracted.type === "audio" && this.socket) {
      try {
        const downloaded = await downloadAudioBuffer(
          message,
          this.socket,
          this.log.child({ component: "baileys-media" }),
        );
        if (downloaded) {
          mediaPath = await uploadAudioMedia(waMessageId, downloaded.buffer, downloaded.mimetype);
        }
      } catch (error) {
        this.log.error({
          event: "audio_media_failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    try {
      await this.store.syncMessage({
        ...peer,
        displayName:
          peer.displayName || (!message.key.fromMe ? message.pushName?.trim() || null : null),
        activityAt: messageTimestamp(message),
        fromMe: Boolean(message.key.fromMe),
        waMessageId,
        content: extracted.content,
        messageType: extracted.type,
        isHistory,
        mediaPath,
      });
      this.health.synced += 1;
    } catch (error) {
      this.health.failed += 1;
      this.log.error({
        event: "message_sync_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async processChat(chat: Chat): Promise<void> {
    if (!chat.id) {
      this.health.skipped += 1;
      return;
    }
    const peer = await this.resolvePeerWithLidMapping(chat.id);
    if (!peer) {
      if (isOneToOneJid(chat.id) && jidNormalizedUser(chat.id).endsWith("@lid")) {
        this.pendingChats.set(jidNormalizedUser(chat.id), chat);
        this.refreshPendingCount();
      } else {
        this.health.skipped += 1;
      }
      return;
    }
    if (peer.phone.replace(/\D/g, "") === this.ownPhoneDigits) {
      this.health.skipped += 1;
      return;
    }

    const rawTimestamp = Number(chat.conversationTimestamp || chat.lastMessageRecvTimestamp || 0);
    const activityAt = rawTimestamp > 0 ? new Date(rawTimestamp * 1000) : new Date();
    try {
      await this.store.syncConversation({ ...peer, activityAt, fromMe: true });
      this.health.synced += 1;
    } catch (error) {
      this.health.failed += 1;
      this.log.error({
        event: "chat_sync_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async syncWithConcurrency<T>(
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

  private async retryPending(): Promise<void> {
    if (this.retryingPending || (!this.pendingMessages.size && !this.pendingChats.size)) return;
    this.retryingPending = true;
    try {
      const messages = [...this.pendingMessages.values()];
      const chats = [...this.pendingChats.values()];
      this.pendingMessages.clear();
      this.pendingChats.clear();
      this.refreshPendingCount();
      await this.syncWithConcurrency(messages, ({ message, isHistory }) =>
        this.processMessage(message, isHistory),
      );
      await this.syncWithConcurrency(chats, (chat) => this.processChat(chat));
    } finally {
      this.retryingPending = false;
    }
  }

  private async pollOutboundMessages(): Promise<void> {
    if (this.outboundPollRunning || !this.socket || !this.health.connected) return;
    this.outboundPollRunning = true;
    try {
      const socket = this.socket;
      const messages = await this.store.claimOutboundMessages(10);
      for (const message of messages) {
        try {
          const sent =
            message.message_type === "audio" && message.media_path
              ? await (async () => {
                  const raw = await downloadOutboundAudio(message.media_path!);
                  const { buffer, mimetype } = await toWhatsAppVoice(raw.buffer, raw.mimetype);
                  return socket.sendMessage(message.remote_jid, { audio: buffer, mimetype, ptt: true });
                })()
              : await socket.sendMessage(message.remote_jid, { text: message.content });
          if (!sent?.key.id) throw new Error("WhatsApp did not return a message ID");
          await this.store.completeOutboundMessage(message.outbound_id, sent.key.id, messageTimestamp(sent));
          this.health.synced += 1;
        } catch (error) {
          this.health.failed += 1;
          const reason = error instanceof Error ? error.message : String(error);
          await this.store
            .failOutboundMessage(message.outbound_id, reason)
            .catch((storeError) =>
              this.log.error({ event: "outbound_failure_persist_failed", error: storeError.message }),
            );
          this.log.error({ event: "outbound_message_failed", error: reason });
        }
      }
    } catch (error) {
      this.log.error({
        event: "outbound_poll_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.outboundPollRunning = false;
    }
  }

  private async heartbeat(): Promise<void> {
    if (!this.health.connected || !this.ownPhoneDigits) return;
    try {
      await this.store.reportStatus({
        status: "connected",
        businessPhone: `+${this.ownPhoneDigits}`,
        historyComplete: this.health.historyComplete,
      });
    } catch (error) {
      this.log.error({
        event: "heartbeat_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async connect(): Promise<void> {
    if (this.stopping) return;
    await mkdir(this.authStateDir, { recursive: true });
    await migrateLegacyAuthState(this.authStateDir, this.legacyAuth, this.log);

    const { state, saveCreds } = await loadMultiFileAuthState(this.authStateDir);

    // Baileys ships a hardcoded WA Web protocol version that goes stale
    // between releases; always ask for the live one instead of trusting it.
    let version: [number, number, number] | undefined;
    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest.version;
    } catch (error) {
      this.log.warn({
        event: "baileys_version_fetch_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const sock = makeWASocket({
      auth: state,
      version,
      browser: Browsers.ubuntu("Chrome"),
      syncFullHistory: true,
      shouldSyncHistoryMessage: () => true,
      markOnlineOnConnect: false,
      emitOwnEvents: false,
      logger: this.log.child({ component: "baileys" }),
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
      if (this.stopping) return;

      if (qr) {
        void QRCode.toDataURL(qr, { width: 512 })
          .then((qrDataUrl) => this.store.reportStatus({ status: "pairing", qrDataUrl }))
          .catch((error) =>
            this.log.error({
              event: "qr_report_failed",
              error: error instanceof Error ? error.message : String(error),
            }),
          );
      }

      if (connection === "open") {
        this.ownPhoneDigits = this.ownPhoneFromSocket(sock);
        this.socket = sock;
        this.health.connected = true;
        if (this.ownPhoneDigits) this.health.businessPhone = `+${this.ownPhoneDigits}`;
        this.log.info({ event: "whatsapp_connected", businessPhone: this.health.businessPhone });
        if (this.ownPhoneDigits) {
          void this.store
            .reportStatus({
              status: "connected",
              businessPhone: `+${this.ownPhoneDigits}`,
              historyComplete: this.health.historyComplete,
            })
            .catch((error) => this.log.error({ event: "status_report_failed", error: error.message }));
        }
      }

      if (connection === "close") {
        this.health.connected = false;
        if (this.socket === sock) this.socket = null;
        const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
          ?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        this.log.warn({ event: "whatsapp_disconnected", statusCode, stopping: this.stopping });

        if (loggedOut) {
          void this.store
            .reportStatus({
              status: "error",
              errorMessage: "Sessão desconectada pelo WhatsApp. Pareie novamente.",
            })
            .catch(() => undefined);
          return;
        }
        if (!this.stopping) {
          void this.connect().catch((error) =>
            this.log.error({
              event: "reconnect_failed",
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      }
    });

    sock.ev.on("contacts.upsert", (updates: Contact[]) => {
      addContacts(this.contacts, updates);
      void this.retryPending();
    });
    sock.ev.on("contacts.update", (updates) => {
      addContacts(this.contacts, updates as Contact[]);
      void this.retryPending();
    });
    sock.ev.on("lid-mapping.update", ({ lid, pn }) => {
      addLidMapping(this.contacts, lid, pn);
      void this.retryPending();
    });

    sock.ev.on(
      "messaging-history.set",
      async ({ contacts: historyContacts, chats, messages, lidPnMappings, isLatest, progress }) => {
        addContacts(this.contacts, historyContacts);
        for (const mapping of lidPnMappings || []) addLidMapping(this.contacts, mapping.lid, mapping.pn);

        const sortedMessages = [...messages].sort(
          (a, b) => messageTimestamp(a).getTime() - messageTimestamp(b).getTime(),
        );
        await this.syncWithConcurrency(sortedMessages, (message) => this.processMessage(message, true));

        const chatsWithMessages = new Set(
          messages
            .map((message) => message.key.remoteJid)
            .filter((jid): jid is string => typeof jid === "string" && jid.length > 0)
            .map(jidNormalizedUser),
        );
        const chatsWithoutMessages = chats.filter(
          (chat) => chat.id && !chatsWithMessages.has(jidNormalizedUser(chat.id)),
        );
        await this.syncWithConcurrency(chatsWithoutMessages, (chat) => this.processChat(chat));
        await this.retryPending();

        if (isLatest || progress === 100) this.health.historyComplete = true;
        this.log.info({
          event: "history_batch_synced",
          chats: chats.length,
          messages: messages.length,
          isLatest: Boolean(isLatest),
          progress: progress ?? null,
          ...this.health,
        });
      },
    );

    sock.ev.on("messages.upsert", async ({ messages }) => {
      await this.syncWithConcurrency(messages, (message) => this.processMessage(message, false));
    });

    sock.ev.on("message-receipt.update", async (updates) => {
      await this.syncWithConcurrency(updates, async ({ key, receipt }) => {
        if (!key.id || !key.fromMe) return;
        const deliveryStatus = receipt.readTimestamp
          ? "read"
          : receipt.receiptTimestamp || receipt.deliveredDeviceJid?.length
            ? "delivered"
            : null;
        if (deliveryStatus) await this.store.updateMessageDelivery(key.id, deliveryStatus);
      });
    });
  }

  async start(): Promise<void> {
    this.releaseLock = await acquireSingleInstanceLock(this.authStateDir);
    this.heartbeatTimer = setInterval(() => void this.heartbeat(), HEARTBEAT_INTERVAL_MS);
    this.outboundTimer = setInterval(() => void this.pollOutboundMessages(), OUTBOUND_POLL_INTERVAL_MS);
    await this.connect();
  }

  /** Soft stop: closes the socket and keeps local creds so a future
   * `desired_state=connected` can reconnect without a fresh QR, unless the
   * caller asks for a real logout (user-initiated disconnect). */
  async stop(options: { logout: boolean }): Promise<void> {
    this.stopping = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.outboundTimer) clearInterval(this.outboundTimer);
    try {
      if (options.logout) await this.socket?.logout();
      else this.socket?.end(undefined);
    } catch (error) {
      this.log.warn({
        event: "session_close_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    this.socket = null;
    this.health.connected = false;
    if (options.logout) {
      await this.store
        .reportStatus({ status: "disconnected" })
        .catch((error) => this.log.error({ event: "status_report_failed", error: error.message }));
    }
    await this.releaseLock?.().catch((error) =>
      this.log.error({ event: "lock_release_failed", error: error.message }),
    );
  }
}

/**
 * One-time carry-over for the account that ran this worker before it was
 * multi-tenant: the old flat `authStateRoot/creds.json` layout becomes this
 * session's own subfolder, so the existing pairing survives the upgrade
 * instead of forcing a QR rescan on the account that was already connected.
 */
async function migrateLegacyAuthState(
  sessionDir: string,
  legacyAuth: boolean,
  log: typeof rootLog,
): Promise<void> {
  if (!legacyAuth) return;
  const alreadyMigrated = await stat(path.join(sessionDir, "creds.json")).catch(() => null);
  if (alreadyMigrated) return;
  const legacyCreds = await stat(path.join(config.authStateRoot, "creds.json")).catch(() => null);
  if (!legacyCreds) return;

  log.info({ event: "legacy_auth_state_migration_start", from: config.authStateRoot, to: sessionDir });
  const entries = await readdir(config.authStateRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue; // session subfolders (already-migrated sessions) are left alone
    await rename(path.join(config.authStateRoot, entry.name), path.join(sessionDir, entry.name));
  }
  log.info({ event: "legacy_auth_state_migration_done" });
}

// ---------------------------------------------------------------------------
// Manager: periodically asks the database which sessions this worker holds
// the lease for right now, and starts/stops SessionWorkers to match.
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const sessions = new Map<string, SessionWorker>();
  const healthMap = new Map<string, SessionHealth>();
  startHealthServer(healthMap);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await Promise.all([...sessions.values()].map((worker) => worker.stop({ logout: false })));
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  const tick = async () => {
    let leased: LeasedSession[];
    try {
      leased = await leaseSessions();
    } catch (error) {
      rootLog.error({
        event: "lease_poll_failed",
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const wanted = new Map(leased.map((session) => [session.id, session]));

    for (const [sessionId, worker] of sessions) {
      const stillWanted = wanted.get(sessionId);
      if (!stillWanted || stillWanted.desired_state === "disconnected") {
        sessions.delete(sessionId);
        healthMap.delete(sessionId);
        const logout = stillWanted?.desired_state === "disconnected";
        void worker
          .stop({ logout })
          .catch((error) => rootLog.error({ event: "session_stop_failed", sessionId, error: error.message }));
      }
    }

    for (const session of leased) {
      if (session.desired_state !== "connected" || sessions.has(session.id)) continue;
      const worker = new SessionWorker(session);
      sessions.set(session.id, worker);
      healthMap.set(session.id, worker.health);
      worker.start().catch((error) => {
        rootLog.error({
          event: "session_start_failed",
          sessionId: session.id,
          error: error instanceof Error ? error.message : String(error),
        });
        sessions.delete(session.id);
        healthMap.delete(session.id);
      });
    }
  };

  await tick();
  setInterval(() => void tick(), config.leasePollIntervalMs);
}

main().catch((error) => {
  rootLog.fatal({
    event: "startup_failed",
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});

process.on("unhandledRejection", (reason) => {
  rootLog.error({
    event: "unhandled_rejection",
    error: reason instanceof Error ? reason.message : String(reason),
  });
});
