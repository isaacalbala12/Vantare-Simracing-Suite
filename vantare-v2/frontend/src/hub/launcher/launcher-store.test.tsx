import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LauncherSnapshot } from "./launcher-contract";
import {
  LauncherStoreProvider,
  createLauncherStore,
  type LauncherBridgeLike,
  useLauncherSnapshot,
} from "./launcher-store";

const snapshot: LauncherSnapshot = {
  revision: 1,
  apps: [],
  vantareProfiles: [],
  userProfiles: [],
  activeChains: [],
  discovery: { scanning: false, lastScanAt: null, error: null },
};

describe("launcher store", () => {
  it("discovers once, requests one snapshot for two consumers, and cleans up", () => {
    let receiveSnapshot: ((value: LauncherSnapshot) => void) | undefined;
    const unsubscribe = vi.fn();
    const bridge: LauncherBridgeLike = {
      subscribeSnapshot: vi.fn((listener) => {
        receiveSnapshot = listener;
        return unsubscribe;
      }),
      requestSnapshot: vi.fn(),
      dispatchLauncherCommand: vi.fn(),
    };
    const store = createLauncherStore(bridge);

    function Consumer({ id }: { id: string }) {
      const current = useLauncherSnapshot();
      return <output data-testid={id}>{current?.revision ?? "empty"}</output>;
    }

    const view = render(
      <LauncherStoreProvider store={store}>
        <Consumer id="one" />
        <Consumer id="two" />
      </LauncherStoreProvider>,
    );

    expect(bridge.requestSnapshot).toHaveBeenCalledTimes(1);
    expect(bridge.dispatchLauncherCommand).toHaveBeenCalledWith(
      "launcher:apps:discover",
    );
    act(() => receiveSnapshot?.(snapshot));
    expect(screen.getByTestId("one").textContent).toBe("1");
    expect(screen.getByTestId("two").textContent).toBe("1");

    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
