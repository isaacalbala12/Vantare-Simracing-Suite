import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LauncherSnapshot } from "./launcher-contract";
import {
  LauncherStoreProvider,
  createLauncherStore,
  type LauncherBridgeLike,
  useLauncherProfiles,
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
    expect(bridge.dispatchLauncherCommand).not.toHaveBeenCalled();
    act(() => receiveSnapshot?.(snapshot));
    expect(screen.getByTestId("one").textContent).toBe("1");
    expect(screen.getByTestId("two").textContent).toBe("1");

    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("skips automatic discovery while lastScanAt is fresh, and honors force", () => {
    let receiveSnapshot: ((value: LauncherSnapshot) => void) | undefined;
    const bridge: LauncherBridgeLike = {
      subscribeSnapshot: vi.fn((listener) => {
        receiveSnapshot = listener;
        return vi.fn();
      }),
      requestSnapshot: vi.fn(),
      dispatchLauncherCommand: vi.fn(),
    };
    const store = createLauncherStore(bridge);
    store.start();

    const fresh = new Date(Date.now() - 60_000).toISOString();
    act(() =>
      receiveSnapshot?.({
        ...snapshot,
        discovery: { scanning: false, lastScanAt: fresh, error: null },
      }),
    );
    store.discoverApps();
    expect(bridge.dispatchLauncherCommand).not.toHaveBeenCalled();
    store.discoverApps(true);
    expect(bridge.dispatchLauncherCommand).toHaveBeenCalledWith(
      "launcher:apps:discover",
    );
    store.stop();
  });

  it("discovers automatically when the last scan is stale or absent", () => {
    const bridge: LauncherBridgeLike = {
      subscribeSnapshot: vi.fn(() => vi.fn()),
      requestSnapshot: vi.fn(),
      dispatchLauncherCommand: vi.fn(),
    };
    const store = createLauncherStore(bridge);
    store.discoverApps();
    expect(bridge.dispatchLauncherCommand).toHaveBeenCalledTimes(1);
  });

  it("useLauncherProfiles no repinta cuando solo cambian otros campos", () => {
    let receiveSnapshot: ((value: LauncherSnapshot) => void) | undefined;
    const bridge: LauncherBridgeLike = {
      subscribeSnapshot: vi.fn((listener) => {
        receiveSnapshot = listener;
        return vi.fn();
      }),
      requestSnapshot: vi.fn(),
      dispatchLauncherCommand: vi.fn(),
    };
    const store = createLauncherStore(bridge);
    let renders = 0;

    function Consumer() {
      renders += 1;
      const profiles = useLauncherProfiles();
      return <output data-testid="count">{profiles.length}</output>;
    }

    render(
      <LauncherStoreProvider store={store}>
        <Consumer />
      </LauncherStoreProvider>,
    );
    const afterMount = renders;
    // Snapshot con perfiles nuevos: notifica.
    act(() =>
      receiveSnapshot?.({
        ...snapshot,
        userProfiles: [{ id: "p1", name: "GT3", steps: [] } as never],
      }),
    );
    expect(renders).toBeGreaterThan(afterMount);
    expect(screen.getByTestId("count").textContent).toBe("1");
    const afterProfiles = renders;
    // Mismos perfiles proyectados (refs nuevas), apps cambiaron: no repinta.
    act(() =>
      receiveSnapshot?.({
        ...snapshot,
        revision: 9,
        apps: [{ id: "x" } as never],
        userProfiles: [{ id: "p1", name: "GT3", steps: [] } as never],
      }),
    );
    expect(renders).toBe(afterProfiles);
    // Cadena activa no repinta al consumidor de perfiles.
    act(() =>
      receiveSnapshot?.({
        ...snapshot,
        activeChains: [{ profileId: "p1", status: "running" } as never],
        userProfiles: [{ id: "p1", name: "GT3", steps: [] } as never],
      }),
    );
    expect(renders).toBe(afterProfiles);
  });
});
