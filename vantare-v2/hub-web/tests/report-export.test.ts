import { createHash } from "node:crypto";
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
const digest = (report = '{"safe":true}') =>
  createHash("sha256").update(report, "utf8").digest("hex");
function prepared(id = 7, report = '{"safe":true}'): HostToUi {
  return {
    kind: "response",
    id,
    result: {
      method: "report.localPrepare",
      value: {
        core: "unavailable",
        binaries: [],
        report,
        preparedHash: digest(report),
      },
    },
  };
}
describe("local report export stays in main", () => {
  it("accepts only the two closed requests without renderer destinations", async () => {
    for (const method of ["report.localPrepare", "report.localExport"]) {
      const request = {
        method,
        ...(method === "report.localPrepare"
          ? { fields }
          : { preparedHash: digest() }),
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
    let deliver!: (message: HostToUi) => void;
    const response = new Promise<HostToUi>((resolve) => {
      deliver = resolve;
    });
    const mock = createMockHost("testing-reports", deliver);
    mock({
      kind: "request",
      id: 7,
      request: { method: "report.localPrepare", fields },
    });
    const reply = await response;
    expect(isHostMessage(reply)).toBe(true);
    expect(JSON.stringify(reply)).not.toContain(fields.actionText);
    if (
      reply.kind !== "response" ||
      reply.result.method !== "report.localPrepare"
    )
      throw new Error("prepared mock");
    const payload = JSON.parse(reply.result.value.report);
    expect(Object.keys(payload.diagnostic)).toEqual([
      "schemaVersion",
      "channel",
      "version",
      "os",
      "arch",
      "core",
      "sectionErrors",
      "binaries",
      "uninstrumentedSections",
    ]);
    expect(payload.diagnostic.binaries).toHaveLength(9);
    expect(reply.result.value.preparedHash).toBe(
      digest(reply.result.value.report),
    );
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
    expect(await session.export(digest())).toEqual({
      error: { kind: "rejected" },
    });
    expect(pick).not.toHaveBeenCalled();
    session.observe(prepared());
    expect(await session.export(digest())).toEqual({ status: "cancelled" });
    expect(save).not.toHaveBeenCalled();
    expect(await session.export(digest())).toEqual({
      error: { kind: "rejected" },
    });
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
    const pending = session.export(digest());
    expect(await session.export(digest())).toEqual({ error: { kind: "busy" } });
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
    expect(await session.export(digest())).toEqual({ status: "saved" });
    expect(await session.export(digest())).toEqual({
      error: { kind: "rejected" },
    });
    expect(save).toHaveBeenCalledWith(
      "D:/chosen-by-main.json",
      '{"safe":true}',
    );
    session.expect(8);
    session.observe(prepared(7, "late discarded"));
    expect(await session.export(digest())).toEqual({
      error: { kind: "rejected" },
    });
    session.observe(prepared(8));
    save.mockRejectedValueOnce(new Error("private filesystem path"));
    expect(await session.export(digest())).toEqual({ error: { kind: "io" } });
    session.expect(9);
    session.observe(prepared(9));
    save.mockRejectedValueOnce(
      Object.assign(new Error("exists"), { code: "EEXIST" }),
    );
    expect(await session.export(digest())).toEqual({ status: "conflict" });
    expect(await session.export(digest())).toEqual({
      error: { kind: "rejected" },
    });
  });
  it("binds the main-owned digest to the displayed snapshot and ignores prepare while a dialog is open", async () => {
    let choose!: (path: string) => void;
    const pick = new Promise<string>((resolve) => {
      choose = resolve;
    });
    const save = vi.fn(async () => {});
    const session = reportExportSession(() => pick, save);
    session.expect(7);
    const received = prepared();
    if (
      received.kind !== "response" ||
      received.result.method !== "report.localPrepare"
    )
      throw new Error("fixture");
    received.result.value.preparedHash = "f".repeat(64);
    const forwarded = session.observe(received);
    expect(forwarded).toMatchObject({
      result: { value: { preparedHash: digest() } },
    });
    expect(await session.export("f".repeat(64))).toEqual({
      error: { kind: "rejected" },
    });
    const exporting = session.export(digest());
    expect(session.expect(8)).toBe(false);
    session.observe(prepared(8, "different report"));
    choose("D:/main-chosen.json");
    expect(await exporting).toEqual({ status: "saved" });
    expect(save).toHaveBeenCalledWith("D:/main-chosen.json", '{"safe":true}');
  });
  it("falls back to exclusive direct writing when hard links are unsupported and still refuses overwrite", async () => {
    const root = await mkdtemp(join(tmpdir(), "report-export-fallback-"));
    const target = join(root, "vantare-report.json");
    const unsupported = vi.fn(async () => {
      throw Object.assign(new Error("unsupported"), { code: "ENOTSUP" });
    });
    try {
      await saveReport(target, '{"local":true}', unsupported);
      expect(await readFile(target, "utf8")).toBe('{"local":true}');
      await expect(
        saveReport(target, "replacement", unsupported),
      ).rejects.toMatchObject({ code: "EEXIST" });
      expect(await readFile(target, "utf8")).toBe('{"local":true}');
      expect(await readdir(root)).toEqual(["vantare-report.json"]);
    } finally {
      const actual = await realpath(root);
      expect(actual.startsWith((await realpath(tmpdir())) + sep)).toBe(true);
      await rm(actual, { recursive: true });
    }
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
