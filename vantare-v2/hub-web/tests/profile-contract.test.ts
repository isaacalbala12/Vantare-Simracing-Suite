import { describe, expect, it } from "vitest";
import fixture from "../fixtures/launcher-editor.json";
import corpus from "../src/contract/generated/corpus.json";
import { isHostMessage, isUiMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

describe("profile wire", () => {
  it("uses the strict Rust draft and rejects executable fields and invalid policies", () => {
    expect(
      isHostMessage({
        kind: "response",
        id: 1,
        result: { method: "launcher.profile.get", value: fixture },
      }),
    ).toBe(true);
    const request = {
      method: "launcher.profile.save",
      draft: fixture.draft,
      baseRevision: fixture.revision,
    };
    const wire = (request: unknown) => ({ kind: "request", id: 1, request });
    expect(isUiMessage(wire(request))).toBe(true);
    expect(
      isUiMessage(wire({ ...request, executable: "D:/QA/not-accepted.exe" })),
    ).toBe(false);
    expect(
      isUiMessage(
        wire({
          ...request,
          draft: {
            ...fixture.draft,
            policy: { ...fixture.draft.policy, alreadyRunning: "shell" },
          },
        }),
      ),
    ).toBe(false);
  });
  it("reserves a new ID in the host so a retry cannot create a second profile", () => {
    const host = createMockHost("launcher-editor-ready");
    const opened = host({
      kind: "request",
      id: 1,
      request: { method: "launcher.profile.get", id: null },
    });
    if (
      opened?.kind !== "response" ||
      opened.result.method !== "launcher.profile.get"
    )
      throw new Error("editor reply");
    const draft = {
      ...opened.result.value.draft,
      steps: [
        { key: null, appId: "lmu", delaySeconds: 0, hasCustomArguments: false },
      ],
    };
    const saved = host({
      kind: "request",
      id: 2,
      request: {
        method: "launcher.profile.save",
        draft,
        baseRevision: opened.result.value.revision,
      },
    });
    if (
      saved?.kind !== "response" ||
      saved.result.method !== "launcher.profile.save"
    )
      throw new Error("save reply");
    const retried = host({
      kind: "request",
      id: 3,
      request: {
        method: "launcher.profile.save",
        draft,
        baseRevision: saved.result.value.revision,
      },
    });
    expect(retried).toEqual({
      kind: "failure",
      id: 3,
      error: { kind: "denied" },
    });
    const refreshed = host({
      kind: "request",
      id: 4,
      request: { method: "launcher.profile.get", id: draft.id },
    });
    if (
      refreshed?.kind !== "response" ||
      refreshed.result.method !== "launcher.profile.get"
    )
      throw new Error("fresh read");
    const savedAgain = host({
      kind: "request",
      id: 5,
      request: {
        method: "launcher.profile.save",
        draft: refreshed.result.value.draft,
        baseRevision: refreshed.result.value.revision,
      },
    });
    if (
      savedAgain?.kind !== "response" ||
      savedAgain.result.method !== "launcher.profile.save"
    )
      throw new Error("save after reread");
    expect(
      savedAgain.result.value.profiles.filter(
        (profile) => profile.id === draft.id,
      ),
    ).toHaveLength(1);
  });
});

it("rejects renderer arguments on profile steps", () => {
  const draft = structuredClone(fixture.draft);
  const wire = {
    kind: "request",
    id: 1,
    request: {
      method: "launcher.profile.save",
      baseRevision: fixture.revision,
      draft: {
        ...draft,
        steps: [
          {
            key: null,
            appId: "lmu",
            delaySeconds: 0,
            hasCustomArguments: false,
            argsOverride: ["--renderer-cmd-prefix=untrusted"],
          },
        ],
      },
    },
  };
  expect(isUiMessage(wire)).toBe(false);
});

it("requires a nullable key or exactly 64 lowercase hex characters in both directions", () => {
  const check = (step: Record<string, unknown>) => {
    const draft = { ...fixture.draft, steps: [step] };
    return [
      isUiMessage({
        kind: "request",
        id: 1,
        request: {
          method: "launcher.profile.save",
          draft,
          baseRevision: fixture.revision,
        },
      }),
      isHostMessage({
        kind: "response",
        id: 1,
        result: {
          method: "launcher.profile.get",
          value: { ...fixture, draft },
        },
      }),
    ];
  };
  const step = {
    key: "a".repeat(64),
    appId: "lmu",
    delaySeconds: 0,
    hasCustomArguments: true,
  };
  expect(check(step)).toEqual([true, true]);
  expect(check({ ...step, key: null })).toEqual([true, true]);
  for (const key of ["A".repeat(64), "a".repeat(63), "g".repeat(64), 7])
    expect(check({ ...step, key })).toEqual([false, false]);
  const { key: _key, ...missing } = step;
  expect(check(missing)).toEqual([false, false]);
});

it("includes and validates a Rust profile.get corpus sample with issued keys", () => {
  const samples: unknown[] = corpus.host;
  const keyed = samples
    .filter(isHostMessage)
    .find(
      (message) =>
        message.kind === "response" &&
        message.result.method === "launcher.profile.get" &&
        message.result.value.draft.steps.some((step) => step.key !== null),
    );
  expect(keyed).toBeDefined();
});

it("includes a Rust profile.save UI sample with a non-null issued-shaped key", () => {
  const samples: unknown[] = corpus.ui;
  expect(
    samples
      .filter(isUiMessage)
      .find(
        (message) =>
          message.kind === "request" &&
          message.request.method === "launcher.profile.save" &&
          message.request.draft.steps.some((step) => step.key !== null),
      ),
  ).toBeDefined();
});
