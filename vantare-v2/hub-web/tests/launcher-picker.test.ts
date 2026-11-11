import { describe, expect, it, vi } from "vitest";
import { isAppEditor } from "../src/contract/apps-validation";
import { accountLimits } from "../src/contract/generated/account";
import type { UiToHost } from "../src/contract/generated/contract";
import {
  launcherLimits,
  launcherPickLifetimeSeconds,
} from "../src/contract/generated/contract";
import { isReply, isRequest } from "../src/contract/modules/launcher";
import { isUiMessage } from "../src/contract/validation";
import {
  executablePicker,
  nextPickerRequestId,
} from "../src/main/launcher-picker";
import { isRendererMessage } from "../src/main/security";

type Guarded<T> = T extends (value: unknown) => value is infer V ? V : never;
const excludesTrustedSelection: Extract<
  Guarded<typeof isRendererMessage>,
  Extract<UiToHost, { kind: "pickedExecutable" }>
> extends never
  ? true
  : false = true;
describe("executable picker boundary", () => {
  it("bounds the private-argument affected-profile count from Rust", () => {
    const editor = {
      revision: "0".repeat(64),
      draft: { id: "obs", name: "OBS", favorite: false, useDiscovery: false },
      hasExecutable: true,
      hasCustomArguments: true,
      customProfiles: 1,
    };
    expect(isAppEditor(editor)).toBe(true);
    for (const count of [-1, launcherLimits.profiles + 1, "1", null])
      expect(isAppEditor({ ...editor, customProfiles: count })).toBe(false);
    const { customProfiles: _count, ...missing } = editor;
    expect(isAppEditor(missing)).toBe(false);
  });
  it("excludes trusted selections in the type predicate and sends the app destination to Rust", () => {
    expect(excludesTrustedSelection).toBe(true);
    const host = vi.fn();
    executablePicker(async () => undefined, host).request(
      7,
      "obs",
      vi.fn(),
      () => true,
    );
    expect(host).toHaveBeenCalledWith({
      kind: "request",
      id: 0x80000000,
      request: { method: "launcher.app.pick", id: "obs" },
    });
    expect(
      isRendererMessage({
        kind: "request",
        id: 8,
        request: {
          method: "launcher.app.pick",
          id: "obs",
          path: "D:/QA/chosen.exe",
        },
      }),
    ).toBe(false);
  });
  it("rejects unregistered methods even at the screen validator", () => {
    expect(isRequest({ method: "pickedExecutable" })).toBe(false);
    expect(isReply({ method: "pickedExecutable", accepted: true })).toBe(false);
  });
  it("accepts the trusted main-process envelope and denies it from the renderer", () => {
    const picked = {
      kind: "pickedExecutable",
      id: 1,
      path: "D:/QA/chosen.exe",
    };
    expect(isUiMessage(picked)).toBe(true);
    expect(isRendererMessage(picked)).toBe(false);
    expect(
      isRendererMessage({
        kind: "request",
        id: 1,
        request: { method: "pickedExecutable", path: picked.path },
      }),
    ).toBe(false);
    expect(
      isRendererMessage({
        kind: "request",
        id: 1,
        request: { method: "launcher.app.pick", path: picked.path },
      }),
    ).toBe(false);
    expect(
      isUiMessage({
        kind: "request",
        id: 1,
        request: {
          method: "launcher.app.save",
          baseRevision: "0".repeat(64),
          pickToken: null,
          draft: {
            id: "obs",
            name: "OBS",
            favorite: false,
            useDiscovery: false,
            args: ["--renderer-cmd-prefix=untrusted"],
          },
        },
      }),
    ).toBe(false);
    expect(
      isRendererMessage({
        kind: "request",
        id: 1,
        request: { method: "launcher.app.pick", id: null },
      }),
    ).toBe(true);
  });

  const ack = (id: number) => ({
    kind: "response" as const,
    id,
    result: { method: "launcher.app.pick" as const, value: null },
  });
  it("opens once after its internal acknowledgement and translates the final response", async () => {
    let finish: (path: string | undefined) => void = () => {};
    const open = vi.fn(
      () =>
        new Promise<string | undefined>((resolve) => {
          finish = resolve;
        }),
    );
    const host = vi.fn(),
      renderer = vi.fn();
    const pick = executablePicker(open, host);
    pick.request(7, "obs", renderer, () => true);
    expect(host.mock.calls[0][0]).toEqual({
      kind: "request",
      id: 0x80000000,
      request: { method: "launcher.app.pick", id: "obs" },
    });
    expect(pick.receive(ack(7))).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(pick.receive(ack(0x80000000))).toBe(true);
    pick.receive(ack(0x80000000));
    expect(open).toHaveBeenCalledTimes(1);
    pick.request(8, null, renderer, () => true);
    expect(renderer).toHaveBeenCalledWith({
      kind: "failure",
      id: 8,
      error: { kind: "busy" },
    });
    finish("D:/private/chosen.exe");
    await Promise.resolve();
    expect(host).toHaveBeenLastCalledWith({
      kind: "pickedExecutable",
      id: 0x80000000,
      path: "D:/private/chosen.exe",
    });
    const result = {
      kind: "response" as const,
      id: 0x80000000,
      result: {
        method: "launcher.app.pick" as const,
        value: {
          token: "a".repeat(64),
          name: "chosen",
          fileName: "chosen.exe",
        },
      },
    };
    expect(pick.receive(result)).toBe(true);
    expect(renderer).toHaveBeenLastCalledWith({ ...result, id: 7 });
    expect(JSON.stringify(renderer.mock.calls)).not.toContain("private");
    pick.receive(result);
    expect(
      renderer.mock.calls.filter(([v]) => v.kind === "response"),
    ).toHaveLength(1);
  });
  it("reserves internal ids from the renderer and translates host failures", () => {
    const host = vi.fn(),
      renderer = vi.fn();
    const pick = executablePicker(async () => undefined, host);
    expect(
      isRendererMessage({
        kind: "request",
        id: 0x80000000,
        request: { method: "launcher.app.pick", id: null },
      }),
    ).toBe(false);
    pick.request(9, null, renderer, () => true);
    expect(
      pick.receive({
        kind: "failure",
        id: 0x80000000,
        error: { kind: "denied" },
      }),
    ).toBe(true);
    expect(renderer).toHaveBeenCalledWith({
      kind: "failure",
      id: 9,
      error: { kind: "denied" },
    });
  });
  it("cools down for 1500 ms after cancellation and ignores a late dialog result", async () => {
    let now = 0;
    let finish: (path: string | undefined) => void = () => {};
    const host = vi.fn(),
      renderer = vi.fn();
    const pick = executablePicker(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      host,
      () => now,
    );
    pick.request(1, null, renderer, () => true);
    pick.receive(ack(0x80000000));
    pick.cancel();
    pick.cancel();
    finish("D:/private/late.exe");
    await Promise.resolve();
    expect(
      host.mock.calls.filter(([v]) => v.kind === "pickedExecutable"),
    ).toEqual([[{ kind: "pickedExecutable", id: 0x80000000, path: null }]]);
    now = 1499;
    pick.request(2, null, renderer, () => true);
    expect(renderer).toHaveBeenLastCalledWith({
      kind: "failure",
      id: 2,
      error: { kind: "busy" },
    });
    now = 1500;
    pick.request(3, null, renderer, () => true);
    expect(host).toHaveBeenLastCalledWith({
      kind: "request",
      id: 0x80000001,
      request: { method: "launcher.app.pick", id: null },
    });
  });
  it("cools down after the native dialog cancels and rejects expired or disconnected selections", async () => {
    let now = 0,
      connected = true;
    let finish: (path: string | undefined) => void = () => {};
    const host = vi.fn(),
      renderer = vi.fn(),
      open = vi.fn(
        () =>
          new Promise<string | undefined>((resolve) => {
            finish = resolve;
          }),
      );
    const pick = executablePicker(open, host, () => now);
    pick.request(1, null, renderer, () => connected);
    now = launcherPickLifetimeSeconds * 1000;
    pick.receive(ack(0x80000000));
    expect(open).not.toHaveBeenCalled();
    now += 1500;
    pick.request(2, null, renderer, () => connected);
    pick.receive(ack(0x80000001));
    connected = false;
    finish("D:/private/chosen.exe");
    await Promise.resolve();
    expect(host).toHaveBeenLastCalledWith({
      kind: "pickedExecutable",
      id: 0x80000001,
      path: null,
    });
    expect(renderer).not.toHaveBeenCalled();
    connected = true;
    now += 1500;
    pick.request(3, null, renderer, () => connected);
    pick.receive(ack(0x80000002));
    finish(undefined);
    await Promise.resolve();
    pick.receive(ack(0x80000002));
    pick.request(4, null, renderer, () => connected);
    expect(renderer).toHaveBeenLastCalledWith({
      kind: "failure",
      id: 4,
      error: { kind: "busy" },
    });
  });
});

it("never allocates the host background request id when the picker wraps", () => {
  expect(nextPickerRequestId(accountLimits.backgroundId - 2)).toBe(
    accountLimits.backgroundId - 1,
  );
  expect(nextPickerRequestId(accountLimits.backgroundId - 1)).toBe(0x80000000);
});
