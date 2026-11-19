import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { HostToUi } from "../src/contract/generated/contract";
import {
  strategyPickCooldownMs,
  strategyPickLifetimeSeconds,
} from "../src/contract/generated/strategy";
import { executablePicker, internalIds } from "../src/main/launcher-picker";
import { isRendererMessage } from "../src/main/security";
import { strategyFilePicker } from "../src/main/strategy-file-picker";

const revision = "a".repeat(64);
const view = { revision } as never;
const ack = (id: number): HostToUi => ({
  kind: "response",
  id,
  result: { method: "strategy.pickFile", value: view },
});
const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("strategy file picker in the main process", () => {
  it("asks the host first, opens the right dialog once, and hands over only the result", async () => {
    let finish: (path: string | undefined) => void = () => {};
    const open = vi.fn(
      (_mode: string) =>
        new Promise<string | undefined>((resolve) => {
          finish = resolve;
        }),
    );
    const host = vi.fn(),
      renderer = vi.fn();
    const pick = strategyFilePicker(open, host);
    pick.request(7, "saveAs", revision, renderer, () => true);
    expect(host).toHaveBeenCalledWith({
      kind: "request",
      id: 0x80000000,
      request: { method: "strategy.pickFile", mode: "saveAs", revision },
    });
    // not its id, or not its turn: nothing opens
    expect(pick.receive(ack(7))).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(pick.receive(ack(0x80000000))).toBe(true);
    pick.receive(ack(0x80000000));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("saveAs");
    // a second request while the dialog is open is busy
    pick.request(8, "open", revision, renderer, () => true);
    expect(renderer).toHaveBeenCalledWith({
      kind: "failure",
      id: 8,
      error: { kind: "busy" },
    });
    finish("D:/private/carreras.json");
    await wait();
    expect(host).toHaveBeenLastCalledWith({
      kind: "pickedStrategyFile",
      id: 0x80000000,
      path: "D:/private/carreras.json",
    });
    const result = ack(0x80000000);
    expect(pick.receive(result)).toBe(true);
    expect(renderer).toHaveBeenLastCalledWith({ ...result, id: 7 });
    // the renderer saw its own id and never the path
    expect(JSON.stringify(renderer.mock.calls)).not.toContain("private");
    pick.receive(result);
    expect(
      renderer.mock.calls.filter(([message]) => message.kind === "response"),
    ).toHaveLength(1);
  });

  it("opens the open dialog for open", async () => {
    const open = vi.fn(async () => undefined);
    const host = vi.fn();
    const pick = strategyFilePicker(open, host);
    pick.request(1, "open", revision, vi.fn(), () => true);
    pick.receive(ack(0x80000000));
    expect(open).toHaveBeenCalledWith("open");
  });

  it("forwards a host failure to the renderer with its own id", () => {
    const host = vi.fn(),
      renderer = vi.fn();
    const pick = strategyFilePicker(async () => undefined, host);
    pick.request(9, "open", revision, renderer, () => true);
    expect(
      pick.receive({
        kind: "failure",
        id: 0x80000000,
        error: { kind: "strategyDirty" },
      }),
    ).toBe(true);
    expect(renderer).toHaveBeenCalledWith({
      kind: "failure",
      id: 9,
      error: { kind: "strategyDirty" },
    });
    // the final failure of a dialog that did open is forwarded too
    pick.request(10, "saveAs", revision, renderer, () => true);
    pick.receive(ack(0x80000001));
    pick.receive({
      kind: "failure",
      id: 0x80000001,
      error: { kind: "strategyTargetExists" },
    });
    expect(renderer).toHaveBeenLastCalledWith({
      kind: "failure",
      id: 10,
      error: { kind: "strategyTargetExists" },
    });
  });

  it("cools down after a cancellation and tells the host the ticket is void", async () => {
    let now = 0;
    let finish: (path: string | undefined) => void = () => {};
    const host = vi.fn(),
      renderer = vi.fn();
    const pick = strategyFilePicker(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      host,
      () => now,
    );
    pick.request(1, "open", revision, renderer, () => true);
    pick.receive(ack(0x80000000));
    pick.cancel();
    pick.cancel();
    finish("D:/private/late.json");
    await wait();
    expect(
      host.mock.calls.filter(([m]) => m.kind === "pickedStrategyFile"),
    ).toEqual([[{ kind: "pickedStrategyFile", id: 0x80000000, path: null }]]);
    now = strategyPickCooldownMs - 1;
    pick.request(2, "open", revision, renderer, () => true);
    expect(renderer).toHaveBeenLastCalledWith({
      kind: "failure",
      id: 2,
      error: { kind: "busy" },
    });
    now = strategyPickCooldownMs;
    pick.request(3, "open", revision, renderer, () => true);
    expect(host).toHaveBeenLastCalledWith({
      kind: "request",
      id: 0x80000001,
      request: { method: "strategy.pickFile", mode: "open", revision },
    });
  });

  it("lets a ticket live 120 s and sends nothing for a disconnected renderer", async () => {
    expect(strategyPickLifetimeSeconds).toBe(120);
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
    const pick = strategyFilePicker(open, host, () => now);
    pick.request(1, "open", revision, renderer, () => connected);
    now = strategyPickLifetimeSeconds * 1000;
    pick.receive(ack(0x80000000));
    expect(open).not.toHaveBeenCalled();
    expect(host).toHaveBeenLastCalledWith({
      kind: "pickedStrategyFile",
      id: 0x80000000,
      path: null,
    });
    // the renderer that waits is told the ticket expired: it never waits for nothing
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenLastCalledWith({
      kind: "failure",
      id: 1,
      error: { kind: "strategyPickExpired" },
    });
    now += strategyPickCooldownMs;
    pick.request(2, "open", revision, renderer, () => connected);
    pick.receive(ack(0x80000001));
    connected = false;
    finish("D:/private/chosen.json");
    await wait();
    expect(host).toHaveBeenLastCalledWith({
      kind: "pickedStrategyFile",
      id: 0x80000001,
      path: null,
    });
    // a renderer that is gone is told nothing
    expect(renderer).toHaveBeenCalledTimes(1);
  });

  it("tells the renderer the ticket expired when the dialog closes after it", async () => {
    let now = 0;
    let finish: (path: string | undefined) => void = () => {};
    const host = vi.fn(),
      renderer = vi.fn(),
      open = vi.fn(
        () =>
          new Promise<string | undefined>((resolve) => {
            finish = resolve;
          }),
      );
    const pick = strategyFilePicker(open, host, () => now);
    pick.request(4, "saveAs", revision, renderer, () => true);
    pick.receive(ack(0x80000000));
    now = strategyPickLifetimeSeconds * 1000;
    finish("D:/private/late.json");
    await wait();
    // the late path is not handed over: the ticket is void
    expect(host).toHaveBeenLastCalledWith({
      kind: "pickedStrategyFile",
      id: 0x80000000,
      path: null,
    });
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenLastCalledWith({
      kind: "failure",
      id: 4,
      error: { kind: "strategyPickExpired" },
    });
    expect(JSON.stringify(renderer.mock.calls)).not.toContain("private");
  });

  it("answers a dialog the user closes with a null path and then cools down", async () => {
    const now = 0;
    const host = vi.fn(),
      renderer = vi.fn();
    const pick = strategyFilePicker(
      async () => undefined,
      host,
      () => now,
    );
    pick.request(1, "open", revision, renderer, () => true);
    pick.receive(ack(0x80000000));
    await wait();
    expect(host).toHaveBeenLastCalledWith({
      kind: "pickedStrategyFile",
      id: 0x80000000,
      path: null,
    });
    pick.receive(ack(0x80000000));
    expect(renderer).toHaveBeenLastCalledWith({ ...ack(1), id: 1 });
    pick.request(2, "open", revision, renderer, () => true);
    expect(renderer).toHaveBeenLastCalledWith({
      kind: "failure",
      id: 2,
      error: { kind: "busy" },
    });
  });

  it("reports an unavailable dialog as a plain io failure", async () => {
    const host = vi.fn(),
      renderer = vi.fn();
    const pick = strategyFilePicker(async () => {
      throw new Error("no window");
    }, host);
    pick.request(5, "open", revision, renderer, () => true);
    pick.receive(ack(0x80000000));
    await wait();
    expect(renderer).toHaveBeenCalledWith({
      kind: "failure",
      id: 5,
      error: { kind: "io" },
    });
    expect(host).toHaveBeenLastCalledWith({
      kind: "pickedStrategyFile",
      id: 0x80000000,
      path: null,
    });
  });

  it("never sends a path the contract would reject", async () => {
    const host = vi.fn(),
      renderer = vi.fn();
    const pick = strategyFilePicker(async () => "x".repeat(40000), host);
    pick.request(5, "open", revision, renderer, () => true);
    pick.receive(ack(0x80000000));
    await wait();
    expect(
      host.mock.calls.some(
        ([m]) => m.kind === "pickedStrategyFile" && m.path !== null,
      ),
    ).toBe(false);
  });
});

