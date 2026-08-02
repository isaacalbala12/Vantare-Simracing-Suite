import { describe, expect, it, vi } from "vitest";
import {
  createSseEngineerPresentationAdapter,
  createWailsEngineerPresentationAdapter,
} from "./engineer-presentation-adapters";
import { createEngineerPresentationStore } from "./engineer-presentation-store";
import { buildEngineerPresentationFixture } from "./engineer-presentation-fixtures";

describe("engineer presentation transport parity", () => {
  it("projects the same canonical object from Wails and SSE", () => {
    const payload = buildEngineerPresentationFixture("it", "warning");
    const wailsStore = createEngineerPresentationStore({ now: () => 1_000 });
    const sseStore = createEngineerPresentationStore({ now: () => 1_000 });
    const wailsListeners = new Map<string, (data: unknown) => void>();
    const wails = createWailsEngineerPresentationAdapter({
      store: wailsStore,
      subscribe(event, listener) {
        wailsListeners.set(event, listener);
        return () => wailsListeners.delete(event);
      },
    });
    const sseListeners = new Map<string, (event: MessageEvent<string>) => void>();
    const source = {
      addEventListener: vi.fn((type: string, listener: (event: MessageEvent<string>) => void) => {
        sseListeners.set(type, listener);
      }),
      close: vi.fn(),
      onerror: null as ((event: Event) => void) | null,
    };
    const sse = createSseEngineerPresentationAdapter({
      store: sseStore,
      eventSourceFactory: () => source,
    });

    wails.start();
    sse.start();
    wailsListeners.get("engineer:notification")?.(payload);
    sseListeners.get("engineer-notification")?.({ data: JSON.stringify(payload) } as MessageEvent<string>);

    expect(wailsStore.getSnapshot()).toEqual(payload);
    expect(sseStore.getSnapshot()).toEqual(payload);
  });

  it("clears projection on a transport/source boundary", () => {
    const store = createEngineerPresentationStore({ now: () => 1_000 });
    const listeners = new Map<string, (data: unknown) => void>();
    const adapter = createWailsEngineerPresentationAdapter({
      store,
      subscribe(event, listener) {
        listeners.set(event, listener);
        return () => undefined;
      },
    });
    adapter.start();
    listeners.get("engineer:notification")?.(buildEngineerPresentationFixture());
    listeners.get("engineer:status")?.({ connected: false, presentationLifecycle: 4 });
    expect(store.getSnapshot()).toBeNull();
  });

  it("clears Wails and SSE projections when the canonical lifecycle changes while connected", () => {
    const payload = buildEngineerPresentationFixture("en", "info");
    const wailsStore = createEngineerPresentationStore({ now: () => 1_000 });
    const sseStore = createEngineerPresentationStore({ now: () => 1_000 });
    const wailsListeners = new Map<string, (data: unknown) => void>();
    const sseListeners = new Map<string, (event: MessageEvent<string>) => void>();
    const wails = createWailsEngineerPresentationAdapter({
      store: wailsStore,
      subscribe(event, listener) {
        wailsListeners.set(event, listener);
        return () => undefined;
      },
    });
    const sse = createSseEngineerPresentationAdapter({
      store: sseStore,
      eventSourceFactory: () => ({
        addEventListener(type, listener) {
          sseListeners.set(type, listener);
        },
        close() {},
        onerror: null,
      }),
    });
    wails.start();
    sse.start();
    wailsListeners.get("engineer:status")?.({ connected: true, presentationLifecycle: 7 });
    sseListeners.get("engineer-status")?.({
      data: JSON.stringify({ connected: true, presentationLifecycle: 7 }),
    } as MessageEvent<string>);
    wailsListeners.get("engineer:notification")?.(payload);
    sseListeners.get("engineer-notification")?.({ data: JSON.stringify(payload) } as MessageEvent<string>);

    wailsListeners.get("engineer:status")?.({ connected: true, presentationLifecycle: 8 });
    sseListeners.get("engineer-status")?.({
      data: JSON.stringify({ connected: true, presentationLifecycle: 8 }),
    } as MessageEvent<string>);

    expect(wailsStore.getSnapshot()).toBeNull();
    expect(sseStore.getSnapshot()).toBeNull();
  });
});
