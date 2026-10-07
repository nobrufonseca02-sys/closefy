import pino from "pino";
import { config } from "./config.js";

export const log = pino({
  level: config.logLevel,
  redact: {
    paths: ["phone", "remoteJid", "displayName"],
    censor: "[redacted]",
  },
});
