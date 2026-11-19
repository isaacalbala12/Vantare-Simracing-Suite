import { expect, it, vi } from "vitest";
import type { HostToUi } from "../src/contract/generated/contract";
import { invalidResponseFailure } from "../src/contract/local-failure";
import { executablePicker, internalIds } from "../src/main/launcher-picker";
import { strategyFilePicker } from "../src/main/strategy-file-picker";

// Main-owned ids (>= 0x80000000) answered with the local failure from the host
// link must reach the renderer under the renderer id, keeping the local marker.
it("both pickers pass the local failure on under the renderer id and free their slot", () => {
  const ids = internalIds();
  const host = vi.fn(),
    renderer = vi.fn<(message: HostToUi) => void>();
  const strategy = strategyFilePicker(
    async () => undefined,
    host,
    Date.now,
    ids,
  );
  const app = executablePicker(async () => undefined, host, Date.now, ids);
  strategy.request(2, "open", "a".repeat(64), renderer, () => true);
  app.request(1, null, renderer, () => true);
  const [strategyId, appId] = host.mock.calls.map(([m]) => m.id as number);
  expect(strategy.receive(invalidResponseFailure(strategyId))).toBe(true);
  expect(app.receive(invalidResponseFailure(appId))).toBe(true);
  expect(renderer.mock.calls.map(([m]) => m)).toEqual([
    { kind: "failure", id: 2, error: { kind: "io" }, local: "invalidResponse" },
    { kind: "failure", id: 1, error: { kind: "io" }, local: "invalidResponse" },
  ]);
  // Not a stuck pending request: the next ones are accepted again.
  const before = host.mock.calls.length;
  app.request(3, null, renderer, () => true);
  expect(host.mock.calls.length).toBe(before + 1);
});
