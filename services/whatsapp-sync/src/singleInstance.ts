import { mkdir, open, readFile, unlink, type FileHandle } from "node:fs/promises";
import path from "node:path";

type LockMetadata = { pid: number; startedAt: string; updatedAt: string };

// How often a healthy worker rewrites its own lock timestamp, and how old a
// timestamp has to be before a *different* process is allowed to steal the
// lock even though the recorded PID still looks alive. This recovers from a
// Windows sleep/resume leaving an orphaned lock behind (the process that
// wrote it stopped touching the file, but Windows still reuses or reports
// the PID as present) without waiting for someone to delete the file by hand.
const TOUCH_INTERVAL_MS = 20_000;
const STALE_AFTER_MS = 90_000;

export async function acquireSingleInstanceLock(
  authStateDir: string,
): Promise<() => Promise<void>> {
  await mkdir(authStateDir, { recursive: true });
  const lockPath = path.join(authStateDir, ".worker.lock");
  let handle: FileHandle;

  try {
    handle = await createLock(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await readLock(lockPath);
    if (existing && isProcessAlive(existing.pid) && !isStale(existing)) {
      throw new Error(`Another WhatsApp worker is already running (PID ${existing.pid})`);
    }
    await unlink(lockPath).catch((unlinkError: NodeJS.ErrnoException) => {
      if (unlinkError.code !== "ENOENT") throw unlinkError;
    });
    handle = await createLock(lockPath);
  }

  const touchTimer = setInterval(() => void touchLock(handle), TOUCH_INTERVAL_MS);
  touchTimer.unref();

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    clearInterval(touchTimer);
    await handle.close();
    await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  };
}

function isStale(lock: LockMetadata): boolean {
  const updatedAt = Date.parse(lock.updatedAt);
  if (Number.isNaN(updatedAt)) return true;
  return Date.now() - updatedAt > STALE_AFTER_MS;
}

async function writeMetadata(handle: FileHandle, metadata: LockMetadata): Promise<void> {
  await handle.truncate(0);
  await handle.write(JSON.stringify(metadata), 0, "utf8");
}

async function touchLock(handle: FileHandle): Promise<void> {
  try {
    await writeMetadata(handle, {
      pid: process.pid,
      startedAt: "",
      updatedAt: new Date().toISOString(),
    });
  } catch {
    // Best-effort: a failed touch just means the next lock check may treat
    // this instance as stale slightly sooner than STALE_AFTER_MS.
  }
}

async function createLock(lockPath: string): Promise<FileHandle> {
  const handle = await open(lockPath, "wx");
  const now = new Date().toISOString();
  const metadata: LockMetadata = { pid: process.pid, startedAt: now, updatedAt: now };
  await handle.writeFile(JSON.stringify(metadata), "utf8");
  return handle;
}

async function readLock(lockPath: string): Promise<LockMetadata | null> {
  try {
    const parsed = JSON.parse(await readFile(lockPath, "utf8")) as Partial<LockMetadata>;
    return typeof parsed.pid === "number" && parsed.pid > 0
      ? {
          pid: parsed.pid,
          startedAt: String(parsed.startedAt || ""),
          updatedAt: String(parsed.updatedAt || parsed.startedAt || ""),
        }
      : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
