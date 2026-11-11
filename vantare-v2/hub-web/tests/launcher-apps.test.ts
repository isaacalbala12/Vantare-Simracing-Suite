import { describe, expect, it } from "vitest";
import { isUiMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

type Host = ReturnType<typeof createMockHost>;
const send = (host: Host, method: string, fields = {}) =>
  host({ kind: "request", id: 1, request: { method, ...fields } });
function catalog(host: Host) {
  const reply = send(host, "launcher.catalog");
  if (reply?.kind !== "response" || reply.result.method !== "launcher.catalog")
    throw new Error("Expected catalog response");
  return reply.result.value;
}

describe("application catalog contract", () => {
  it("rejects renderer paths and protects stale writes without changing the catalog", () => {
    const host = createMockHost("launcher-aplicaciones");
    const before = catalog(host);
    expect(before.apps).toHaveLength(8);
    for (const forbidden of ["executable", "args", "Users", ":/"])
      expect(JSON.stringify(before)).not.toContain(forbidden);
    const draft = {
      id: null,
      name: "QA",
      favorite: false,
      useDiscovery: false,
    };
    expect(
      isUiMessage({
        kind: "request",
        id: 1,
        request: {
          method: "launcher.app.save",
          draft: { ...draft, executable: "D:/QA/app.exe" },
          pickToken: null,
          baseRevision: before.revision,
        },
      }),
    ).toBe(false);
    expect(
      isUiMessage({
        kind: "request",
        id: 1,
        request: {
          method: "launcher.app.save",
          draft: { ...draft, args: ["--renderer-cmd-prefix=untrusted"] },
          pickToken: null,
          baseRevision: before.revision,
        },
      }),
    ).toBe(false);
    expect(
      send(host, "launcher.app.favorite", {
        id: "lmu",
        favorite: true,
        baseRevision: "f".repeat(64),
      }),
    ).toMatchObject({ kind: "failure", error: { kind: "launcherConflict" } });
    expect(catalog(host)).toEqual(before);
  });
  it("preserves a picked selection after conflict and consumes it after a successful explicit retry", () => {
    const host = createMockHost("launcher-aplicaciones");
    const ack = send(host, "launcher.app.pick", { id: null });
    expect(ack).toMatchObject({
      kind: "response",
      result: { method: "launcher.app.pick", value: null },
    });
    expect(
      host({ kind: "pickedExecutable", id: 2, path: "D:/qa/chosen.exe" }),
    ).toMatchObject({ kind: "failure", error: { kind: "denied" } });
    const selected = host({
      kind: "pickedExecutable",
      id: 1,
      path: "D:/qa/chosen.exe",
    });
    expect(
      host({ kind: "pickedExecutable", id: 1, path: "D:/qa/chosen.exe" }),
    ).toMatchObject({ kind: "failure", error: { kind: "denied" } });
    if (
      selected?.kind !== "response" ||
      selected.result.method !== "launcher.app.pick" ||
      !selected.result.value
    )
      throw new Error("Expected selection");
    const draft = {
      id: null,
      name: "Nueva QA",
      favorite: true,
      useDiscovery: false,
    };
    const fields = {
      draft,
      pickToken: selected.result.value.token,
      baseRevision: "f".repeat(64),
    };
    expect(send(host, "launcher.app.save", fields)).toMatchObject({
      kind: "failure",
      error: { kind: "launcherConflict" },
    });
    expect(catalog(host).apps).toHaveLength(8);
    expect(
      send(host, "launcher.app.save", {
        ...fields,
        baseRevision: catalog(host).revision,
      }),
    ).toMatchObject({ kind: "response" });
    expect(
      catalog(host).apps.filter((app) => app.name === draft.name),
    ).toHaveLength(1);
    expect(
      send(host, "launcher.app.save", {
        ...fields,
        baseRevision: catalog(host).revision,
      }),
    ).toMatchObject({ kind: "failure", error: { kind: "denied" } });
    expect(catalog(host).apps).toHaveLength(9);
  });
  it("keeps official applications and removes only an unused custom catalog entry", () => {
    const host = createMockHost("launcher-aplicaciones");
    const before = catalog(host);
    expect(
      send(host, "launcher.app.remove", {
        id: "lmu",
        baseRevision: before.revision,
      }),
    ).toMatchObject({ kind: "failure", error: { kind: "denied" } });
    expect(catalog(host)).toEqual(before);
    expect(
      send(host, "launcher.app.remove", {
        id: "custom:vantare",
        baseRevision: before.revision,
      }),
    ).toMatchObject({ kind: "response" });
    expect(catalog(host).apps.some((app) => app.id === "custom:vantare")).toBe(
      false,
    );
    expect(catalog(host).apps).toHaveLength(7);
  });
});
