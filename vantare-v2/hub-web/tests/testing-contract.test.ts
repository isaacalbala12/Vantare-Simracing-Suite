import { describe, expect, it } from "vitest";
import {
  reportFieldLimits,
  testingIdLimits,
} from "../src/contract/generated/contract";
import { isHostMessage, isUiMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

const fields = {
  module: "hub",
  actionText: "QA",
  expectedText: "",
  observedText: "",
  contextText: "",
};
const request = (method: string, extra = {}) => ({
  kind: "request",
  id: 42,
  request: { method, ...extra },
});
describe("Testing Center closed wire and local persistence double", () => {
  it("requires the current preview and consent, clears once, and refuses a repeated send", () => {
    const host = createMockHost("testing-reports");
    host(request("draft.save", { fields }));
    expect(
      host(
        request("report.send", { previewId: "a".repeat(64), consent: true }),
      ),
    ).toMatchObject({ kind: "failure" });
    const prepared = host(request("report.prepare"));
    expect(prepared).toMatchObject({ result: { method: "report.prepare" } });
    if (
      prepared?.kind !== "response" ||
      prepared.result.method !== "report.prepare"
    )
      throw new Error("missing preview");
    const oldId = prepared.result.value.id;
    const current = host(request("report.prepare"));
    if (
      current?.kind !== "response" ||
      current.result.method !== "report.prepare"
    )
      throw new Error("missing current preview");
    const previewId = current.result.value.id;
    expect(previewId).not.toBe(oldId);
    expect(
      host(request("report.send", { previewId: oldId, consent: true })),
    ).toMatchObject({ error: { kind: "rejected" } });
    expect(
      host(request("report.send", { previewId, consent: false })),
    ).toMatchObject({ kind: "failure" });
    expect(
      host(
        request("report.send", { previewId: "c".repeat(64), consent: true }),
      ),
    ).toMatchObject({ kind: "failure" });
    expect(
      host(request("report.send", { previewId, consent: true })),
    ).toMatchObject({
      result: { method: "report.send", value: { draftState: "cleared" } },
    });
    expect(
      host(request("report.send", { previewId, consent: true })),
    ).toMatchObject({ kind: "failure" });
    expect(host(request("draft.load"))).toMatchObject({
      result: { value: { exists: false } },
    });
  });
  it("enforces tester participation rights and rejects captures before dispatch", () => {
    const user = createMockHost("testing-reports");
    const tester = createMockHost("testing-tester-reports");
    expect(user(request("testing.refresh"))).toMatchObject({
      error: { kind: "denied" },
    });
    expect(tester(request("testing.refresh"))).toMatchObject({
      result: { value: { questionnaires: [{ score: null }] } },
    });
    const id = "15350000-0000-0000-0000-000000000001";
    expect(
      tester(request("testing.contribute", { id, consent: true })),
    ).toMatchObject({ error: { kind: "denied" } });
    expect(tester(request("testing.answer", { id, score: 5 }))).toMatchObject({
      result: { value: { questionnaires: [{ score: 5 }] } },
    });
    expect(user(request("report.capture", { fields }))).toMatchObject({
      error: { kind: "evidencePending" },
    });
    expect(
      createMockHost("testing-offline")(request("report.capture", { fields })),
    ).toMatchObject({ error: { kind: "coreUnavailable" } });
  });
  it("bounds identifiers and timestamps before sending services frames", () => {
    const id = "15350000-0000-0000-0000-000000000001";
    const previewId = "a".repeat(testingIdLimits.previewId);
    for (const invalid of [
      "",
      "a".repeat(1024 * 1024),
      "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA",
      "../report",
    ]) {
      for (const [method, extra] of [
        ["testing.answer", { score: 3 }],
        ["testing.contribute", { consent: true }],
        ["testing.credit", { consent: false }],
        ["testing.noticeRead", { updatedAt: "2026-11-10T12:00:00Z" }],
      ] as const)
        expect(isUiMessage(request(method, { ...extra, id: invalid }))).toBe(
          false,
        );
    }
    for (const invalid of [
      "",
      "a".repeat(testingIdLimits.previewId - 1),
      "A".repeat(testingIdLimits.previewId),
      "g".repeat(testingIdLimits.previewId),
      "a".repeat(1024 * 1024),
    ]) {
      expect(
        isUiMessage(
          request("report.send", { previewId: invalid, consent: true }),
        ),
      ).toBe(false);
      expect(
        isUiMessage(
          request("report.removeScreenshot", { id: invalid, fields }),
        ),
      ).toBe(false);
    }
    for (const updatedAt of [
      "",
      "x".repeat(testingIdLimits.updatedAt + 1),
      "timestamp\n",
      "ñ",
    ])
      expect(
        isUiMessage(request("testing.noticeRead", { id, updatedAt })),
      ).toBe(false);
    expect(isUiMessage(request("testing.answer", { id, score: 3 }))).toBe(true);
    expect(
      isUiMessage(
        request("testing.noticeRead", {
          id,
          updatedAt: "2026-11-10T12:00:00Z",
        }),
      ),
    ).toBe(true);
    expect(
      isUiMessage(request("report.send", { previewId, consent: false })),
    ).toBe(true);
    expect(
      isUiMessage(
        request("report.removeScreenshot", { id: previewId, fields }),
      ),
    ).toBe(true);
    expect(
      isHostMessage({ kind: "failure", id: 42, error: { kind: "rejected" } }),
    ).toBe(true);
    expect(
      isHostMessage({
        kind: "failure",
        id: 42,
        error: { kind: "rejected", message: "private" },
      }),
    ).toBe(false);
  });
  it("roundtrips a draft, preserves it across refresh, and discards it explicitly", () => {
    const host = createMockHost("testing-tester-reports");
    const save = host(request("draft.save", { fields }));
    expect(save).toEqual({
      kind: "response",
      id: 42,
      result: {
        method: "draft.save",
        value: { fields, exists: true, screenshots: [], legacy: "none", message: "" },
      },
    });
    expect(isHostMessage(save)).toBe(true);
    expect(host(request("testing.refresh"))).toMatchObject({
      result: { method: "testing.refresh" },
    });
    expect(host(request("draft.load"))).toMatchObject({
      result: { value: { fields, exists: true, screenshots: [], message: "" } },
    });
    expect(host(request("draft.discard"))).toMatchObject({
      result: { value: { exists: false } },
    });
    expect(host(request("draft.load"))).toMatchObject({
      result: { value: { exists: false } },
    });
  });
  it("accepts only the closed migration states and never a free warning", () => {
    const host = createMockHost("testing-reports");
    const saved = host(request("draft.save", { fields }));
    for (const legacy of ["none", "imported", "importedTrimmed", "preserved"]) {
      expect(
        isHostMessage({
          ...saved,
          result: {
            method: "draft.load",
            value: { fields, exists: true, screenshots: [], legacy },
          },
        }),
      ).toBe(true);
    }
    for (const legacy of ["private text", null, 1, {}, []]) {
      expect(
        isHostMessage({
          ...saved,
          result: {
            method: "draft.load",
            value: { fields, exists: true, screenshots: [], legacy },
          },
        }),
      ).toBe(false);
    }
    expect(
      isHostMessage({
        ...saved,
        result: {
          method: "draft.load",
          value: {
            fields,
            exists: true,
            screenshots: [],
            legacy: "preserved",
            message: "private",
          },
        },
      }),
    ).toBe(false);
  });
  it("accepts already protected CR text without loosening editor writes", () => {
    const stored = { ...fields, actionText: "already saved\r" };
    const draft = {
      fields: stored,
      exists: true,
      screenshots: [],
      legacy: "none",
    };
    expect(
      isHostMessage({
        kind: "response",
        id: 42,
        result: { method: "draft.load", value: draft },
      }),
    ).toBe(true);
    expect(isUiMessage(request("draft.save", { fields: stored }))).toBe(false);
    expect(
      isHostMessage({
        kind: "response",
        id: 42,
        result: {
          method: "draft.load",
          value: { ...draft, fields: { ...stored, actionText: "bad\0" } },
        },
      }),
    ).toBe(false);
  });
  it("denies missing rights and reports an unavailable core without saving", () => {
    expect(createMockHost()(request("draft.save", { fields }))).toMatchObject({
      error: { kind: "denied" },
    });
    expect(
      createMockHost("testing-offline")(request("draft.save", { fields })),
    ).toMatchObject({ error: { kind: "coreUnavailable" } });
  });
  it("rejects arbitrary paths, tokens, unknown modules and UTF-8 overflows", () => {
    for (const value of [
      request("testing.refresh", { path: "forbidden" }),
      request("draft.discard", { token: "forbidden" }),
      request("draft.save", { fields: { ...fields, module: "arbitrary" } }),
      request("draft.save", {
        fields: {
          ...fields,
          actionText: "ñ".repeat(reportFieldLimits[0] / 2 + 1),
        },
      }),
      request("draft.save", { fields: { ...fields, contextText: "\u0000" } }),
      request("draft.save", { fields: { ...fields, future: true } }),
    ])
      expect(isUiMessage(value)).toBe(false);
    expect(
      isUiMessage(
        request("draft.save", {
          fields: {
            ...fields,
            actionText: "ñ".repeat(reportFieldLimits[0] / 2),
          },
        }),
      ),
    ).toBe(true);
  });
  it("rejects private body and idempotency key on presentation replies", () => {
    const value = {
      kind: "response",
      id: 1,
      result: {
        method: "draft.load",
        value: {
          fields,
          exists: true,
          screenshots: [],
          message: "",
          idempotencyKey: "forbidden",
        },
      },
    };
    expect(isHostMessage(value)).toBe(false);
    expect(
      isHostMessage({
        kind: "response",
        id: 1,
        result: {
          method: "testing.refresh",
          value: {
            reports: [
              {
                id: "qa",
                title: "QA",
                state: "received",
                credit: false,
                updatedAt: null,
                fixedVersion: null,
                notice: false,
                body: "private",
              },
            ],
            questionnaires: [],
          },
        },
      }),
    ).toBe(false);
  });
});
