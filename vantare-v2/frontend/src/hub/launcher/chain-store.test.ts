import { describe, expect, it, vi } from "vitest";
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

  it("handleDone(true) marks chain as done, handleDone(false) as error", () => {
    const store = createChainStore();
    // Step for p1
    store.handleStep({
      profileId: "p1",
      stepIndex: 0,
      appId: "lmu",
      status: "done",
      finishedAt: 1000,
    });
    store.handleDone("p1", true);
    expect(store.getChain("p1")?.overallStatus).toBe("done");
    expect(store.getLastResult("p1")).toBe("success");

    // Step for p2
    store.handleStep({
      profileId: "p2",
      stepIndex: 0,
      appId: "obs",
      status: "failed",
      finishedAt: 2000,
    });
    store.handleDone("p2", false);
    expect(store.getChain("p2")?.overallStatus).toBe("error");
    expect(store.getLastResult("p2")).toBe("error");
  });

  it("keeps a cancelled chain stopped and does not offer failure retry", () => {
    const store = createChainStore();
    store.handleStep({ profileId: "p", stepIndex: 0, appId: "lmu", status: "pending" });
    store.handleDone("p", false, "stopped");
    expect(store.getChain("p")?.overallStatus).toBe("stopped");
    expect(store.getLastResult("p")).toBeUndefined();
    store.handleStep({ profileId: "p", stepIndex: 0, appId: "lmu", status: "pending" });
    expect(store.getChain("p")?.overallStatus).toBe("running");
  });

  it("clears chain after 3s of done", () => {
    vi.useFakeTimers();
    const store = createChainStore();
    store.handleStep({
      profileId: "p1",
      stepIndex: 0,
      appId: "lmu",
      status: "done",
      finishedAt: 1000,
    });
    store.handleDone("p1", true);
    vi.advanceTimersByTime(2999);
    expect(store.getChain("p1")).toBeDefined();
    vi.advanceTimersByTime(1);
    expect(store.getChain("p1")).toBeUndefined();
    vi.useRealTimers();
  });

  it("clears pending timeout when new step arrives within 3s", () => {
    vi.useFakeTimers();
    const store = createChainStore();
    store.handleStep({
      profileId: "p1",
      stepIndex: 0,
      appId: "lmu",
      status: "done",
      finishedAt: 1000,
    });
    store.handleDone("p1", true);
    // Avanzar 2s (aún dentro de la ventana de 3s)
    vi.advanceTimersByTime(2000);
    // Relanzar el mismo perfil dentro de los 3s
    store.handleStep({
      profileId: "p1",
      stepIndex: 0,
      appId: "lmu",
      status: "launching",
      startedAt: 5000,
    });
    // Avanzar 2s más (total 4s desde done, pero relanzado a los 2s)
    vi.advanceTimersByTime(2000);
    // La cadena nueva NO debe estar borrada
    expect(store.getChain("p1")).toBeDefined();
    expect(store.getChain("p1")?.overallStatus).toBe("running");
    vi.useRealTimers();
  });

  it("relaunch via pending status resets terminal chain to running", () => {
    vi.useFakeTimers();
    const store = createChainStore();
    // Terminar la cadena
    store.handleStep({
      profileId: "p1",
      stepIndex: 0,
      appId: "lmu",
      status: "done",
      finishedAt: 1000,
    });
    store.handleDone("p1", true);
    expect(store.getChain("p1")?.overallStatus).toBe("done");
    // Llega un step con status "pending" — relanzamiento
    store.handleStep({
      profileId: "p1",
      stepIndex: 0,
      appId: "lmu",
      status: "pending",
      startedAt: 5000,
    });
    expect(store.getChain("p1")?.overallStatus).toBe("running");
    expect(store.getChain("p1")?.startedAt).toBe(5000);
    vi.useRealTimers();
  });

  it("marks stale chain after 30s of inactivity", () => {
    vi.useFakeTimers();
    const store = createChainStore();
    // Iniciar watchdog (en producción lo arranca el provider)
    store.startWatchdog();
    // Step sin startedAt explicit → lastEventAt = Date.now() (faked)
    store.handleStep({
      profileId: "p1",
      stepIndex: 0,
      appId: "lmu",
      status: "launching",
    });
    expect(store.getChain("p1")?.overallStatus).toBe("running");
    // Avanzar 35s → el watchdog corre cada 5s, en t=35s la condición
    // now - lastEventAt > 30000 se cumple
    vi.advanceTimersByTime(35000);
    expect(store.getChain("p1")?.overallStatus).toBe("error");
    store.shutdown();
    vi.useRealTimers();
  });

  it("keeps a planned 60s delay running until its deadline", () => {
    vi.useFakeTimers();
    const store = createChainStore();
    store.startWatchdog();
    store.handleStep({
      profileId: "p1",
      stepIndex: 0,
      appId: "lmu",
      status: "pending",
      delaySeconds: 60,
    });
    vi.advanceTimersByTime(65000);
    expect(store.getChain("p1")?.overallStatus).toBe("running");
    vi.advanceTimersByTime(30000);
    expect(store.getChain("p1")?.overallStatus).toBe("error");
    store.shutdown();
    vi.useRealTimers();
  });

  it("keeps Steam launch pending while the game process is being verified", () => {
    vi.useFakeTimers();
    const store = createChainStore();
    store.startWatchdog();
    store.handleStep({
      profileId: "p1",
      stepIndex: 0,
      appId: "lmu",
      status: "launching",
      delaySeconds: 120,
    });
    vi.advanceTimersByTime(125000);
    expect(store.getChain("p1")?.overallStatus).toBe("running");
    vi.advanceTimersByTime(30000);
    expect(store.getChain("p1")?.overallStatus).toBe("error");
    store.shutdown();
    vi.useRealTimers();
  });

  it("keeps a chain active while a user decision is pending", () => {
    vi.useFakeTimers();
    const store = createChainStore();
    store.startWatchdog();
    store.handleStep({ profileId: "p1", stepIndex: 0, appId: "obs", status: "failed" });
    store.handleDecisionRequired("p1", Date.now() + 120000);
    vi.advanceTimersByTime(60000);
    expect(store.getChain("p1")?.overallStatus).toBe("running");
    vi.advanceTimersByTime(95000);
    expect(store.getChain("p1")?.overallStatus).toBe("error");
    store.shutdown();
    vi.useRealTimers();
  });
});
