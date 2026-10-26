import { spawn } from "node:child_process";

// WhatsApp only plays voice notes (ptt) encoded as OGG/Opus. Browsers
// (Chrome/Edge) record WebM, so transcode anything that isn't already OGG.
export async function toWhatsAppVoice(
  buffer: Buffer,
  mimetype: string,
): Promise<{ buffer: Buffer; mimetype: string }> {
  if (mimetype.toLowerCase().startsWith("audio/ogg")) {
    return { buffer, mimetype: "audio/ogg; codecs=opus" };
  }
  const out = await new Promise<Buffer>((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-i", "pipe:0",
      "-vn", "-ac", "1", "-ar", "48000",
      "-c:a", "libopus", "-b:a", "32k",
      "-f", "ogg", "pipe:1",
    ]);
    const chunks: Buffer[] = [];
    let err = "";
    ff.stdout.on("data", (c: Buffer) => chunks.push(c));
    ff.stderr.on("data", (c: Buffer) => (err += c.toString()));
    ff.on("error", (e) => reject(new Error(`ffmpeg not available: ${e.message}`)));
    ff.on("close", (code) =>
      code === 0 && chunks.length
        ? resolve(Buffer.concat(chunks))
        : reject(new Error(`ffmpeg failed (${code}): ${err.slice(0, 300)}`)),
    );
    ff.stdin.on("error", () => {});
    ff.stdin.end(buffer);
  });
  return { buffer: out, mimetype: "audio/ogg; codecs=opus" };
}
