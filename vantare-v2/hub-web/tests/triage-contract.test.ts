import { describe, expect, it } from "vitest";
import {
  triageItems,
  triagePreviewLimit,
} from "../src/contract/generated/contract";
import { isHostMessage, isUiMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

const prepare = (items: unknown = triageItems, consent: unknown = true) => ({
  kind: "request",
  id: 7,
  request: { method: "triage.prepare", selection: { items }, consent },
});
const send = (previewId: unknown, consent: unknown = true) => ({
  kind: "request",
  id: 8,
  request: { method: "triage.send", previewId, consent },
});
describe("closed tester Triage contract", () => {
  it("accepts only closed unique selections and typed consent, with no local prose or paths", () => {
    expect(isUiMessage(prepare())).toBe(true);
    expect(isUiMessage(prepare([]))).toBe(true);
    expect(isUiMessage(prepare([], false))).toBe(true);
    for (const items of [
      [triageItems[0], triageItems[0]],
      ["private-path"],
      [{}],
      "all",
      null,
    ])
      expect(isUiMessage(prepare(items))).toBe(false);
    for (const consent of [undefined, null, "true", 1])
      expect(
        isUiMessage({
          ...prepare(),
          request: { ...prepare().request, consent },
        }),
      ).toBe(false);
    for (const extra of [
      { title: "private" },
      { body: "private" },
      { path: "D:/private" },
      { command: "execute" },
    ])
      expect(
        isUiMessage({
          ...prepare(),
          request: { ...prepare().request, ...extra },
        }),
      ).toBe(false);
    for (const invalid of [
      "",
      "A".repeat(64),
      "a".repeat(63),
      "a".repeat(1024 * 1024),
      {},
    ])
      expect(isUiMessage(send(invalid))).toBe(false);
  });
  it("denies non-testers and unverified sessions and keeps offline distinct", () => {
    for (const scene of [undefined, "testing-reports"])
      expect(createMockHost(scene)(prepare())).toMatchObject({
        error: { kind: "denied" },
      });
    expect(
      createMockHost("testing-tester-triage-offline")(prepare()),
    ).toMatchObject({ error: { kind: "coreUnavailable" } });
    expect(
      createMockHost("testing-tester-triage")(prepare([], false)),
    ).toMatchObject({ error: { kind: "rejected" } });
  });
  it("prepares immutable ids and sends only the approved current preview once", () => {
    const host = createMockHost("testing-tester-triage");
    const first = host(prepare());
    expect(isHostMessage(first)).toBe(true);
    if (first?.kind !== "response" || first.result.method !== "triage.prepare")
      throw new Error("prepared fixture");
    const { id, payload } = first.result.value;
    expect(JSON.parse(payload)).toMatchObject({
      p_context: {
        posthog_session_id: null,
        consent: { version: "triage-v2" },
      },
    });
    expect(host(send(id, false))).toMatchObject({
      error: { kind: "rejected" },
    });
    const second = host(prepare([]));
    if (
      second?.kind !== "response" ||
      second.result.method !== "triage.prepare"
    )
      throw new Error("prepared fixture");
    expect(second.result.value.id).not.toBe(id);
    expect(host(send(id))).toMatchObject({ error: { kind: "rejected" } });
    const sent = host(send(second.result.value.id));
    expect(isHostMessage(sent)).toBe(true);
    expect(sent).toMatchObject({ result: { method: "triage.send" } });
    expect(host(send(second.result.value.id))).toMatchObject({
      error: { kind: "rejected" },
    });
  });
  it("simulates Busy once and rejects oversized or expanded preview envelopes", () => {
    const host = createMockHost("testing-tester-triage-busy");
    expect(host(prepare())).toMatchObject({ error: { kind: "busy" } });
    const message = host(prepare());
    expect(isHostMessage(message)).toBe(true);
    if (
      message?.kind !== "response" ||
      message.result.method !== "triage.prepare"
    )
      throw new Error("prepared fixture");
    for (const patch of [
      { payload: "x".repeat(triagePreviewLimit + 1) },
      { id: "../private" },
      { path: "D:/private" },
    ])
      expect(
        isHostMessage({
          ...message,
          result: {
            ...message.result,
            value: { ...message.result.value, ...patch },
          },
        }),
      ).toBe(false);
  });
});
