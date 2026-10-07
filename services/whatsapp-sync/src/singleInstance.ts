import { mkdir, open, readFile, unlink, type FileHandle } from "node:fs/promises";
import path from "node:path";

type LockMetadata = { pid: number; startedAt: string };

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
    if (existing && isProcessAlive(existing.pid)) {
      throw new Error(`Another WhatsApp worker is already running (PID ${existing.pid})`);
    }
    await unlink(lockPath).catch((unlinkError: NodeJS.ErrnoException) => {
      if (unlinkError.code !== "ENOENT") throw unlinkError;
    });
    handle = await createLock(lockPath);
  }

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await handle.close();
    await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  };
}

async function createLock(lockPath: string): Promise<FileHandle> {
  const handle = await open(lockPath, "wx");
  const metadata: LockMetadata = { pid: process.pid, startedAt: new Date().toISOString() };
  await handle.writeFile(JSON.stringify(metadata), "utf8");
  return handle;
}

async function readLock(lockPath: string): Promise<LockMetadata | null> {
  try {
    const parsed = JSON.parse(await readFile(lockPath, "utf8")) as Partial<LockMetadata>;
    return typeof parsed.pid === "number" && parsed.pid > 0
      ? { pid: parsed.pid, startedAt: String(parsed.startedAt || "") }
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
