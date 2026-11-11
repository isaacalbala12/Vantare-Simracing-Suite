// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { requestTimeoutMs } from "../src/contract/generated/contract";
import { Client, HostFailure } from "../src/renderer/bridge/client";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function connectHeld() {
  let peer: MessagePort | undefined;
  const RealChannel = MessageChannel;
  vi.stubGlobal(
    "MessageChannel",
    class extends RealChannel {
      constructor() {
        super();
        peer = this.port2;
      }
    },
  );
  const client = await Client.connect();
  vi.spyOn(client, "send").mockImplementation(() => {});
  if (!peer) throw new Error("missing peer");
  return { client, peer };
}
it("keeps only the native export dialog pending beyond 45 seconds and resolves its eventual result", async () => {
  const { client, peer } = await connectHeld();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    let settled = false;
    const dialog = client.request({
      method: "report.localExport",
      preparedHash: "a".repeat(64),
    });
    void dialog.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    const regular = client
      .request({ method: "draft.load" })
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(requestTimeoutMs + 1);
    expect(await regular).toEqual(new HostFailure({ kind: "coreUnavailable" }));
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000);
    expect(settled).toBe(false);
    peer.postMessage({
      kind: "response",
      id: 1,
      result: { method: "report.localExport", status: "saved" },
    });
    await expect(dialog).resolves.toEqual({
      method: "report.localExport",
      status: "saved",
    });
  } finally {
    client.close();
  }
});
it("rejects a deadline-exempt export when its client disconnects", async () => {
  const { client } = await connectHeld();
  const dialog = client.request({
    method: "report.localExport",
    preparedHash: "a".repeat(64),
  });
  const rejected = expect(dialog).rejects.toEqual(
    new HostFailure({ kind: "coreUnavailable" }),
  );
  client.close();
  await rejected;
});
