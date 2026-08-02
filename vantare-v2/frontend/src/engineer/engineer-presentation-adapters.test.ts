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
    const snapshot = { version: 1, sequence: 1, generation: 0, kind: "snapshot", active: false };
    const event = { version: 1, sequence: 2, generation: 0, kind: "presentation", active: true, presentation: payload };
    const wailsStore = createEngineerPresentationStore({ now: () => 1_000 });
    const sseStore = createEngineerPresentationStore({ now: () => 1_000 });
    const wailsListeners = new Map<string, (data: unknown) => void>();
    const requestSnapshot = vi.fn();
    const wails = createWailsEngineerPresentationAdapter({
      store: wailsStore,
      subscribe(event, listener) {
        wailsListeners.set(event, listener);
        return () => wailsListeners.delete(event);
      },
      requestSnapshot,
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
    expect(requestSnapshot).toHaveBeenCalledTimes(1);
    sse.start();
    wailsListeners.get("engineer:stream")?.(snapshot);
    sseListeners.get("engineer-stream")?.({ data: JSON.stringify(snapshot) } as MessageEvent<string>);
    wailsListeners.get("engineer:stream")?.(event);
    sseListeners.get("engineer-stream")?.({ data: JSON.stringify(event) } as MessageEvent<string>);

    expect(wailsStore.getSnapshot()).toEqual(payload);
    expect(sseStore.getSnapshot()).toEqual(payload);
  });

  it("clears projection on a later canonical generation", () => {
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
    listeners.get("engineer:stream")?.({
      version: 1, sequence: 1, generation: 3, kind: "snapshot", active: true,
      presentation: buildEngineerPresentationFixture(),
    });
    listeners.get("engineer:stream")?.({ version: 1, sequence: 2, generation: 4, kind: "status", active: false });
    expect(store.getSnapshot()).toBeNull();
  });

  it("ignores an extracted stale presentation after a newer clear in both transports", () => {
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
    const active = { version: 1, sequence: 10, generation: 7, kind: "snapshot", active: true, presentation: payload };
    const clear = { version: 1, sequence: 11, generation: 8, kind: "status", active: false };
    const extractedBeforeClear = { ...active, sequence: 10 };
    wailsListeners.get("engineer:stream")?.(active);
    sseListeners.get("engineer-stream")?.({ data: JSON.stringify(active) } as MessageEvent<string>);
    wailsListeners.get("engineer:stream")?.(clear);
    sseListeners.get("engineer-stream")?.({ data: JSON.stringify(clear) } as MessageEvent<string>);
    wailsListeners.get("engineer:stream")?.(extractedBeforeClear);
    sseListeners.get("engineer-stream")?.({ data: JSON.stringify(extractedBeforeClear) } as MessageEvent<string>);

    expect(wailsStore.getSnapshot()).toBeNull();
    expect(sseStore.getSnapshot()).toBeNull();
  });

  it("rehydrates the same active snapshot and subtitle routing over Wails and SSE", () => {
    const payload = buildEngineerPresentationFixture("pt-BR", "critical");
    const snapshot = {
      version: 1, sequence: 21, generation: 5, kind: "snapshot", active: true,
      presentation: payload, status: { subtitlesEnabled: false },
    };
    const wailsStore = createEngineerPresentationStore({ now: () => 1_000 });
    const sseStore = createEngineerPresentationStore({ now: () => 1_000 });
    const wailsListeners = new Map<string, (data: unknown) => void>();
    const sseListeners = new Map<string, (event: MessageEvent<string>) => void>();
    const wails = createWailsEngineerPresentationAdapter({
      store: wailsStore,
      subscribe(event, listener) { wailsListeners.set(event, listener); return () => undefined; },
    });
    const sse = createSseEngineerPresentationAdapter({
      store: sseStore,
      eventSourceFactory: () => ({
        addEventListener(type, listener) { sseListeners.set(type, listener); }, close() {}, onerror: null,
      }),
    });
    wails.start();
    sse.start();
    wailsListeners.get("engineer:stream")?.(snapshot);
    sseListeners.get("engineer-stream")?.({ data: JSON.stringify(snapshot) } as MessageEvent<string>);
    expect(wailsStore.getSnapshot()).toEqual(payload);
    expect(sseStore.getSnapshot()).toEqual(payload);
    expect(wailsStore.getSubtitlesEnabled()).toBe(false);
    expect(sseStore.getSubtitlesEnabled()).toBe(false);
  });

  it("rejects late presentations until an authoritative empty snapshot after SSE restart", () => {
    const payload = buildEngineerPresentationFixture("en", "info");
    const store = createEngineerPresentationStore({ now: () => 1_000 });
    const listeners = new Map<string, (event: MessageEvent<string>) => void>();
    const source = {
      addEventListener(type: string, listener: (event: MessageEvent<string>) => void) { listeners.set(type, listener); },
      close() {},
      onerror: null as ((event: Event) => void) | null,
    };
    const adapter = createSseEngineerPresentationAdapter({ store, eventSourceFactory: () => source });
    adapter.start();
    listeners.get("engineer-stream")?.({ data: JSON.stringify({
      version: 1, sequence: 50, generation: 9, kind: "snapshot", active: true, presentation: payload,
    }) } as MessageEvent<string>);
    listeners.get("engineer-stream")?.({ data: JSON.stringify({
      version: 1, sequence: 51, generation: 10, kind: "status", active: false,
    }) } as MessageEvent<string>);
    source.onerror?.(new Event("error"));
    listeners.get("engineer-stream")?.({ data: JSON.stringify({
      version: 1, sequence: 52, generation: 9, kind: "presentation", active: true, presentation: payload,
    }) } as MessageEvent<string>);
    expect(store.getSnapshot()).toBeNull();
    listeners.get("engineer-stream")?.({ data: JSON.stringify({
      version: 1, sequence: 1, generation: 0, kind: "snapshot", active: false,
    }) } as MessageEvent<string>);
    expect(store.getSnapshot()).toBeNull();
  });

  it("rehydrates Wails only from the requested snapshot after a runtime restart", () => {
    const payload = buildEngineerPresentationFixture("es", "critical");
    const store = createEngineerPresentationStore({ now: () => 1_000 });
    const listeners = new Map<string, (data: unknown) => void>();
    const requestSnapshot = vi.fn();
    const adapter = createWailsEngineerPresentationAdapter({
      store,
      subscribe(event, listener) { listeners.set(event, listener); return () => listeners.delete(event); },
      requestSnapshot,
    });
    adapter.start();
    listeners.get("engineer:stream")?.({
      version: 1, sequence: 50, generation: 9, kind: "snapshot", active: true, presentation: payload,
    });
    expect(store.getSnapshot()).toEqual(payload);

    adapter.stop();
    adapter.start();
    listeners.get("engineer:stream")?.({
      version: 1, sequence: 51, generation: 9, kind: "presentation", active: true, presentation: payload,
    });
    expect(store.getSnapshot()).toBeNull();
    listeners.get("engineer:stream")?.({
      version: 1, sequence: 1, generation: 0, kind: "snapshot", active: false,
    });
    expect(store.getSnapshot()).toBeNull();
    expect(requestSnapshot).toHaveBeenCalledTimes(2);
  });
});
