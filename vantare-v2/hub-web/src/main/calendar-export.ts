import { createHash, randomBytes, randomUUID } from "node:crypto";
import { link, open, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, win32 } from "node:path";
import {
  type CalendarIcsStatus,
  calendarIcsConfirmationMaxAgeMs,
  calendarIcsLimit,
  calendarIcsPreparedMaxAgeMs,
  type HostError,
  type HostToUi,
} from "../contract/generated/contract";

import {
  calendarFingerprint,
  replaceCalendar,
} from "./calendar-replacement-file";

// Only called with main's own native dialog result; never a renderer path.
function destinationPath(path: string) {
  const absolute =
    /^[a-z]:[\\/]/iu.test(path) ||
    (process.platform !== "win32" && isAbsolute(path));
  const name = win32.basename(path);
  if (
    !absolute ||
    path.startsWith("\\\\") ||
    path.startsWith("//") ||
    path.length > 32767 ||
    /[<>"|?*]/u.test(path) ||
    [...path].some((char) => char.charCodeAt(0) < 32) ||
    path.indexOf(":", 2) !== -1 ||
    /[\\/ .]$/u.test(path) ||
    !name ||
    /^(CON|PRN|AUX|NUL|COM\d|LPT\d)(\.|$)/iu.test(
      name
        .split(".")
        .map((part) => part.trimEnd())
        .join("."),
    )
  )
    throw Object.assign(new Error("invalid local calendar destination"), {
      code: "EINVAL",
    });
  const extension = win32.extname(path);
  if (extension && extension.toLowerCase() !== ".ics")
    throw Object.assign(new Error("calendar extension required"), {
      code: "VANTARE_ICS_EXTENSION",
    });
  return extension ? path : `${path}.ics`;
}
export async function saveCalendar(
  path: string,
  calendar: string,
  publish = link,
  createDestination: (path: string) => ReturnType<typeof open> = (path) =>
    open(path, "wx"),
) {
  path = destinationPath(path);
  if (Buffer.byteLength(calendar, "utf8") > calendarIcsLimit)
    throw Object.assign(new Error("local calendar too large"), {
      code: "EFBIG",
    });
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.tmp`,
  );
  const file = await open(temporary, "wx");
  try {
    await file.writeFile(calendar, "utf8");
    await file.sync();
    await file.close();
    try {
      await publish(temporary, path);
    } catch (error) {
      if (code(error) === "EEXIST") throw error;
      // Exclusive fallback for filesystems without hard links. Only remove a
      // destination that we successfully created, never an EEXIST winner.
      const destination = await createDestination(path);
      try {
        await destination.writeFile(calendar, "utf8");
        await destination.sync();
        await destination.close();
      } catch (error) {
        await destination.close().catch(() => {});
        await unlink(path).catch(() => {});
        throw error;
      }
    }
  } finally {
    await file.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
}
function code(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? error.code
    : undefined;
}
type Outcome =
  | { status: Exclude<CalendarIcsStatus, "replacementRequired"> }
  | { status: "replacementRequired"; confirmationId: string }
  | { error: HostError };
export function calendarExportSession(
  pick: () => Promise<string | undefined>,
  save = saveCalendar,
  now = Date.now,
  fingerprint = calendarFingerprint,
  replaceFile = replaceCalendar,
) {
  let expected: number | undefined;
  let prepared:
    | { calendar: string; hash: string; preparedAt: number; validUntil: number }
    | undefined;
  let replacement:
    | {
        id: string;
        path: string;
        calendar: string;
        fingerprint: string;
        issuedAt: number;
      }
    | undefined;
  let alive = true;
  const validConfirmation = (issuedAt: number) =>
    alive &&
    Number.isFinite(now()) &&
    now() >= issuedAt &&
    now() - issuedAt < calendarIcsConfirmationMaxAgeMs;
  async function ask(path: string, calendar: string): Promise<Outcome> {
    const value = await fingerprint(path);
    if (!alive) return { status: "cancelled" };
    // A removed destination must not turn a replace confirmation into an
    // unconfirmed create. Prepare again through the native picker instead.
    if (value === null) return { error: { kind: "rejected" } };
    const id = randomBytes(32).toString("hex");
    replacement = { id, path, calendar, fingerprint: value, issuedAt: now() };
    return { status: "replacementRequired", confirmationId: id };
  }
  let busy = false;
  return {
    expect(id: number) {
      if (!alive || busy) return false;
      replacement = undefined;
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
        prepared = {
          calendar,
          hash,
          preparedAt: now(),
          validUntil: Date.parse(message.result.value.validUntil),
        };
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
      replacement = undefined;
      prepared = undefined;
      expected = undefined;
    },
    async replace(confirmationId: string, replace: boolean): Promise<Outcome> {
      if (busy) return { error: { kind: "busy" } };
      const pending = replacement;
      if (
        !pending ||
        pending.id !== confirmationId ||
        !validConfirmation(pending.issuedAt)
      ) {
        if (pending?.id === confirmationId) replacement = undefined;
        return { error: { kind: "rejected" } };
      }
      replacement = undefined; // Single use, including cancel and failures.
      if (!replace) return { status: "cancelled" };
      busy = true;
      try {
        if ((await fingerprint(pending.path)) !== pending.fingerprint)
          return await ask(pending.path, pending.calendar);
        await replaceFile(
          pending.path,
          pending.calendar,
          pending.fingerprint,
          () => validConfirmation(pending.issuedAt),
        );
        return { status: "saved" };
      } catch (error) {
        if (
          code(error) === "VANTARE_ICS_CHANGED" &&
          validConfirmation(pending.issuedAt)
        )
          return await ask(pending.path, pending.calendar).catch(
            () => ({ error: { kind: "io" } }) as Outcome,
          );
        return {
          error: {
            kind: validConfirmation(pending.issuedAt) ? "io" : "rejected",
          },
        };
      } finally {
        busy = false;
      }
    },
    async export(preparedHash: string): Promise<Outcome> {
      if (busy) return { error: { kind: "busy" } };
      const time = now();
      if (!alive || prepared === undefined || prepared.hash !== preparedHash)
        return { error: { kind: "rejected" } };
      if (
        !Number.isFinite(time) ||
        !Number.isFinite(prepared.validUntil) ||
        !Number.isFinite(prepared.preparedAt) ||
        time < prepared.preparedAt ||
        time - prepared.preparedAt >= calendarIcsPreparedMaxAgeMs ||
        time >= prepared.validUntil
      ) {
        prepared = undefined;
        return { error: { kind: "rejected" } };
      }
      const snapshot = prepared;
      prepared = undefined;
      busy = true;
      try {
        const path = await pick();
        if (!alive || path === undefined) return { status: "cancelled" };
        // Freshness is checked only when starting, never after time spent in the dialog.
        const destination = destinationPath(path);
        try {
          await save(destination, snapshot.calendar);
        } catch (error) {
          if (code(error) === "EEXIST")
            return await ask(destination, snapshot.calendar);
          throw error;
        }
        return { status: "saved" };
      } catch (error) {
        if (code(error) === "EEXIST") return { status: "conflict" };
        if (code(error) === "VANTARE_ICS_EXTENSION")
          return { error: { kind: "calendarExportExtension" } };
        return { error: { kind: "io" } };
      } finally {
        busy = false;
      }
    },
  };
}
