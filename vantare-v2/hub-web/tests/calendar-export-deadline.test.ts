// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { methods, requestTimeoutMs } from "../src/contract/generated/contract";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { requestDeadline } from "../src/renderer/bridge/request-deadlines";

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
      method: "calendar.icsExport",
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
      result: { method: "calendar.icsExport", status: "saved" },
    });
    await expect(dialog).resolves.toEqual({
      method: "calendar.icsExport",
      status: "saved",
    });
  } finally {
    client.close();
  }
});
it("rejects a deadline-exempt export when its client disconnects", async () => {
  const { client } = await connectHeld();
  const dialog = client.request({
    method: "calendar.icsExport",
    preparedHash: "a".repeat(64),
  });
  const rejected = expect(dialog).rejects.toEqual(
    new HostFailure({ kind: "coreUnavailable" }),
  );
  client.close();
  await rejected;
});

it("waits for main replacement publication beyond the regular timeout and still aborts on disconnect", async () => {
  const { client, peer } = await connectHeld();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    let settled = false;
    const pending = client.request({
      method: "calendar.icsReplace",
      confirmationId: "b".repeat(64),
      replace: true,
    });
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await vi.advanceTimersByTimeAsync(requestTimeoutMs + 1);
    expect(settled).toBe(false);
    peer.postMessage({
      kind: "response",
      id: 1,
      result: { method: "calendar.icsReplace", status: "saved" },
    });
    await expect(pending).resolves.toEqual({
      method: "calendar.icsReplace",
      status: "saved",
    });
    const cancelled = client.request({
      method: "calendar.icsReplace",
      confirmationId: "c".repeat(64),
      replace: true,
    });
    const failed = expect(cancelled).rejects.toEqual(
      new HostFailure({ kind: "coreUnavailable" }),
    );
    client.close();
    await failed;
  } finally {
    client.close();
  }
});

it("keeps the main publication deadline exception a closed list", () => {
  expect(
    methods.filter((method) => requestDeadline(method) === undefined).sort(),
  ).toEqual([
    "calendar.icsExport",
    "calendar.icsReplace",
    "report.localExport",
  ]);
});
