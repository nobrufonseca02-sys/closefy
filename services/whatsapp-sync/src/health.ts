import http from "node:http";
import { config } from "./config.js";
import { log } from "./logger.js";

export type SessionHealth = {
  sessionId: string;
  userId: string;
  businessPhone: string | null;
  connected: boolean;
  historyComplete: boolean;
  synced: number;
  skipped: number;
  pending: number;
  failed: number;
};

/** `sessions` is a live Map the caller keeps mutating; each response reads
 * its current contents, no snapshot needed. */
export function startHealthServer(sessions: Map<string, SessionHealth>): void {
  http
    .createServer((req, res) => {
      if (req.url !== "/health") {
        res.writeHead(404).end();
        return;
      }
      const list = [...sessions.values()];
      const anyConnected = list.some((session) => session.connected);
      res.writeHead(anyConnected ? 200 : 503, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: anyConnected,
          service: "closefy-whatsapp-sync",
          sessionCount: list.length,
          sessions: list,
        }),
      );
    })
    .listen(config.port, "0.0.0.0", () => {
      log.info({ event: "health_server_listening", port: config.port });
    });
}
