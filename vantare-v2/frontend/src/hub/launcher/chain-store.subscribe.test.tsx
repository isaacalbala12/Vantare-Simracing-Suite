import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

type EventHandler = (event: { data?: unknown }) => void;
const wailsHandlers = new Map<string, Set<EventHandler>>();

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn((name: string, handler: EventHandler) => {
      if (!wailsHandlers.has(name)) wailsHandlers.set(name, new Set());
      wailsHandlers.get(name)!.add(handler);
      return () => {
        wailsHandlers.get(name)?.delete(handler);
      };
    }),
    Emit: vi.fn((name: string, data: unknown) => {
      wailsHandlers.get(name)?.forEach((h) => h({ data }));
    }),
  },
}));

import {
  ChainRunnerProvider,
  useChainState,
  useLastResult,
} from "./chain-store";

function emitChainStep(payload: Record<string, unknown>) {
  wailsHandlers.get("launcher:chain:step")?.forEach((h) => h({ data: payload }));
}

function emitChainDone(payload: Record<string, unknown>) {
  wailsHandlers.get("launcher:chain:done")?.forEach((h) => h({ data: payload }));
}

describe("ChainRunnerProvider + selective subscription", () => {
  beforeEach(() => {
    wailsHandlers.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("useChainState only re-renders when the subscribed profileId changes", () => {
    const p1Renders: number[] = [];
    const p2Renders: number[] = [];

    function P1Tracker() {
      useChainState("p1");
      p1Renders.push(Date.now());
      return null;
    }
    function P2Tracker() {
      useChainState("p2");
      p2Renders.push(Date.now());
      return null;
    }

    render(
      <ChainRunnerProvider>
        <P1Tracker />
        <P2Tracker />
      </ChainRunnerProvider>,
    );

    expect(p1Renders.length).toBe(1);
    expect(p2Renders.length).toBe(1);

    // Emit a step event for p1 only
    act(() => {
      emitChainStep({
        profileId: "p1",
        stepIndex: 0,
        appId: "lmu",
        status: "launching",
        startedAt: 1000,
      });
    });

    // Only P1Tracker should re-render
    expect(p1Renders.length).toBe(2);
    expect(p2Renders.length).toBe(1);

    // Emit a step event for p2 only
    act(() => {
      emitChainStep({
        profileId: "p2",
        stepIndex: 0,
        appId: "obs",
        status: "launching",
        startedAt: 2000,
      });
    });

    // Only P2Tracker should re-render
    expect(p1Renders.length).toBe(2);
    expect(p2Renders.length).toBe(2);
  });

  it("useLastResult only re-renders when the subscribed profileId lastResult changes", () => {
    const p1Renders: number[] = [];
    const p2Renders: number[] = [];

    function P1Tracker() {
      useLastResult("p1");
      p1Renders.push(Date.now());
      return null;
    }
    function P2Tracker() {
      useLastResult("p2");
      p2Renders.push(Date.now());
      return null;
    }

    render(
      <ChainRunnerProvider>
        <P1Tracker />
        <P2Tracker />
      </ChainRunnerProvider>,
    );

    expect(p1Renders.length).toBe(1);
    expect(p2Renders.length).toBe(1);

    // Create chains for both profiles (lastResult stays undefined → no re-render)
    act(() => {
      emitChainStep({
        profileId: "p1",
        stepIndex: 0,
        appId: "lmu",
        status: "launching",
        startedAt: 1000,
      });
    });
    expect(p1Renders.length).toBe(1); // lastResult still undefined → no re-render
    expect(p2Renders.length).toBe(1);

    act(() => {
      emitChainStep({
        profileId: "p2",
        stepIndex: 0,
        appId: "obs",
        status: "launching",
        startedAt: 2000,
      });
    });
    expect(p1Renders.length).toBe(1);
    expect(p2Renders.length).toBe(1);

    // Emit done for p1 → lastResult changes to "success"
    act(() => {
      emitChainDone({ profileId: "p1", success: true });
    });
    expect(p1Renders.length).toBe(2); // re-renders because lastResult changed
    expect(p2Renders.length).toBe(1);

    // Emit done for p2 → lastResult changes to "success"
    act(() => {
      emitChainDone({ profileId: "p2", success: true });
    });
    expect(p1Renders.length).toBe(2);
    expect(p2Renders.length).toBe(2); // re-renders because lastResult changed
  });
});
