import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import {
  calendarIcsConfirmationMaxAgeMs,
  type HostToUi,
} from "../src/contract/generated/contract";
import {
  calendarExportSession,
  saveCalendar,
} from "../src/main/calendar-export";
import {
  calendarFingerprint,
  replaceCalendar,
} from "../src/main/calendar-replacement-file";

const calendar = "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n";
const hash = createHash("sha256").update(calendar).digest("hex");
const initialTime = Date.parse("2026-10-08T17:47:13Z");
async function fixture(run: (root: string, path: string) => Promise<void>) {
  const root = await mkdtemp(
    join(process.env.VANTARE_HUB_QA_ROOT ?? tmpdir(), "ics-replace-"),
  );
  try {
    const path = join(root, "existing.ics");
    await writeFile(path, "original");
    await run(root, path);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
function prepare(session: ReturnType<typeof calendarExportSession>, id = 1) {
  expect(session.expect(id)).toBe(true);
  session.observe({
    kind: "response",
    id,
    result: {
      method: "calendar.icsPrepare",
      value: {
        calendar,
        preparedHash: hash,
        entries: [],
        total: 0,
        validUntil: "2026-10-13T00:00:00Z",
      },
    },
  } satisfies HostToUi);
}
async function ask(session: ReturnType<typeof calendarExportSession>) {
  prepare(session);
  const result = await session.export(hash);
  expect(result).toEqual({
    status: "replacementRequired",
    confirmationId: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  if (!("confirmationId" in result)) throw new Error("missing confirmation");
  expect(JSON.stringify(result)).not.toContain("existing.ics");
  return result.confirmationId;
}
it("does not touch an existing file before confirmation, cancels and consumes its opaque id", async () => {
  await fixture(async (_root, path) => {
    const session = calendarExportSession(
      async () => path,
      saveCalendar,
      () => initialTime,
    );
    const id = await ask(session);
    expect(await readFile(path, "utf8")).toBe("original");
    expect(await session.replace("b".repeat(64), true)).toEqual({
      error: { kind: "rejected" },
    });
    expect(await session.replace(id, false)).toEqual({ status: "cancelled" });
    expect(await readFile(path, "utf8")).toBe("original");
    expect(await session.replace(id, true)).toEqual({
      error: { kind: "rejected" },
    });
  });
});
it("publishes the complete reviewed bytes atomically and consumes the confirmation", async () => {
  await fixture(async (root, path) => {
    const session = calendarExportSession(
      async () => path,
      saveCalendar,
      () => initialTime,
    );
    const id = await ask(session);
    expect(await session.replace(id, true)).toEqual({ status: "saved" });
    expect(await readFile(path, "utf8")).toBe(calendar);
    expect(await readdir(root)).toEqual(["existing.ics"]);
    expect(await session.replace(id, true)).toEqual({
      error: { kind: "rejected" },
    });
  });
});
it("asks again with a different id after a same-size edit even if mtime is restored", async () => {
  await fixture(async (_root, path) => {
    const session = calendarExportSession(
      async () => path,
      saveCalendar,
      () => initialTime,
    );
    const id = await ask(session);
    await writeFile(path, "modified");
    await utimes(path, initialTime / 1000, initialTime / 1000);
    const result = await session.replace(id, true);
    expect(result).toEqual({
      status: "replacementRequired",
      confirmationId: expect.any(String),
    });
    if (!("confirmationId" in result)) throw new Error("missing confirmation");
    expect(result.confirmationId).not.toBe(id);
    expect(await readFile(path, "utf8")).toBe("modified");
    expect(await session.replace(id, true)).toEqual({
      error: { kind: "rejected" },
    });
    expect(await session.replace(result.confirmationId, true)).toEqual({
      status: "saved",
    });
  });
});
it("expires on the injected clock, rejects rollback and disconnect, and a new prepare invalidates it", async () => {
  await fixture(async (_root, path) => {
    for (const mode of [
      "expiry",
      "rollback",
      "disconnect",
      "prepare",
    ] as const) {
      let now = initialTime;
      const session = calendarExportSession(
        async () => path,
        saveCalendar,
        () => now,
      );
      const id = await ask(session);
      if (mode === "expiry") now += calendarIcsConfirmationMaxAgeMs;
      if (mode === "rollback") now--;
      if (mode === "disconnect") session.close();
      if (mode === "prepare") prepare(session, 2);
      expect(await session.replace(id, true)).toEqual({
        error: { kind: "rejected" },
      });
      expect(await readFile(path, "utf8")).toBe("original");
    }
  });
});
for (const stage of ["writeFile", "sync", "rename"] as const) {
  it(`preserves the destination and cleans its temporary after ${stage} fails`, async () => {
    await fixture(async (root, path) => {
      const fingerprint = await calendarFingerprint(path);
      if (!fingerprint) throw new Error("fixture missing");
      const publish =
        stage === "rename"
          ? vi.fn().mockRejectedValue(new Error("I/O"))
          : rename;
      const create: typeof open = async (...args: Parameters<typeof open>) => {
        const handle = await open(...args);
        if (stage !== "rename")
          vi.spyOn(handle, stage).mockRejectedValueOnce(new Error("I/O"));
        return handle;
      };
      await expect(
        replaceCalendar(
          path,
          calendar,
          fingerprint,
          () => true,
          publish,
          create,
        ),
      ).rejects.toThrow();
      expect(await readFile(path, "utf8")).toBe("original");
      expect(await readdir(root)).toEqual(["existing.ics"]);
    });
  });
}
it("detects an edit while writing the temporary and never publishes over it", async () => {
  await fixture(async (root, path) => {
    const fingerprint = await calendarFingerprint(path);
    if (!fingerprint) throw new Error("fixture missing");
    const create: typeof open = async (...args: Parameters<typeof open>) => {
      const handle = await open(...args);
      await writeFile(path, "edited during write");
      return handle;
    };
    const publish = vi.fn();
    await expect(
      replaceCalendar(path, calendar, fingerprint, () => true, publish, create),
    ).rejects.toHaveProperty("code", "VANTARE_ICS_CHANGED");
    expect(publish).not.toHaveBeenCalled();
    expect(await readFile(path, "utf8")).toBe("edited during write");
    expect(await readdir(root)).toEqual(["existing.ics"]);
  });
});
it("will not turn a removed destination into an unconfirmed create", async () => {
  await fixture(async (_root, path) => {
    const session = calendarExportSession(
      async () => path,
      saveCalendar,
      () => initialTime,
    );
    const id = await ask(session);
    await rm(path);
    expect(await session.replace(id, true)).toEqual({
      error: { kind: "rejected" },
    });
    await expect(readFile(path)).rejects.toHaveProperty("code", "ENOENT");
  });
});
it("does not follow a destination link or directory", async (context) => {
  await fixture(async (root, path) => {
    const linked = join(root, "linked.ics");
    try {
      await symlink(path, linked, "file");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        console.warn("QA: symlink privilege unavailable");
        context.skip();
        return;
      }
      throw error;
    }
    await expect(calendarFingerprint(linked)).rejects.toHaveProperty(
      "code",
      "EINVAL",
    );
    const directory = join(root, "directory.ics");
    await mkdir(directory);
    await expect(calendarFingerprint(directory)).rejects.toHaveProperty(
      "code",
      "EINVAL",
    );
    expect(await readFile(path, "utf8")).toBe("original");
  });
});

it("cancels publication when the session closes during temporary creation", async () => {
  await fixture(async (root, path) => {
    let alive = true;
    const fingerprint = await calendarFingerprint(path);
    if (!fingerprint) throw new Error("missing file");
    const create: typeof open = async (...args: Parameters<typeof open>) => {
      const handle = await open(...args);
      alive = false;
      return handle;
    };
    const publish = vi.fn();
    await expect(
      replaceCalendar(
        path,
        calendar,
        fingerprint,
        () => alive,
        publish,
        create,
      ),
    ).rejects.toHaveProperty("code", "VANTARE_ICS_CHANGED");
    expect(publish).not.toHaveBeenCalled();
    expect(await readFile(path, "utf8")).toBe("original");
    expect(await readdir(root)).toEqual(["existing.ics"]);
  });
});
it("rejects parallel confirmation and prepare while publication is in flight", async () => {
  await fixture(async (_root, path) => {
    let finish!: () => void;
    let didEnter!: () => void;
    const entered = new Promise<void>((r) => {
      didEnter = r;
    });
    const writer = vi.fn(
      () =>
        new Promise<void>((r) => {
          finish = r;
          didEnter();
        }),
    );
    const session = calendarExportSession(
      async () => path,
      saveCalendar,
      () => initialTime,
      calendarFingerprint,
      writer,
    );
    const id = await ask(session);
    const pending = session.replace(id, true);
    await entered;
    expect(await session.replace(id, true)).toEqual({
      error: { kind: "busy" },
    });
    expect(session.expect(2)).toBe(false);
    finish();
    expect(await pending).toEqual({ status: "saved" });
    expect(writer).toHaveBeenCalledOnce();
  });
});
