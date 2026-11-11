import { describe, expect, it } from "vitest";
import scene from "../fixtures/ajustes-base.json";
import status from "../fixtures/core-offline.json";
import privacy from "../fixtures/privacy-base.json";
import settings from "../fixtures/settings-base.json";
import {
  maxWidgetOverrides,
  pilotLimits,
} from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus.json";
import { isPrivacy } from "../src/contract/privacy-validation";
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

describe("layout patches are closed and typed", () => {
  it("accepts only known levels and boolean visibility", () => {
    const request = (patch: unknown) => ({
      kind: "request",
      id: 1,
      request: {
        method: "settings.update",
        baseRevision: "0".repeat(64),
        patch,
      },
    });
    for (const patch of [
      { field: "performance", value: "economy" },
      { field: "hideOffTrack", value: true },
    ])
      expect(isUiMessage(request(patch))).toBe(true);
    for (const patch of [
      { field: "performance", value: "automatic" },
      { field: "performance", value: 1 },
      { field: "performance", value: "high", widgets: {} },
      { field: "hideOffTrack", value: "true" },
      { field: "hideOffTrack", value: true, extra: 1 },
    ])
      expect(isUiMessage(request(patch))).toBe(false);
  });
});

describe("privacy wire boundary", () => {
  it("rejects unknown fields, malformed revisions and non-boolean choices", () => {
    const valid = {
      kind: "request",
      id: 1,
      request: {
        method: "privacy.update",
        patch: { field: "crashes", value: true },
        baseRevision: "0".repeat(64),
      },
    };
    expect(isUiMessage(valid)).toBe(true);
    for (const patch of [
      { field: "unknown", value: true },
      { field: "crashes", value: "true" },
      { field: "crashes", value: true, extra: true },
    ])
      expect(
        isUiMessage({ ...valid, request: { ...valid.request, patch } }),
      ).toBe(false);
    expect(
      isUiMessage({
        ...valid,
        request: { ...valid.request, baseRevision: "bad" },
      }),
    ).toBe(false);
    expect(
      isUiMessage({
        kind: "request",
        id: 1,
        request: { method: "mail.set", consent: true, source: "arbitrary" },
      }),
    ).toBe(false);
  });
});

describe("pilot closed boundary", () => {
  it("rejects invalid edits, revisions and future fields", () => {
    const fields = {
      publicName: "QA",
      description: "",
      country: "ES",
      simulators: ["LMU"],
      favoriteCar: "",
      favoriteTeam: "",
      photo: null,
    };
    const request = (fields: unknown, baseRevision = "1") => ({
      kind: "request",
      id: 1,
      request: { method: "pilot.save", fields, baseRevision },
    });
    expect(isUiMessage(request(fields))).toBe(true);
    for (const revision of ["-1", "01", "1.0", "18446744073709551616", ""])
      expect(isUiMessage(request(fields, revision))).toBe(false);
    for (const invalid of [
      { ...fields, country: "ZZ" },
      { ...fields, publicName: "a".repeat(pilotLimits.name + 1) },
      { ...fields, simulators: ["LMU", "LMU"] },
      { ...fields, extensions: {} },
      { ...fields, photo: "http://example.test/photo" },
    ])
      expect(isUiMessage(request(invalid))).toBe(false);
  });
});

describe("track customization projection", () => {
  it("validates the bounded count and its customized flag together", () => {
    for (const count of [0, 1, maxWidgetOverrides]) {
      expect(
        isSettings({
          ...settings,
          track: {
            ...settings.track,
            customWidgets: count,
            customized: count > 0,
          },
        }),
      ).toBe(true);
    }
    for (const count of [-1, 0.5, maxWidgetOverrides + 1, "1", null]) {
      expect(
        isSettings({
          ...settings,
          track: { ...settings.track, customWidgets: count },
        }),
      ).toBe(false);
    }
    expect(
      isSettings({
        ...settings,
        track: { ...settings.track, customWidgets: 1, customized: false },
      }),
    ).toBe(false);
    expect(
      isSettings({
        ...settings,
        track: { ...settings.track, customWidgets: 0, customized: true },
      }),
    ).toBe(false);
    const { customWidgets: _count, ...track } = settings.track;
    expect(isSettings({ ...settings, track })).toBe(false);
  });
});

it("requires an explicit boolean for the observed reporting configuration", () => {
  expect(isPrivacy({ ...privacy, reportingConfigured: true })).toBe(true);
  expect(isPrivacy({ ...privacy, reportingConfigured: false })).toBe(true);
  for (const value of [null, 1, "true", undefined])
    expect(isPrivacy({ ...privacy, reportingConfigured: value })).toBe(false);
  expect(isPrivacy({ ...privacy, apiKey: "forbidden" })).toBe(false);
});
