import { describe, expect, it } from "vitest";
import { createChainStore } from "./chain-store";

describe("chain-store reducer", () => {
  it("updates on step event", () => {
    const store = createChainStore();
    store.handleStep({
      profileId: "p1",
      stepIndex: 0,
      appId: "lmu",
      status: "launching",
      startedAt: 1000,
    });
    expect(store.getChain("p1")?.steps[0].status).toBe("launching");
  });

  it("is tolerant to out-of-order: done before launching accepted from pending", () => {
    const store = createChainStore();
    store.handleStep({
      profileId: "p1",
      stepIndex: 0,
      appId: "lmu",
      status: "done",
      finishedAt: 2000,
    });
    expect(store.getChain("p1")?.steps[0].status).toBe("done");
  });

  it("is idempotent: second done for same step is ignored", () => {
    const store = createChainStore();
    store.handleStep({
      profileId: "p1",
      stepIndex: 0,
      appId: "lmu",
      status: "done",
      finishedAt: 2000,
    });
    store.handleStep({
      profileId: "p1",
      stepIndex: 0,
      appId: "lmu",
      status: "done",
      finishedAt: 3000,
    });
    expect(store.getChain("p1")?.steps[0].finishedAt).toBe(2000);
  });
});