describe("two pickers in one window", () => {
  it("draw their internal ids from one sequence and do not take each other's messages", () => {
    const ids = internalIds();
    const host = vi.fn(),
      renderer = vi.fn();
    const strategy = strategyFilePicker(
      async () => undefined,
      host,
      Date.now,
      ids,
    );
    const app = executablePicker(async () => undefined, host, Date.now, ids);
    app.request(1, null, renderer, () => true);
    strategy.request(2, "open", revision, renderer, () => true);
    const sent = host.mock.calls.map(([m]) => m.id);
    expect(sent).toEqual([0x80000000, 0x80000001]);
    // the strategy answer is not swallowed by the executable picker, nor the reverse
    expect(strategy.receive(ack(0x80000000))).toBe(false);
    expect(strategy.receive(ack(0x80000001))).toBe(true);
    expect(
      app.receive({
        kind: "response",
        id: 0x80000000,
        result: { method: "launcher.app.pick", value: null },
      }),
    ).toBe(true);
    // an internal id nobody owns is still swallowed once, by the last picker
    expect(app.receive(ack(0x80000009))).toBe(true);
  });
});

describe("wiring of the main process", () => {
  const main = readFileSync(
    new URL("../src/main/index.ts", import.meta.url),
    "utf8",
  );
  it("takes strategy.pickFile from the renderer before anything reaches the host", () => {
    const intercept = main.indexOf(
      'data.request.method === "strategy.pickFile"',
    );
    expect(intercept).toBeGreaterThan(-1);
    const block = main.slice(intercept, main.indexOf("return;", intercept));
    expect(block).toContain("pickStrategyFile.request(");
    expect(block).not.toContain("host.send");
    // the first place a renderer request can be forwarded raw is after it
    const forwarded = main.lastIndexOf("host.send(data)");
    expect(forwarded).toBeGreaterThan(intercept);
    // the port only admits the request when it is not an internal id
    expect(
      isRendererMessage({
        kind: "request",
        id: 0x80000000,
        request: { method: "strategy.pickFile", mode: "open", revision },
      }),
    ).toBe(false);
  });
  it("asks the strategy picker before the Launcher one, which takes every internal id", () => {
    const strategy = main.indexOf("pickStrategyFile.receive(message)");
    const launcher = main.indexOf("pickExecutable.receive(message)");
    expect(strategy).toBeGreaterThan(-1);
    expect(launcher).toBeGreaterThan(strategy);
    // the reason for the order: it swallows ids that are not its own
    const app = executablePicker(async () => undefined, vi.fn());
    expect(app.receive(ack(0x80000005))).toBe(true);
  });
  it("gives both pickers one sequence of internal ids and cancels the dialog with the window", () => {
    expect(main).toMatch(/const pickerIds = internalIds\(\)/u);
    expect(main.split("pickerIds,").length).toBeGreaterThanOrEqual(3);
    expect(main).toContain("pickStrategyFile.cancel()");
  });
});

