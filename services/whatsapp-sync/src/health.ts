import http from "node:http";
import { config } from "./config.js";
import { log } from "./logger.js";

export type SyncStatus = {
  connected: boolean;
  historyComplete: boolean;
  synced: number;
  skipped: number;
  pending: number;
  failed: number;
};

export function startHealthServer(status: SyncStatus): void {
  http
    .createServer((req, res) => {
      if (req.url !== "/health") {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(status.connected ? 200 : 503, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ ok: status.connected, service: "closefy-whatsapp-sync", ...status }),
      );
    })
    .listen(config.port, "0.0.0.0", () => {
      log.info({ event: "health_server_listening", port: config.port });
    });
}
