import {
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { HostToUi } from "../src/contract/generated/contract";
import { reportExportLimit } from "../src/contract/generated/contract";
import { isHostMessage, isUiMessage } from "../src/contract/validation";
import { reportExportSession, saveReport } from "../src/main/report-export";
import { createMockHost } from "../src/mock/host";

const fields = {
  module: "hub",
  actionText: "private title",
  expectedText: "",
  observedText: "",
  contextText: "",
};
function prepared(id = 7, report = '{"safe":true}'): HostToUi {
  return {
    kind: "response",
    id,
    result: {
      method: "report.localPrepare",
      value: { core: "unavailable", binaries: [], report },
    },
  };
}
describe("local report export stays in main", () => {
  it("accepts only the two closed requests without renderer destinations", () => {
    for (const method of ["report.localPrepare", "report.localExport"]) {
      const request = {
        method,
        ...(method === "report.localPrepare" ? { fields } : {}),
      };
      expect(isUiMessage({ kind: "request", id: 7, request })).toBe(true);
      for (const extra of [
        { path: "D:/private.json" },
        { text: "arbitrary" },
        { url: "https://example.invalid" },
      ])
        expect(
          isUiMessage({
            kind: "request",
            id: 7,
            request: { ...request, ...extra },
          }),
        ).toBe(false);
    }
    expect(isHostMessage(prepared())).toBe(true);
    const mock = createMockHost("testing-reports");
    const reply = mock({
      kind: "request",
      id: 7,
      request: { method: "report.localPrepare", fields },
    });
    expect(isHostMessage(reply)).toBe(true);
    expect(JSON.stringify(reply)).not.toContain(fields.actionText);
  });
  it("bounds prepared reports and rejects unknown binary metadata", () => {
    const valid = prepared();
    if (
      valid.kind !== "response" ||
      valid.result.method !== "report.localPrepare"
    )
      throw new Error("fixture");
    const value = valid.result.value;
    const response = (patch: object) => ({
      ...valid,
      result: { method: "report.localPrepare", value: { ...value, ...patch } },
    });
    expect(
      isHostMessage(response({ report: "x".repeat(reportExportLimit + 1) })),
    ).toBe(false);
    for (const binary of [
      { name: "D:/private.exe", state: "missing", sha256: null },
      { name: "vantare.exe", state: {}, sha256: null },
      { name: "vantare.exe", state: "present", sha256: null },
      { name: "vantare.exe", state: "present", sha256: "z".repeat(64) },
    ])
      expect(isHostMessage(response({ binaries: [binary] }))).toBe(false);
    const binary = {
      name: "vantare.exe",
      state: "present",
      sha256: "a".repeat(64),
    };
    expect(isHostMessage(response({ binaries: [binary] }))).toBe(true);
    expect(isHostMessage(response({ binaries: [binary, binary] }))).toBe(false);
  });
  it("exports only a matching prepared reply; cancellation writes nothing", async () => {
    const pick = vi.fn(async () => undefined);
    const save = vi.fn(async () => {});
    const session = reportExportSession(pick, save);
    session.expect(7);
    session.observe(prepared(6));
    expect(await session.export()).toEqual({ error: { kind: "rejected" } });
    expect(pick).not.toHaveBeenCalled();
    session.observe(prepared());
    expect(await session.export()).toEqual({ status: "cancelled" });
    expect(save).not.toHaveBeenCalled();
  });
  it("serializes dialogs and cancels a destination returned after disconnect", async () => {
    let finish!: (path: string) => void;
    const picker = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const save = vi.fn(async () => {});
    const session = reportExportSession(() => picker, save);
    session.expect(7);
    session.observe(prepared());
    const pending = session.export();
    expect(await session.export()).toEqual({ error: { kind: "busy" } });
    session.close();
    finish("D:/chosen-by-main.json");
    expect(await pending).toEqual({ status: "cancelled" });
    expect(save).not.toHaveBeenCalled();
  });
  it("writes the reviewed snapshot and reports a closed IO error", async () => {
    const save = vi.fn(async () => {});
    const session = reportExportSession(
      async () => "D:/chosen-by-main.json",
      save,
    );
    session.expect(7);
    session.observe(prepared());
    expect(await session.export()).toEqual({ status: "saved" });
    expect(save).toHaveBeenCalledWith(
      "D:/chosen-by-main.json",
      '{"safe":true}',
    );
    session.expect(8);
    session.observe(prepared(7, "late discarded"));
    expect(await session.export()).toEqual({ error: { kind: "rejected" } });
    session.observe(prepared(8));
    save.mockRejectedValueOnce(new Error("private filesystem path"));
    expect(await session.export()).toEqual({ error: { kind: "io" } });
    save.mockRejectedValueOnce(
      Object.assign(new Error("exists"), { code: "EEXIST" }),
    );
    expect(await session.export()).toEqual({ status: "conflict" });
  });
  it("publishes complete bytes exclusively and cleans temporary files on conflicts", async () => {
    const namespace = resolve(process.env.VANTARE_HUB_QA_ROOT ?? tmpdir());
    const root = await mkdtemp(join(namespace, "report-export-"));
    const target = join(root, "vantare-report.json");
    try {
      await saveReport(target, '{"safe":true}');
      expect(await readFile(target, "utf8")).toBe('{"safe":true}');
      await expect(saveReport(target, "replacement")).rejects.toMatchObject({
        code: "EEXIST",
      });
      expect(await readFile(target, "utf8")).toBe('{"safe":true}');
      expect(await readdir(root)).toEqual(["vantare-report.json"]);
      await writeFile(join(root, "existing.txt"), "untouched");
      await expect(
        saveReport(join(root, "existing.txt"), "replacement"),
      ).rejects.toThrow();
      expect(await readFile(join(root, "existing.txt"), "utf8")).toBe(
        "untouched",
      );
    } finally {
      const actual = await realpath(root);
      expect(actual.startsWith((await realpath(namespace)) + sep)).toBe(true);
      await rm(actual, { recursive: true });
    }
  });
});
