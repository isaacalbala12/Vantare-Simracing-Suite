import { createHash, randomUUID } from "node:crypto";
import { lstat, open, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

function changed() {
  return Object.assign(new Error("calendar destination changed"), {
    code: "VANTARE_ICS_CHANGED",
  });
}
function stamp(stat: Awaited<ReturnType<typeof lstat>>) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(":");
}
// These paths come exclusively from main's native picker. Fingerprints never
// leave main. Stream the contents so a pre-existing file cannot exhaust memory.
export async function calendarFingerprint(
  path: string,
): Promise<string | null> {
  let before: Awaited<ReturnType<typeof lstat>>;
  try {
    before = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!before.isFile() || before.isSymbolicLink())
    throw Object.assign(
      new Error("calendar destination is not a regular file"),
      {
        code: "EINVAL",
      },
    );
  const file = await open(path, "r");
  try {
    if (stamp(await file.stat()) !== stamp(before)) throw changed();
    const hash = createHash("sha256");
    const buffer = Buffer.alloc(64 * 1024);
    for (;;) {
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
    const after = await lstat(path);
    if (
      !after.isFile() ||
      after.isSymbolicLink() ||
      stamp(after) !== stamp(before) ||
      stamp(await file.stat()) !== stamp(before)
    )
      throw changed();
    return `${stamp(after)}:${hash.digest("hex")}`;
  } finally {
    await file.close();
  }
}

export async function replaceCalendar(
  path: string,
  calendar: string,
  expected: string,
  canPublish: () => boolean,
  publish = rename,
  create = open,
) {
  const temporary = join(
    dirname(path),
    `.vantare-calendar-${randomUUID()}.tmp`,
  );
  const file = await create(temporary, "wx");
  try {
    await file.writeFile(calendar, "utf8");
    await file.sync();
    await file.close();
    // Recheck after writing the temporary too: an edit while the confirmation
    // was open, or while preparing publication, requires fresh confirmation.
    if (!canPublish()) throw changed();
    if ((await calendarFingerprint(path)) !== expected) throw changed();
    if (!canPublish()) throw changed();
    await publish(temporary, path);
  } finally {
    await file.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
}
