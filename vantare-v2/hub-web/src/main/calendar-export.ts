import { createHash, randomUUID } from "node:crypto";
import { link, open, unlink } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join } from "node:path";
import {
  type CalendarIcsStatus,
  calendarIcsLimit,
  type HostError,
  type HostToUi,
} from "../contract/generated/contract";

// Called only with a path returned by main's own native dialog. Never an IPC argument.
export async function saveCalendar(
  path: string,
  calendar: string,
  publish = link,
) {
  if (
    !isAbsolute(path) ||
    path.startsWith("\\\\") ||
    path.startsWith("//") ||
    extname(path).toLowerCase() !== ".ics" ||
    Buffer.byteLength(calendar, "utf8") > calendarIcsLimit
  )
    throw new Error("invalid local calendar destination");
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.tmp`,
  );
  const file = await open(temporary, "wx");
  try {
    await file.writeFile(calendar, "utf8");
    await file.sync();
    await file.close();
    // Exclusive publication: an existing destination, including a symlink, wins.
    try {
      await publish(temporary, path);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EEXIST"
      )
        throw error;
      // exFAT/FAT32 and some cloud providers cannot create hard links.
      // O_EXCL still refuses any existing destination, including a symlink.
      const destination = await open(path, "wx");
      try {
        await destination.writeFile(calendar, "utf8");
        await destination.sync();
      } finally {
        await destination.close();
      }
    }
  } finally {
    await file.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
}

type Outcome = { status: CalendarIcsStatus } | { error: HostError };
export function calendarExportSession(
  pick: () => Promise<string | undefined>,
  save = saveCalendar,
) {
  let expected: number | undefined;
  let prepared: { calendar: string; hash: string } | undefined;
  let alive = true;
  let busy = false;
  return {
    expect(id: number) {
      if (!alive || busy) return false;
      expected = id;
      prepared = undefined;
      return true;
    },
    observe(message: HostToUi): HostToUi {
      if (
        (message.kind !== "failure" && message.kind !== "response") ||
        message.id !== expected
      )
        return message;
      expected = undefined;
      if (
        message.kind === "response" &&
        message.result.method === "calendar.icsPrepare"
      ) {
        const calendar = message.result.value.calendar;
        const hash = createHash("sha256")
          .update(calendar, "utf8")
          .digest("hex");
        prepared = { calendar, hash };
        return {
          ...message,
          result: {
            ...message.result,
            value: { ...message.result.value, preparedHash: hash },
          },
        };
      }
      return message;
    },
    close() {
      alive = false;
      prepared = undefined;
      expected = undefined;
    },
    async export(preparedHash: string): Promise<Outcome> {
      if (busy) return { error: { kind: "busy" } };
      if (!alive || prepared === undefined || prepared.hash !== preparedHash)
        return { error: { kind: "rejected" } };
      const snapshot = prepared;
      prepared = undefined;
      busy = true;
      try {
        const path = await pick();
        if (!alive || path === undefined) return { status: "cancelled" };
        await save(path, snapshot.calendar);
        return { status: "saved" };
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "EEXIST"
        )
          return { status: "conflict" };
        return { error: { kind: "io" } };
      } finally {
        busy = false;
      }
    },
  };
}
