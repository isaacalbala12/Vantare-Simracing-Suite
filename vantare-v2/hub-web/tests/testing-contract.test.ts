import { describe, expect, it } from "vitest";
import { reportFieldLimits } from "../src/contract/generated/contract";
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
