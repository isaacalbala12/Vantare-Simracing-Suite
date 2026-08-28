import { afterEach, describe, expect, it } from "vitest";
import { installHubSuspendGuard, setHubStudioDirty } from "./hub-suspend-guard";

afterEach(() => setHubStudioDirty(false));

describe("hub suspend guard", () => {
  it("allows a clean hub and blocks a dirty Studio", () => {
    let handler: ((payload: unknown) => void) | undefined;
    const emitted: unknown[] = [];
    const dispose = installHubSuspendGuard({
      on: (_event, next) => { handler = next; return () => { handler = undefined; }; },
      emit: (_event, payload) => emitted.push(payload),
    });

    handler?.({ data: { requestId: "clean" } });
    setHubStudioDirty(true);
    handler?.({ data: { requestId: "dirty" } });

    expect(emitted).toEqual([
      { requestId: "clean", canSuspend: true },
      { requestId: "dirty", canSuspend: false },
    ]);
    dispose();
  });
});
