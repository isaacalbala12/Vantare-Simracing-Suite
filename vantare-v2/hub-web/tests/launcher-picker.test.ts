import { describe, expect, it, vi } from "vitest";
import { launcherPickLifetimeSeconds } from "../src/contract/generated/contract";
import { isUiMessage } from "../src/contract/validation";
import { executablePicker } from "../src/main/launcher-picker";
import { isRendererMessage } from "../src/main/security";

describe("executable picker boundary", () => {
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
        request: { method: "launcher.app.pick" },
      }),
    ).toBe(true);
  });
  const ack = (id: number) => ({
    kind: "response" as const,
    id,
    result: { method: "launcher.app.pick" as const, value: null },
  });
  it("waits for the host's matching request acknowledgement and opens once", async () => {
    let choose: (path: string | undefined) => void = () => {};
    const open = vi.fn(
      () =>
        new Promise<string | undefined>((resolve) => {
          choose = resolve;
        }),
    );
    const host = vi.fn(),
      renderer = vi.fn();
    const pick = executablePicker(open, host);
    expect(pick.receive(ack(1))).toBe(false);
    pick.request(1, renderer, () => true);
    expect(host).toHaveBeenCalledWith({
      kind: "request",
      id: 1,
      request: { method: "launcher.app.pick" },
    });
    expect(open).not.toHaveBeenCalled();
    expect(pick.receive(ack(2))).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(pick.receive(ack(1))).toBe(true);
    expect(pick.receive(ack(1))).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    pick.request(2, renderer, () => true);
    expect(renderer).toHaveBeenCalledWith({
      kind: "failure",
      id: 2,
      error: { kind: "busy" },
    });
    choose("D:/QA/chosen.exe");
    await Promise.resolve();
    expect(host).toHaveBeenCalledWith({
      kind: "pickedExecutable",
      id: 1,
      path: "D:/QA/chosen.exe",
    });
    expect(JSON.stringify(renderer.mock.calls)).not.toContain("chosen.exe");
    expect(pick.receive(ack(1))).toBe(false);
    expect(pick.receive(ack(1))).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });
  it("rejects stale acknowledgements and results after disconnection or expiry", async () => {
    let now = 0,
      connected = true;
    const host = vi.fn(),
      renderer = vi.fn();
    let finish: (path: string) => void = () => {};
    const open = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const pick = executablePicker(open, host, () => now);
    pick.request(1, renderer, () => connected);
    now = launcherPickLifetimeSeconds * 1000;
    expect(pick.receive(ack(1))).toBe(true);
    expect(open).not.toHaveBeenCalled();
    pick.request(2, renderer, () => connected);
    pick.receive(ack(2));
    connected = false;
    finish("D:/QA/chosen.exe");
    await Promise.resolve();
    expect(
      host.mock.calls.filter(
        ([message]) => message.path === "D:/QA/chosen.exe",
      ),
    ).toHaveLength(0);
    expect(host).toHaveBeenCalledWith({
      kind: "pickedExecutable",
      id: 2,
      path: null,
    });
    expect(renderer).not.toHaveBeenCalled();
  });
  it("cancels a dialog once and ignores a late result", async () => {
    let finish: (path: string) => void = () => {};
    const host = vi.fn();
    const pick = executablePicker(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
      host,
    );
    pick.request(7, vi.fn(), () => true);
    pick.receive(ack(7));
    pick.cancel();
    pick.cancel();
    finish("D:/QA/chosen.exe");
    await Promise.resolve();
    expect(
      host.mock.calls.filter(
        ([message]) => message.kind === "pickedExecutable",
      ),
    ).toEqual([[{ kind: "pickedExecutable", id: 7, path: null }]]);
  });
});
