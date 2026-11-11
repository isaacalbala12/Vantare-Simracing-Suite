import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { HostToUi } from "../src/contract/generated/contract";
import {
  calendarExportSession,
  saveCalendar,
} from "../src/main/calendar-export";

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
  const root = await mkdtemp(join(tmpdir(), "vantare-ics-"));
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
