// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { isRendererMessage, mockAllowed } from "../src/main/security";
import { Client, HostFailure } from "../src/renderer/bridge/client";

describe("typed client with an isolated simulated host", () => {
  it("Live cancels an outstanding request and overrides a failing guard", async () => {
    window.history.replaceState(null, "", "/?escena=cierre-live-pendiente");
    const client = await Client.connect();
    try {
      client.start();
      client.addCloseGuard(() => {
        throw new Error("failed save");
      });
      const acknowledged = new Promise<boolean>((resolve) =>
        client.listen((message) => {
          if (message.kind === "event" && message.event.topic === "simStatus")
            resolve(message.event.live);
        }),
      );
      await expect(
        client.request({ method: "diagnostics.prepare" }),
      ).rejects.toEqual(new HostFailure({ kind: "busy" }));
      expect(await acknowledged).toBe(true);
    } finally {
      client.close();
      window.history.replaceState(null, "", "/");
    }
  });
  it("resolves a correlated request through a real MessageChannel and cleans up", async () => {
    const client = await Client.connect();
    try {
      client.start();
      const result = await client.request({ method: "core.get" });
      expect(result.method).toBe("core.get");
      if (result.method === "core.get")
        expect(result.value.photos).toBe("unavailable");
    } finally {
      client.close();
    }
  });
  it("finishes pending replies before acknowledging close and blocks new commands", async () => {
    const client = await Client.connect();
    try {
      client.start();
      const closing = new Promise<void>((resolve) =>
        client.listen((message) => {
          if (message.kind === "closeRequested") resolve();
        }),
      );
      const current = client.request({ method: "core.get" });
      client.closeWindow();
      await closing;
      await expect(current).resolves.toMatchObject({ method: "core.get" });
      await expect(client.request({ method: "core.get" })).rejects.toEqual(
        new HostFailure({ kind: "busy" }),
      );
    } finally {
      client.close();
    }
  });
  it.each(["decline", "failure"])(
    "keeps commands available when the close guard reports %s",
    async (outcome) => {
      const client = await Client.connect();
      let enter!: () => void;
      let decide!: (allow: boolean) => void;
      let fail!: (error: Error) => void;
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const decision = new Promise<boolean>((resolve, reject) => {
        decide = resolve;
        fail = reject;
      });
      const vetoed = new Promise<string>((resolve) =>
        client.onCloseVeto(resolve),
      );
      client.setCloseGuard(() => {
        enter();
        return decision;
      });
      try {
        client.start();
        client.closeWindow();
        await entered;
        await expect(client.request({ method: "core.get" })).rejects.toEqual(
          new HostFailure({ kind: "busy" }),
        );
        if (outcome === "decline") decide(false);
        else fail(new Error("Save failed"));
        expect(await vetoed).toBe("window");
        await expect
          .poll(() =>
            client.request({ method: "core.get" }).then(
              () => true,
              () => false,
            ),
          )
          .toBe(true);
      } finally {
        client.close();
      }
    },
  );
});

describe("main process trust boundary", () => {
  it("rejects renderer handshakes and premature readiness while forwarding UI operations", () => {
    for (const message of [
      { kind: "hello", version: 1 },
      { kind: "hello", version: 999 },
      { kind: "ready" },
    ])
      expect(isRendererMessage(message)).toBe(false);
    for (const message of [
      { kind: "request", id: 1, request: { method: "core.get" } },
      { kind: "request", id: 0, request: { method: "window.close" } },
      { kind: "subscribe", topic: "core" },
      { kind: "unsubscribe", topic: "simStatus" },
      { kind: "closeAnswer", allow: false },
    ])
      expect(isRendererMessage(message)).toBe(true);
    expect(
      isRendererMessage({
        kind: "request",
        id: 1,
        request: { method: "arbitrary" },
      }),
    ).toBe(false);
  });
  it("does not enable a packaged mock through a runtime environment value", () => {
    expect(mockAllowed(true, false)).toBe(false);
    expect(mockAllowed(true, true)).toBe(true);
    expect(mockAllowed(false, false)).toBe(true);
  });
});

it("shares topics until the final consumer leaves and observes only request metadata", async () => {
  const client = await Client.connect();
  try {
    const send = vi.spyOn(client, "send");
    const events = vi.fn();
    const stop = client.observeRequests(events);
    const first = client.subscribe("updates");
    const second = client.subscribe("updates");
    first();
    first();
    expect(
      send.mock.calls.filter(([message]) => message.kind === "subscribe"),
    ).toHaveLength(1);
    expect(
      send.mock.calls.filter(([message]) => message.kind === "unsubscribe"),
    ).toHaveLength(0);
    second();
    expect(
      send.mock.calls.filter(([message]) => message.kind === "unsubscribe"),
    ).toHaveLength(1);
    await client.request({ method: "core.get" });
    expect(events.mock.calls.map(([event]) => event.phase)).toEqual([
      "start",
      "done",
    ]);
    expect(events.mock.calls[0][0]).toEqual({
      id: 1,
      method: "core.get",
      phase: "start",
    });
    stop();
    await client.request({ method: "core.get" });
    expect(events).toHaveBeenCalledTimes(2);
  } finally {
    client.close();
  }
});
