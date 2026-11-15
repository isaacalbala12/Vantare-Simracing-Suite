import { expect, it } from "vitest";
import type {
  PreparedDuplicate,
  Request,
} from "../src/contract/generated/contract";
import { profileDuplicateCases } from "../src/contract/generated/launcher";
import { isProfileActionMethod } from "../src/contract/profile-actions";
import { isHostMessage, isUiMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

function setup() {
  const host = createMockHost("launcher-editor-ready");
  const snapshot = host({
    kind: "request",
    id: 1,
    request: { method: "launcher.get" },
  });
  if (
    snapshot?.kind !== "response" ||
    snapshot.result.method !== "launcher.get"
  )
    throw new Error("launcher");
  return { host, view: snapshot.result.value };
}
function prepare(
  host: ReturnType<typeof createMockHost>,
  id: string,
  baseRevision: string,
): PreparedDuplicate {
  const reply = host({
    kind: "request",
    id: 2,
    request: { method: "launcher.profile.prepareDuplicate", id, baseRevision },
  });
  if (
    reply?.kind !== "response" ||
    reply.result.method !== "launcher.profile.prepareDuplicate"
  )
    throw new Error("prepared");
  expect(isHostMessage(reply)).toBe(true);
  return reply.result.value;
}
it("consumes the native reset and repeated-step vectors as closed prepared values", () => {
  expect(profileDuplicateCases.length).toBeGreaterThan(0);
  for (const value of profileDuplicateCases) {
    expect(
      isHostMessage({
        kind: "response",
        id: 1,
        result: {
          method: "launcher.profile.prepareDuplicate",
          value: value.prepared,
        },
      }),
    ).toBe(true);
    expect(value.prepared.draft.favorite).toBe(false);
    expect(value.prepared.draft.hotkey).toBe("");
    expect(value.prepared.draft.startup).toBe(false);
    expect(value.prepared.draft.name).toBe(`${value.source.name} (copia)`);
    expect(value.prepared.draft.steps.map((step) => step.appId)).toEqual(
      value.source.steps.map((step) => step.appId),
    );
    expect(
      value.prepared.draft.steps.map((step) => step.hasCustomArguments),
    ).toEqual(value.source.steps.map((step) => step.hasCustomArguments));
    expect(JSON.stringify(value)).not.toContain("--qa-private-argument");
  }
  expect(isProfileActionMethod("launcher.profile.prepareDuplicate")).toBe(
    false,
  );
});
it("preparing or cancelling does not mutate the mock document, saving uses the existing editor", () => {
  const { host, view } = setup();
  const source = view.profiles[0];
  const prepared = prepare(host, source.id, view.revision);
  expect(prepared.draft.id).not.toBe(source.id);
  expect(
    host({ kind: "request", id: 3, request: { method: "launcher.get" } }),
  ).toMatchObject({ kind: "response", result: { value: view } });
  const request: Request = {
    method: "launcher.profile.save",
    baseRevision: prepared.baseRevision,
    draft: { ...prepared.draft, name: "Copia editada" },
  };
  expect(isUiMessage({ kind: "request", id: 4, request })).toBe(true);
  const saved = host({ kind: "request", id: 4, request });
  expect(saved).toMatchObject({
    kind: "response",
    result: { method: "launcher.profile.save" },
  });
  if (
    saved?.kind !== "response" ||
    saved.result.method !== "launcher.profile.save"
  )
    throw new Error("saved");
  expect(saved.result.value.profiles).toHaveLength(view.profiles.length + 1);
  expect(
    saved.result.value.profiles.find((profile) => profile.id === source.id),
  ).toEqual(source);
  expect(
    saved.result.value.profiles.find(
      (profile) => profile.id === prepared.draft.id,
    )?.name,
  ).toBe("Copia editada");
  expect(host({ kind: "request", id: 5, request })).toMatchObject({
    kind: "failure",
  });
});
it("an invalidated prepared revision is rejected without a fallback write", () => {
  const { host, view } = setup();
  const source = view.profiles[0];
  const prepared = prepare(host, source.id, view.revision);
  expect(
    host({
      kind: "request",
      id: 3,
      request: {
        method: "launcher.profile.favorite",
        id: source.id,
        favorite: !source.favorite,
        baseRevision: view.revision,
      },
    }),
  ).toMatchObject({ kind: "response" });
  const before = host({
    kind: "request",
    id: 4,
    request: { method: "launcher.get" },
  });
  expect(
    host({
      kind: "request",
      id: 5,
      request: {
        method: "launcher.profile.save",
        draft: prepared.draft,
        baseRevision: prepared.baseRevision,
      },
    }),
  ).toMatchObject({ kind: "failure", error: { kind: "rejected" } });
  const after = host({
    kind: "request",
    id: 4,
    request: { method: "launcher.get" },
  });
  expect(after).toEqual(before);
  expect(
    host({
      kind: "request",
      id: 6,
      request: {
        method: "launcher.profile.prepareDuplicate",
        id: source.id,
        baseRevision: view.revision,
      },
    }),
  ).toMatchObject({ kind: "failure", error: { kind: "rejected" } });
});
it("another preparation revokes the first draft capabilities", () => {
  const { host, view } = setup();
  const source = view.profiles[0];
  const first = prepare(host, source.id, view.revision);
  const second = prepare(host, source.id, view.revision);
  expect(first.draft.id).not.toBe(second.draft.id);
  expect(
    host({
      kind: "request",
      id: 4,
      request: {
        method: "launcher.profile.save",
        draft: first.draft,
        baseRevision: first.baseRevision,
      },
    }),
  ).toMatchObject({ kind: "failure", error: { kind: "denied" } });
  expect(
    host({ kind: "request", id: 5, request: { method: "launcher.get" } }),
  ).toMatchObject({ kind: "response", result: { value: view } });
});
it("applies the native reset vector even when the original enables every copied option", () => {
  const { host, view } = setup();
  const vector = profileDuplicateCases[0];
  const read = host({
    kind: "request",
    id: 10,
    request: { method: "launcher.profile.get", id: view.profiles[0].id },
  });
  if (
    read?.kind !== "response" ||
    read.result.method !== "launcher.profile.get"
  )
    throw new Error("source editor");
  const source = read.result.value;
  const edited = {
    ...source.draft,
    favorite: vector.source.favorite,
    hotkey: vector.source.hotkey,
    startup: vector.source.startup,
  };
  const saved = host({
    kind: "request",
    id: 11,
    request: {
      method: "launcher.profile.save",
      draft: edited,
      baseRevision: source.revision,
    },
  });
  if (
    saved?.kind !== "response" ||
    saved.result.method !== "launcher.profile.save"
  )
    throw new Error("source fixture saved");
  const prepared = prepare(
    host,
    view.profiles[0].id,
    saved.result.value.revision,
  );
  expect({
    favorite: prepared.draft.favorite,
    hotkey: prepared.draft.hotkey,
    startup: prepared.draft.startup,
  }).toEqual({
    favorite: vector.prepared.draft.favorite,
    hotkey: vector.prepared.draft.hotkey,
    startup: vector.prepared.draft.startup,
  });
  expect(
    host({ kind: "request", id: 12, request: { method: "launcher.get" } }),
  ).toMatchObject({ kind: "response", result: { value: saved.result.value } });
});
