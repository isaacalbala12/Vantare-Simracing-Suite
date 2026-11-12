import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  calendarIcsLimit,
  type HostToUi,
} from "../src/contract/generated/contract";
import {
  calendarExportSession,
  saveCalendar,
} from "../src/main/calendar-export";

const preparedTime = Date.parse("2026-10-08T17:47:13Z");
beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(preparedTime));
afterEach(() => vi.restoreAllMocks());
const calendar = "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n";
const hash = createHash("sha256").update(calendar).digest("hex");
function response(id = 1): HostToUi {
  return {
    kind: "response",
    id,
    result: {
      method: "calendar.icsPrepare",
      value: {
        calendar,
        preparedHash: "a".repeat(64),
        entries: [],
        total: 0,
        validUntil: "2026-10-13T00:00:00Z",
      },
    },
  };
}
it("binds displayed bytes to their hash and consumes saved or cancelled snapshots", async () => {
  const pick = vi.fn().mockResolvedValue("C:/calendar.ics"),
    save = vi.fn().mockResolvedValue(undefined);
  const session = calendarExportSession(pick, save);
  expect(session.expect(1)).toBe(true);
  const message = session.observe(response());
  expect(
    message.kind === "response" &&
      message.result.method === "calendar.icsPrepare" &&
      message.result.value.preparedHash,
  ).toBe(hash);
  expect(await session.export("b".repeat(64))).toEqual({
    error: { kind: "rejected" },
  });
  expect(await session.export(hash)).toEqual({ status: "saved" });
  expect(save).toHaveBeenCalledWith("C:/calendar.ics", calendar);
  expect(await session.export(hash)).toEqual({ error: { kind: "rejected" } });
  session.expect(2);
  session.observe(response(2));
  pick.mockResolvedValueOnce(undefined);
  expect(await session.export(hash)).toEqual({ status: "cancelled" });
  expect(await session.export(hash)).toEqual({ error: { kind: "rejected" } });
});
it("refuses parallel preparation and export while a native dialog is open and cancels on disconnect", async () => {
  let resolve!: (path: string) => void;
  const save = vi.fn();
  const session = calendarExportSession(
    () =>
      new Promise<string>((r) => {
        resolve = r;
      }),
    save,
  );
  session.expect(1);
  session.observe(response());
  const pending = session.export(hash);
  expect(session.expect(2)).toBe(false);
  expect(await session.export(hash)).toEqual({ error: { kind: "busy" } });
  session.close();
  resolve("C:/calendar.ics");
  expect(await pending).toEqual({ status: "cancelled" });
  expect(save).not.toHaveBeenCalled();
});
it("uses exclusive destination creation even without hard links", async () => {
  const root = await mkdtemp(
    join(process.env.VANTARE_HUB_QA_ROOT ?? tmpdir(), "vantare-ics-"),
  );
  try {
    const path = join(root, "calendar.ics");
    const unsupported = async () => {
      throw Object.assign(new Error("unsupported"), { code: "ENOTSUP" });
    };
    await saveCalendar(path, calendar, unsupported);
    expect(await readFile(path, "utf8")).toBe(calendar);
    await expect(
      saveCalendar(path, "other", unsupported),
    ).rejects.toHaveProperty("code", "EEXIST");
    expect(await readFile(path, "utf8")).toBe(calendar);
    await writeFile(join(root, "existing.ics"), "original");
    await expect(
      saveCalendar(join(root, "existing.ics"), calendar),
    ).rejects.toHaveProperty("code", "EEXIST");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const unsupported = async () => {
  throw Object.assign(new Error("no links"), { code: "ENOTSUP" });
};
async function withDirectory(run: (root: string) => Promise<void>) {
  const namespace = process.env.VANTARE_HUB_QA_ROOT ?? tmpdir();
  await mkdir(namespace, { recursive: true });
  const root = await mkdtemp(join(namespace, "vantare-ics-review-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
for (const stage of ["writeFile", "sync"] as const) {
  it(`removes its exclusive fallback destination after ${stage} fails`, async () => {
    await withDirectory(async (root) => {
      const path = join(root, "failed.ics");
      await expect(
        saveCalendar(path, calendar, unsupported, async (target) => {
          const handle = await open(target, "wx");
          vi.spyOn(handle, stage).mockRejectedValueOnce(
            Object.assign(new Error("write failed"), { code: "EIO" }),
          );
          return handle;
        }),
      ).rejects.toHaveProperty("code", "EIO");
      await expect(readFile(path)).rejects.toHaveProperty("code", "ENOENT");
      expect(await readdir(root)).toEqual([]);
    });
  });
}
it.each([
  String.raw`\\server\share\calendar.ics`,
  "//server/share/calendar.ics",
  "relative/calendar.ics",
  "C:/calendar.ics:stream",
  "C:/CON.ics",
  "C:/nul.ics",
  "C:/Aux",
  "C:/COM0.ics",
  "C:/lpt9.ics",
  "C:/PRN.txt",
  `C:/${"a".repeat(32768)}.ics`,
])(
  "rejects an invalid local destination before creating files: %s",
  async (path) => {
    await expect(saveCalendar(path, calendar)).rejects.toBeTruthy();
  },
);
it("adds a missing extension but returns a closed specific error for a different extension", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const missing = calendarExportSession(async () => "C:/calendar", save);
  missing.expect(1);
  missing.observe(response());
  expect(await missing.export(hash)).toEqual({ status: "saved" });
  expect(save).toHaveBeenCalledWith("C:/calendar.ics", calendar);
  const wrong = calendarExportSession(async () => "C:/calendar.txt", save);
  wrong.expect(1);
  wrong.observe(response());
  expect(await wrong.export(hash)).toEqual({
    error: { kind: "calendarExportExtension" },
  });
  await withDirectory(async (root) => {
    await saveCalendar(join(root, "without-extension"), calendar);
    expect(await readFile(join(root, "without-extension.ics"), "utf8")).toBe(
      calendar,
    );
    await expect(
      saveCalendar(join(root, "wrong.txt"), calendar),
    ).rejects.toHaveProperty("code", "VANTARE_ICS_EXTENSION");
  });
});
it("enforces the byte limit and leaves a missing directory absent", async () => {
  await withDirectory(async (root) => {
    await expect(
      saveCalendar(
        join(root, "large.ics"),
        "á".repeat(Math.floor(calendarIcsLimit / 2) + 1),
      ),
    ).rejects.toHaveProperty("code", "EFBIG");
    const session = calendarExportSession(async () =>
      join(root, "missing", "calendar.ics"),
    );
    session.expect(1);
    session.observe(response());
    expect(await session.export(hash)).toEqual({ error: { kind: "io" } });
    expect(await readdir(root)).toEqual([]);
  });
});
it("refuses existing real NTFS symlinks and junctions without changing their targets", async (context) => {
  if (process.platform !== "win32") {
    context.skip();
    return;
  }
  await withDirectory(async (root) => {
    const original = join(root, "original.ics"),
      directory = join(root, "original-directory");
    await writeFile(original, "original");
    await mkdir(directory);
    await writeFile(join(directory, "keep.txt"), "keep");
    const linked = join(root, "linked.ics"),
      junction = join(root, "junction.ics");
    try {
      await symlink(original, linked, "file");
      await symlink(directory, junction, "junction");
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EPERM"
      ) {
        console.warn(
          "QA: symlink privilege unavailable; NTFS link test omitted",
        );
        context.skip();
        return;
      }
      throw error;
    }
    await expect(saveCalendar(linked, calendar)).rejects.toBeTruthy();
    await expect(
      saveCalendar(junction, calendar, unsupported),
    ).rejects.toBeTruthy();
    expect(await readFile(original, "utf8")).toBe("original");
    expect(await readFile(join(junction, "keep.txt"), "utf8")).toBe("keep");
  });
});
it.each(["EACCES", "EIO"])(
  "maps save failure %s without exposing its message",
  async (code) => {
    const session = calendarExportSession(
      async () => "C:/calendar.ics",
      async () => {
        throw Object.assign(new Error("private destination"), { code });
      },
    );
    session.expect(1);
    session.observe(response());
    expect(await session.export(hash)).toEqual({ error: { kind: "io" } });
    expect(await session.export(hash)).toEqual({ error: { kind: "rejected" } });
  },
);
it("expires at thirty minutes and at the publication end, before opening the dialog", async () => {
  for (const [elapsed, until] of [
    [30 * 60_000, "2026-10-13T00:00:00Z"],
    [1000, "2026-10-08T17:47:14Z"],
  ] as const) {
    let time = preparedTime;
    const pick = vi.fn().mockResolvedValue("C:/calendar.ics"),
      save = vi.fn();
    const session = calendarExportSession(pick, save, () => time);
    session.expect(1);
    const reply = response();
    if (
      reply.kind !== "response" ||
      reply.result.method !== "calendar.icsPrepare"
    )
      throw new Error("fixture");
    reply.result.value.validUntil = until;
    session.observe(reply);
    time += elapsed;
    expect(await session.export(hash)).toEqual({ error: { kind: "rejected" } });
    expect(pick).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  }
});
it("allows a dialog opened while fresh to finish after the preparation expires", async () => {
  let time = preparedTime,
    resolve!: (path: string) => void;
  const save = vi.fn().mockResolvedValue(undefined);
  const session = calendarExportSession(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
    save,
    () => time,
  );
  session.expect(1);
  session.observe(response());
  const pending = session.export(hash);
  time += 8 * 86_400_000;
  resolve("C:/calendar.ics");
  expect(await pending).toEqual({ status: "saved" });
  expect(save).toHaveBeenCalledOnce();
});
it("invalidates old preparation on a new request, ignores overlapping replies, and preserves host failures", async () => {
  const save = vi.fn().mockResolvedValue(undefined),
    session = calendarExportSession(async () => "C:/calendar.ics", save);
  session.expect(1);
  session.observe(response());
  session.expect(2);
  session.observe(response(1));
  expect(await session.export(hash)).toEqual({ error: { kind: "rejected" } });
  const failure: HostToUi = {
    kind: "failure",
    id: 2,
    error: { kind: "coreUnavailable" },
  };
  expect(session.observe(failure)).toBe(failure);
  session.observe(response(2));
  expect(await session.export(hash)).toEqual({ error: { kind: "rejected" } });
  session.expect(3);
  session.expect(4);
  const latest = response(4);
  if (
    latest.kind !== "response" ||
    latest.result.method !== "calendar.icsPrepare"
  )
    throw new Error("fixture");
  latest.result.value.calendar = calendar.replace(
    "END:VCALENDAR",
    "METHOD:PUBLISH\r\nEND:VCALENDAR",
  );
  const latestHash = createHash("sha256")
    .update(latest.result.value.calendar)
    .digest("hex");
  session.observe(latest);
  session.observe(response(3));
  expect(await session.export(hash)).toEqual({ error: { kind: "rejected" } });
  expect(await session.export(latestHash)).toEqual({ status: "saved" });
});
it("does not cache a response of another family even if its id matches", async () => {
  const session = calendarExportSession(async () => "C:/calendar.ics", vi.fn());
  session.expect(1);
  session.observe({
    kind: "response",
    id: 1,
    result: { method: "calendar.icsExport", status: "cancelled" },
  });
  session.observe(response());
  expect(await session.export(hash)).toEqual({ error: { kind: "rejected" } });
});

it("accepts a snapshot just before thirty minutes and rejects a backwards clock", async () => {
  let time = preparedTime;
  const save = vi.fn().mockResolvedValue(undefined);
  const fresh = calendarExportSession(
    async () => "C:/calendar.ics",
    save,
    () => time,
  );
  fresh.expect(1);
  fresh.observe(response());
  time += 30 * 60_000 - 1;
  expect(await fresh.export(hash)).toEqual({ status: "saved" });
  const backwards = calendarExportSession(
    async () => "C:/calendar.ics",
    save,
    () => time,
  );
  backwards.expect(1);
  backwards.observe(response());
  time--;
  expect(await backwards.export(hash)).toEqual({ error: { kind: "rejected" } });
});
