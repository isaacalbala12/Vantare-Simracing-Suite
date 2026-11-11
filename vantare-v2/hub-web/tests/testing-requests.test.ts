import { afterEach, expect, it, vi } from "vitest";
import { testingBusyRetry } from "../src/contract/generated/contract";
import { type Client, HostFailure } from "../src/renderer/bridge/client";
import { testingRequest } from "../src/renderer/screens/testing/TestingRequests";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("stops retrying a busy host after the shared limit", async () => {
  vi.useFakeTimers();
  const request = vi.fn().mockRejectedValue(new HostFailure({ kind: "busy" }));
  const result = testingRequest(
    { request } as unknown as Client,
    { method: "draft.load" },
    new AbortController().signal,
  ).catch((error) => error);
  await vi.advanceTimersByTimeAsync(
    testingBusyRetry.delayMs * (testingBusyRetry.attempts + 1),
  );
  expect(await result).toMatchObject({ detail: { kind: "busy" } });
  expect(request).toHaveBeenCalledTimes(testingBusyRetry.attempts + 1);
});
it("retries only Busy before dispatch, with a bounded cancellable backoff", async () => {
  vi.useFakeTimers();
  const reply = {
    method: "draft.load",
    value: {
      fields: {
        module: "hub",
        actionText: "",
        expectedText: "",
        observedText: "",
        contextText: "",
      },
      exists: false,
      screenshots: [],
      message: "",
    },
  } as const;
  const request = vi
    .fn()
    .mockRejectedValueOnce(new HostFailure({ kind: "busy" }))
    .mockResolvedValue(reply);
  const client = { request } as unknown as Client;
  const controller = new AbortController();
  const result = testingRequest(
    client,
    { method: "draft.load" },
    controller.signal,
  );
  await vi.advanceTimersByTimeAsync(testingBusyRetry.delayMs);
  expect(await result).toEqual(reply);
  expect(request).toHaveBeenCalledTimes(2);
  request.mockRejectedValue(new HostFailure({ kind: "coreUnavailable" }));
  await expect(
    testingRequest(client, { method: "draft.load" }, controller.signal),
  ).rejects.toMatchObject({ detail: { kind: "coreUnavailable" } });
  expect(request).toHaveBeenCalledTimes(3);
});
it("ignores a response after its screen session has been cancelled", async () => {
  const controller = new AbortController();
  let finish: (value: unknown) => void = () => {};
  const request = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const result = testingRequest(
    { request } as unknown as Client,
    { method: "draft.load" },
    controller.signal,
  );
  controller.abort();
  finish({ method: "draft.load" });
  await expect(result).rejects.toBeDefined();
  expect(request).toHaveBeenCalledTimes(1);
});
