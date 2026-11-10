import { describe, expect, it } from "vitest";
import scene from "../fixtures/ajustes-base.json";
import status from "../fixtures/core-offline.json";
import {
  bounded,
  FRAME_LIMIT,
  isHostMessage,
  isUiMessage,
} from "../src/contract/validation";
import { mockReply } from "../src/mock/host";

describe("host contract boundaries", () => {
  it("accepts matching Rust scenes and the supported request envelope", () => {
    expect(isHostMessage(scene)).toBe(true);
    expect(
      isHostMessage({ kind: "event", event: { topic: "core", value: status } }),
    ).toBe(true);
    expect(
      isUiMessage({ kind: "request", id: 1, request: { method: "core.get" } }),
    ).toBe(true);
  });
  it("rejects unknown commands, extra fields, invalid ids and bootstrap secrets", () => {
    for (const value of [
      { kind: "ready", extra: true },
      { kind: "authenticate", token: "a".repeat(64) },
      { kind: "request", id: -1, request: { method: "core.get" } },
      { kind: "request", id: 1, request: { method: "arbitrary" } },
      { kind: "subscribe", topic: "rawTelemetry" },
    ])
      expect(isUiMessage(value)).toBe(false);
  });
  it("rejects malformed views and cannot be crashed by object-valued enum fields", () => {
    for (const value of [
      { ...scene, window: { ...scene.window, width: 1 } },
      { ...scene, token: "forbidden" },
      { kind: "failure", id: 1, error: { kind: { toString: {} } } },
      {
        kind: "event",
        event: {
          topic: "core",
          value: { ...status, photos: { toString: {} } },
        },
      },
    ])
      expect(isHostMessage(value)).toBe(false);
  });
  it("enforces the one MiB limit including UTF-8 encoding", () => {
    expect(bounded("é".repeat(FRAME_LIMIT))).toBe(false);
    expect(bounded(undefined)).toBe(false);
    expect(bounded({ kind: "ready" })).toBe(true);
  });
  it("returns a typed simulated core response with the original correlation id", () => {
    expect(
      mockReply({ kind: "request", id: 42, request: { method: "core.get" } }),
    ).toEqual({
      kind: "response",
      id: 42,
      result: { method: "core.get", value: status },
    });
  });
});
