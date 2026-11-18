import { expect, it } from "vitest";
import { workshopSceneIdCases } from "../src/contract/generated/workshop";
import { isRequest } from "../src/contract/modules/preview";
import { isReply, isSceneId } from "../src/contract/modules/workshop";
import { createMockHost } from "../src/mock/host";

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
