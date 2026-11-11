import { describe, expect, it, vi } from "vitest";
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
  it("sends selected paths only to Rust and serializes overlapping dialogs", async () => {
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
    const first = pick(1, renderer, () => true);
    await pick(2, renderer, () => true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenCalledWith({
      kind: "failure",
      id: 2,
      error: { kind: "busy" },
    });
    choose("D:/QA/chosen.exe");
    await first;
    expect(host).toHaveBeenCalledWith({
      kind: "pickedExecutable",
      id: 1,
      path: "D:/QA/chosen.exe",
    });
    expect(JSON.stringify(renderer.mock.calls)).not.toContain("chosen.exe");
  });
  it("does not deliver a dialog result after renderer disconnection", async () => {
    const host = vi.fn(),
      renderer = vi.fn();
    await executablePicker(async () => "D:/QA/chosen.exe", host)(
      1,
      renderer,
      () => false,
    );
    expect(host).not.toHaveBeenCalled();
    expect(renderer).not.toHaveBeenCalled();
    await executablePicker(async () => undefined, host)(
      2,
      renderer,
      () => true,
    );
    expect(host).toHaveBeenCalledWith({
      kind: "pickedExecutable",
      id: 2,
      path: null,
    });
  });
});
