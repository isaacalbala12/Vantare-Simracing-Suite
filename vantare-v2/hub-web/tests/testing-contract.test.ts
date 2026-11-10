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
    const host = createMockHost("testing-reports");
    const save = host(request("draft.save", { fields }));
    expect(save).toEqual({
      kind: "response",
      id: 42,
      result: {
        method: "draft.save",
        value: { fields, exists: true, screenshots: [] },
      },
    });
    expect(isHostMessage(save)).toBe(true);
    expect(host(request("testing.refresh"))).toMatchObject({
      result: { method: "testing.refresh" },
    });
    expect(host(request("draft.load"))).toMatchObject({
      result: { value: { fields, exists: true, screenshots: [] } },
    });
    expect(host(request("draft.discard"))).toMatchObject({
      result: { value: { exists: false } },
    });
    expect(host(request("draft.load"))).toMatchObject({
      result: { value: { exists: false } },
    });
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
