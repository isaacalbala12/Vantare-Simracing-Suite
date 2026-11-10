// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Client, HostFailure } from "../src/renderer/bridge/client";

describe("typed client with an isolated simulated host", () => {
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
