import { describe, expect, it } from "vitest";
import scene from "../fixtures/ajustes-base.json";
import status from "../fixtures/core-offline.json";
import settings from "../fixtures/settings-base.json";
import corpus from "../src/contract/generated/corpus.json";
import { isSettings } from "../src/contract/settings-validation";
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

describe("Rust-generated wire corpus", () => {
  it.each(corpus.host.map((message, index) => ({ message, index })))(
    "accepts host sample $index",
    ({ message }) => expect(isHostMessage(message)).toBe(true),
  );
  it.each(corpus.ui.map((message, index) => ({ message, index })))(
    "accepts UI sample $index",
    ({ message }) => expect(isUiMessage(message)).toBe(true),
  );
});

describe("settings boundary rejects malformed intents and views", () => {
  const update = {
    kind: "request",
    id: 1,
    request: {
      method: "settings.update",
      baseRevision: "0".repeat(64),
      patch: { field: "contrast", value: 100 },
    },
  };
  it("accepts a supported patch and rejects unknown fields, out-of-range values and extra keys", () => {
    expect(isUiMessage(update)).toBe(true);
    for (const patch of [
      { field: "unknown", value: true },
      { field: "contrast", value: 79 },
      { field: "contrast", value: 121 },
      { field: "glassOpacity", value: 49 },
      { field: "glassOpacity", value: 101 },
      { field: "zoom", value: 99 },
      { field: "zoom", value: 100.5 },
      { field: "minimized", value: "true" },
      { field: "scheme", value: "unknown" },
      { field: "contrast", value: 100, extra: true },
    ])
      expect(
        isUiMessage({ ...update, request: { ...update.request, patch } }),
      ).toBe(false);
    for (const baseRevision of ["", "0".repeat(63), "g".repeat(64), 1, null])
      expect(
        isUiMessage({
          ...update,
          request: { ...update.request, baseRevision },
        }),
      ).toBe(false);
    expect(isUiMessage({ ...update, extra: true })).toBe(false);
    expect(
      isUiMessage({
        ...update,
        request: { ...update.request, path: "forbidden" },
      }),
    ).toBe(false);
  });
  it("validates all settings fields rather than trusting a TypeScript cast", () => {
    expect(isSettings(settings)).toBe(true);
    for (const value of [
      null,
      {},
      { ...settings, revision: "bad" },
      { ...settings, protected: "false" },
      { ...settings, extra: true },
      { ...settings, general: { ...settings.general, density: "unknown" } },
      { ...settings, general: { ...settings.general, startup: true } },
      { ...settings, appearance: { ...settings.appearance, contrast: 79 } },
      {
        ...settings,
        appearance: { ...settings.appearance, glassOpacity: 101 },
      },
      { ...settings, startup: { supported: true, enabled: "true" } },
      { ...settings, startup: { ...settings.startup, path: "forbidden" } },
    ])
      expect(isSettings(value)).toBe(false);
  });
  it("requires a valid conflict winner and closed protected/io error shapes", () => {
    const failure = (error: unknown) => ({ kind: "failure", id: 1, error });
    for (const error of [
      { kind: "conflict", current: settings },
      { kind: "protected" },
      { kind: "io" },
    ])
      expect(isHostMessage(failure(error))).toBe(true);
    for (const error of [
      { kind: "conflict" },
      { kind: "conflict", current: { ...settings, revision: "bad" } },
      { kind: "protected", current: settings },
      { kind: "io", path: "forbidden" },
    ])
      expect(isHostMessage(failure(error))).toBe(false);
  });
});
