import { expect, it } from "vitest";
import corpus from "../src/contract/generated/corpus/workshop.json";
import { workshopSceneIdCases } from "../src/contract/generated/workshop";
import { isRequest } from "../src/contract/modules/preview";
import { isReply, isSceneId } from "../src/contract/modules/workshop";
import { createMockHost } from "../src/mock/host";

type CatalogScene = Record<string, unknown>;
type Catalog = {
  method: string;
  widgets: { kind: string; scenes: CatalogScene[] }[];
};
const mock = createMockHost("preview-image");
function catalog(): Catalog {
  const reply = mock({
    kind: "request",
    id: 7,
    request: { method: "workshop.catalog" },
  });
  if (reply?.kind !== "response") throw Error("Workshop catalog");
  return structuredClone(reply.result) as unknown as Catalog;
}
function withScene(scene: CatalogScene): Record<string, unknown> {
  const value = catalog();
  return {
    method: value.method,
    widgets: value.widgets.map((widget, index) =>
      index === 0
        ? { ...widget, scenes: [scene, ...widget.scenes.slice(1)] }
        : widget,
    ),
  };
}
const captionedScene = {
  id: "standings-default",
  label: "Escena",
  frames: 3,
  frameMs: null,
  watchFor: null,
  captions: ["primero", "segundo", "tercero"],
};

const request = {
  method: "preview.render",
  target: {
    kind: "scene",
    widget: "standings",
    sceneId: "standings-default",
    frame: 0,
  },
  scene: "demo",
  scale: "1",
};
it("lists real Workshop scenes and renders one catalogued frame", () => {
  const host = createMockHost("preview-image");
  const reply = host({
    kind: "request",
    id: 1,
    request: { method: "workshop.catalog" },
  });
  expect(reply).toMatchObject({
    kind: "response",
    result: {
      method: "workshop.catalog",
      widgets: expect.arrayContaining([
        {
          kind: "standings",
          scenes: expect.arrayContaining([
            expect.objectContaining({
              id: "standings-default",
              frames: 1,
              frameMs: 1200,
            }),
          ]),
        },
      ]),
    },
  });
  if (reply?.kind !== "response") throw Error("Workshop catalog");
  expect(isReply(reply.result)).toBe(true);
  expect(host({ kind: "request", id: 2, request })).toMatchObject({
    kind: "response",
    result: { value: { width: 1, height: 1 } },
  });
  for (const target of [
    { ...request.target, frame: 1 },
    { ...request.target, widget: "relative" },
    { ...request.target, sceneId: "unknown" },
  ])
    expect(
      host({ kind: "request", id: 3, request: { ...request, target } }),
    ).toMatchObject({
      kind: "failure",
      error: { kind: "previewFailed", reason: "invalidInput" },
    });
});
it("validates frame references without accepting files or snapshots", () => {
  expect(isRequest(request)).toBe(true);
  for (const change of [
    { frame: -1 },
    { frame: 0.5 },
    { frame: 512 },
    { sceneId: "../standings" },
    { sceneId: "A" },
    { sceneId: "a".repeat(97) },
    { path: "private" },
    { snapshot: {} },
  ])
    expect(
      isRequest({ ...request, target: { ...request.target, ...change } }),
    ).toBe(false);
});

it.each(workshopSceneIdCases)("validates scene ID %j", (id, expected) => {
  expect(isSceneId(id)).toBe(expected);
});

it("accepts empty captions and one caption per frame", () => {
  expect(isReply(withScene({ ...captionedScene, captions: [] }))).toBe(true);
  expect(isReply(withScene(captionedScene))).toBe(true);
  expect(
    isReply(
      withScene({
        ...captionedScene,
        frames: 12,
        captions: Array.from(
          { length: 12 },
          (_, frame) => `Fotograma ${frame}`,
        ),
      }),
    ),
  ).toBe(true);
  expect(
    isReply(
      withScene({ ...captionedScene, captions: ["é".repeat(160), "b", "c"] }),
    ),
  ).toBe(true);
});

it("rejects captions outside the contract", () => {
  for (const captions of [
    ["primero"],
    ["a", "b", "c", "d"],
    Array.from({ length: 13 }, (_, frame) => `Fotograma ${frame}`),
    ["a", 1, "c"],
    ["a", 2, null],
    ["a", "b", "línea\n"],
    ["a", "b", "nulo\0"],
    ["a", "b", "tabulador\t"],
    ["a", "b", "x".repeat(161)],
  ])
    expect(isReply(withScene({ ...captionedScene, captions }))).toBe(false);
  expect(
    isReply(
      withScene({
        ...captionedScene,
        frames: 13,
        captions: Array.from(
          { length: 13 },
          (_, frame) => `Fotograma ${frame}`,
        ),
      }),
    ),
  ).toBe(false);
  expect(
    isReply(
      withScene({
        id: captionedScene.id,
        label: captionedScene.label,
        frames: captionedScene.frames,
        frameMs: captionedScene.frameMs,
        watchFor: captionedScene.watchFor,
      }),
    ),
  ).toBe(false);
  expect(isReply(withScene({ ...captionedScene, extra: true }))).toBe(false);
});

it("serves the generated catalog with exact frame captions", () => {
  const reply = catalog();
  expect(reply).toEqual(corpus.host[0].result);
  const scenes = reply.widgets.flatMap((widget) => widget.scenes);
  const scene = scenes.find((entry) => entry.id === "standings-vantare");
  expect(Array.isArray(scene?.captions) ? scene.captions.length : 0).toBe(7);
  expect(
    scenes.filter(
      (entry) => Array.isArray(entry.captions) && entry.captions.length === 0,
    ),
  ).not.toHaveLength(0);
  expect(isReply(reply)).toBe(true);
});
