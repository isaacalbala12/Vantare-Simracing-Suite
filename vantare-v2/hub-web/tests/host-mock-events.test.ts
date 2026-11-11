import { afterEach, expect, it, vi } from "vitest";
import type { HostToUi } from "../src/contract/generated/contract";
import { createHost } from "../src/main/host";

vi.mock("electron", () => ({ app: { isPackaged: false } }));
afterEach(() => vi.unstubAllEnvs());
it("delivers the cached-data reply before the mock core disconnect event, then rejects offline requests", async () => {
  vi.stubEnv("VANTARE_HUB_HOST", "mock");
  vi.stubEnv("VANTARE_HUB_SCENE", "testing-tester-questionnaires-reference");
  const host = createHost();
  const seen: HostToUi[] = [];
  const disconnected = new Promise<void>((resolve) =>
    host.listen((message) => {
      seen.push(message);
      if (
        message.kind === "event" &&
        message.event.topic === "core" &&
        message.event.value.services === "unavailable"
      )
        resolve();
    }),
  );
  host.send({ kind: "request", id: 1, request: { method: "testing.refresh" } });
  await disconnected;
  expect(seen[0]).toMatchObject({
    kind: "response",
    id: 1,
    result: { method: "testing.refresh" },
  });
  expect(seen[1]).toMatchObject({
    kind: "event",
    event: { topic: "core", value: { services: "unavailable" } },
  });
  const rejected = new Promise<HostToUi>((resolve) =>
    host.listen((message) => {
      if (message.kind === "failure" && message.id === 2) resolve(message);
    }),
  );
  host.send({ kind: "request", id: 2, request: { method: "testing.refresh" } });
  expect(await rejected).toEqual({
    kind: "failure",
    id: 2,
    error: { kind: "coreUnavailable" },
  });
  host.close();
});
