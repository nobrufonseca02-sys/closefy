import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acquireSingleInstanceLock } from "./singleInstance.js";

test("prevents two workers from using the same auth directory", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "closefy-whatsapp-lock-"));
  context.after(() => rm(directory, { recursive: true, force: true }));

  const releaseFirst = await acquireSingleInstanceLock(directory);
  await assert.rejects(
    acquireSingleInstanceLock(directory),
    /Another WhatsApp worker is already running/,
  );
  await releaseFirst();

  const releaseSecond = await acquireSingleInstanceLock(directory);
  await releaseSecond();
});