describe("export dialog of the plan in the main process", () => {
  const target = { kind: "accepted" } as const;
  const ticket = (id: number, suggestedName = "Fuji - Base.csv"): HostToUi => ({
    kind: "response",
    id,
    result: {
      method: "strategy.exportFile",
      value: { kind: "ticket", suggestedName },
    },
  });
  const saved = (id: number): HostToUi => ({
    kind: "response",
    id,
    result: {
      method: "strategy.exportFile",
      value: { kind: "saved", file: { name: "Fuji - Base.csv" } },
    },
  });

  it("asks the host, opens the dialog with the name the host suggested and hands over only the file name", async () => {
    let finish: (path: string | undefined) => void = () => {};
    const open = vi.fn(
      (_mode: string, _name?: string) =>
        new Promise<string | undefined>((resolve) => {
          finish = resolve;
        }),
    );
    const host = vi.fn(),
      renderer = vi.fn();
    const pick = strategyFilePicker(open, host);
    pick.requestExport(5, revision, target, renderer, () => true);
    expect(host).toHaveBeenCalledWith({
      kind: "request",
      id: 0x80000000,
      request: { method: "strategy.exportFile", revision, target },
    });
    // another id, or the answer of another method, does not open anything
    expect(pick.receive(ticket(5))).toBe(false);
    expect(pick.receive(ack(0x80000000))).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(pick.receive(ticket(0x80000000))).toBe(true);
    pick.receive(ticket(0x80000000));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("export", "Fuji - Base.csv");
    // busy while it is open, for an export and for a file dialog
    pick.requestExport(6, revision, target, renderer, () => true);
    pick.request(7, "open", revision, renderer, () => true);
    expect(renderer).toHaveBeenCalledTimes(2);
    for (const [message] of renderer.mock.calls)
      expect(message).toMatchObject({
        kind: "failure",
        error: { kind: "busy" },
      });
    finish("D:/private/Fuji - Base.csv");
    await wait();
    expect(host).toHaveBeenLastCalledWith({
      kind: "pickedStrategyFile",
      id: 0x80000000,
      path: "D:/private/Fuji - Base.csv",
    });
    // the final answer reaches the renderer with its own id, once, without the path
    const result = saved(0x80000000);
    expect(pick.receive(result)).toBe(true);
    expect(renderer).toHaveBeenLastCalledWith({ ...result, id: 5 });
    expect(JSON.stringify(renderer.mock.calls)).not.toContain("private");
    expect(pick.receive(result)).toBe(false);
  });

  it("does not open a dialog for an acknowledgement that is not a ticket, and voids it", () => {
    const open = vi.fn(async () => undefined);
    const host = vi.fn(),
      renderer = vi.fn();
    const pick = strategyFilePicker(open, host);
    pick.requestExport(1, revision, target, renderer, () => true);
    pick.receive({
      kind: "response",
      id: 0x80000000,
      result: {
        method: "strategy.exportFile",
        value: { kind: "cancelled" },
      },
    });
    expect(open).not.toHaveBeenCalled();
    expect(host).toHaveBeenLastCalledWith({
      kind: "pickedStrategyFile",
      id: 0x80000000,
      path: null,
    });
    // the renderer does not wait for an answer that will never come
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer).toHaveBeenLastCalledWith({
      kind: "failure",
      id: 1,
      error: { kind: "io" },
    });
  });

  it("tells the host a cancelled dialog is void and forwards host failures with the renderer id", async () => {
    const open = vi.fn(async () => undefined);
    const host = vi.fn(),
      renderer = vi.fn();
    const pick = strategyFilePicker(open, host);
    pick.requestExport(2, revision, target, renderer, () => true);
    pick.receive(ticket(0x80000000));
    await wait();
    expect(host).toHaveBeenLastCalledWith({
      kind: "pickedStrategyFile",
      id: 0x80000000,
      path: null,
    });
    const other = strategyFilePicker(async () => undefined, vi.fn());
    other.requestExport(3, revision, target, renderer, () => true);
    other.receive({
      kind: "failure",
      id: 0x80000000,
      error: { kind: "strategyNothingToExport" },
    });
    expect(renderer).toHaveBeenLastCalledWith({
      kind: "failure",
      id: 3,
      error: { kind: "strategyNothingToExport" },
    });
  });

  it("gives up with an input-output failure when the dialog breaks", async () => {
    const host = vi.fn(),
      renderer = vi.fn();
    const pick = strategyFilePicker(async () => {
      throw new Error("window gone");
    }, host);
    pick.requestExport(4, revision, target, renderer, () => true);
    pick.receive(ticket(0x80000000));
    await wait();
    expect(host).toHaveBeenLastCalledWith({
      kind: "pickedStrategyFile",
      id: 0x80000000,
      path: null,
    });
    expect(renderer).toHaveBeenLastCalledWith({
      kind: "failure",
      id: 4,
      error: { kind: "io" },
    });
  });
});
