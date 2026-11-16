import { describe, expect, it } from "vitest";
import type { HostToUi, StudioView } from "../src/contract/generated/contract";
import {
  previewErrors,
  previewLimits,
  previewTransparentPng,
} from "../src/contract/generated/preview";
import { isError, isReply, isRequest } from "../src/contract/modules/preview";
import { createMockHost } from "../src/mock/host";

const request = {
  method: "preview.render",
  target: { kind: "catalog", widget: "relative" },
  scene: "demo",
  scale: "1",
};
function host(scene: string) {
  const host = createMockHost(scene);
  host({ kind: "request", id: 1, request: { method: "studio.get" } });
  return host;
}
describe("Rune preview contract", () => {
  it("accepts references and rejects renderer files, settings, modes and scales", () => {
    expect(isRequest(request)).toBe(true);
    for (const change of [
      { path: "private" },
      { snapshot: {} },
      { sequence: [] },
      { settings: {} },
      { scene: "live" },
      { scale: 1 },
      { scale: "2" },
      { target: { kind: "catalog", widget: "car-damage-numbers" } },
      { target: { kind: "instance", id: "widget-1", baseRevision: "stale" } },
    ])
      expect(isRequest({ ...request, ...change })).toBe(false);
    expect(
      isRequest({
        ...request,
        target: {
          kind: "instance",
          id: "widget-1",
          baseRevision: "0".repeat(64),
        },
      }),
    ).toBe(true);
  });
  it("bounds image data and dimensions and accepts a transparent PNG", () => {
    const value = { width: 1, height: 1, pngBase64: previewTransparentPng };
    expect(isReply({ method: request.method, value })).toBe(true);
    for (const change of [
      { width: 0 },
      { height: previewLimits.axis + 1 },
      { pngBase64: "private path" },
      { pngBase64: `${previewTransparentPng}=` },
      { pngBase64: "A".repeat(Math.ceil(previewLimits.pngBytes / 3) * 4 + 4) },
      { path: "private" },
    ])
      expect(
        isReply({ method: request.method, value: { ...value, ...change } }),
      ).toBe(false);
  });
  it.each(previewErrors)("has a closed %s error", (reason) => {
    expect(isError({ kind: "previewFailed", reason })).toBe(true);
    expect(isError({ kind: "previewFailed", reason, detail: "private" })).toBe(
      false,
    );
  });
  it("mock returns one image or no-demo, never an accepted acknowledgement", () => {
    for (const [scene, result] of [
      ["preview-image", "response"],
      ["preview-noDemo", "failure"],
    ] as const) {
      const fixture = host(scene);
      const reply = fixture({ kind: "request", id: 42, request });
      expect(reply?.kind).toBe(result);
      if (result === "response")
        expect(reply).toMatchObject({
          id: 42,
          result: {
            method: "preview.render",
            value: { pngBase64: previewTransparentPng },
          },
        });
      else
        expect(reply).toMatchObject({
          id: 42,
          error: { kind: "previewFailed", reason: "noDemo" },
        });
    }
  });
  it("mock observes the current Studio revision and leaves the document unchanged", () => {
    const fixture = host("preview-image");
    const read = () => {
      const value = fixture({
        kind: "request",
        id: 2,
        request: { method: "studio.get" },
      }) as HostToUi;
      if (value.kind !== "response" || value.result.method !== "studio.get")
        throw Error("Studio fixture");
      return value.result.value as StudioView;
    };
    const before = read();
    const target = {
      kind: "instance",
      id: before.instances[0].id,
      baseRevision: before.revision,
    };
    expect(
      fixture({ kind: "request", id: 42, request: { ...request, target } }),
    ).toMatchObject({ kind: "response", id: 42 });
    expect(read()).toEqual(before);
    fixture({
      kind: "request",
      id: 3,
      request: {
        method: "studio.visibility",
        id: target.id,
        visible: false,
        baseRevision: before.revision,
      },
    });
    const edited = read();
    expect(edited.revision).not.toBe(before.revision);
    expect(
      fixture({ kind: "request", id: 42, request: { ...request, target } }),
    ).toMatchObject({ kind: "failure", error: { kind: "studioConflict" } });
    expect(read()).toEqual(edited);
  });
});
