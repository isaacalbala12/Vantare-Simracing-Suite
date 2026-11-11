import { describe, expect, it } from "vitest";
import { topics } from "../src/contract/generated/contract";
import { isHostMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

describe("screen-owned mock sessions", () => {
  it.each(topics)("initializes only the subscribed topic %s", (topic) => {
    const reply = createMockHost("launcher-ready")({
      kind: "subscribe",
      topic,
    });
    expect(isHostMessage(reply)).toBe(true);
    expect(reply).toMatchObject({ kind: "event", event: { topic } });
  });
  it("keeps screen state independent between host sessions", () => {
    const first = createMockHost("launcher-ready");
    const second = createMockHost("launcher-ready");
    const before = first({
      kind: "request",
      id: 1,
      request: { method: "launcher.get" },
    });
    if (before?.kind !== "response" || before.result.method !== "launcher.get")
      throw new Error("Launcher did not return its view");
    const profile = before.result.value.profiles[0];
    expect(profile).toBeDefined();
    expect(
      first({
        kind: "request",
        id: 2,
        request: {
          method: "launcher.launch",
          profile: profile.id,
          baseRevision: before.result.value.revision,
        },
      }),
    ).toMatchObject({ kind: "response", result: { accepted: true } });
    expect(
      second({ kind: "request", id: 3, request: { method: "launcher.get" } }),
    ).toMatchObject({
      kind: "response",
      result: { value: { running: false } },
    });
    expect(
      first({ kind: "request", id: 4, request: { method: "launcher.get" } }),
    ).toMatchObject({ kind: "response", result: { value: { running: true } } });
  });
});
