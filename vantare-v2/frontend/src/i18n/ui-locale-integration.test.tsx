import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const sent: { name: string; payload?: unknown }[] = [];
  return { listeners, sent, rejectNextSet: false };
});

vi.mock("@wailsio/runtime", () => ({ Events: {
  On(name: string, listener: (event: unknown) => void) {
    const set = bridge.listeners.get(name) ?? new Set();
    set.add(listener);
    bridge.listeners.set(name, set);
    return () => set.delete(listener);
  },
  Emit(name: string, payload?: unknown) {
    bridge.sent.push({ name, payload });
    if (name === "ui-locale:set" && bridge.rejectNextSet) {
      bridge.rejectNextSet = false;
      return Promise.reject(new Error("bridge unavailable"));
    }
  },
} }));

import { I18nProvider, useI18n } from "./I18nProvider";

function emit(name: string, data: unknown) {
  act(() => { for (const listener of bridge.listeners.get(name) ?? []) listener({ data }); });
}

function Consumer() {
  const { locale, setLocale } = useI18n();
  return <><output data-testid="locale">{locale}</output><button onClick={() => setLocale("en")}>en</button><button onClick={() => setLocale("it")}>it</button></>;
}

beforeEach(() => { localStorage.clear(); bridge.listeners.clear(); bridge.sent.length = 0; bridge.rejectNextSet = false; });
afterEach(async () => { await act(() => vi.dynamicImportSettled()); cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("native UI locale authority", () => {
  it("migrates legacy only from Hub and ignores an older snapshot", async () => {
    localStorage.setItem("vantare.locale", "it");
    render(<I18nProvider mode="native-hub"><Consumer /></I18nProvider>);
    expect(bridge.sent.map((item) => item.name)).toEqual(["ui-locale:get"]);
    emit("ui-locale:snapshot", { locale: "", revision: 0 });
    expect(bridge.sent.at(-1)).toEqual({ name: "ui-locale:initialize", payload: { locale: "it" } });
    emit("ui-locale:changed", { locale: "en", revision: 2 });
    emit("ui-locale:snapshot", { locale: "es", revision: 1 });
    await waitFor(() => expect(screen.getByTestId("locale").textContent).toBe("en"));
    expect(localStorage.getItem("vantare.locale")).toBe("en");
  });

  it("does not let Desktop initialize a missing authority", () => {
    localStorage.setItem("vantare.locale", "it");
    render(<I18nProvider mode="native-consumer"><Consumer /></I18nProvider>);
    emit("ui-locale:snapshot", { locale: "", revision: 0 });
    expect(bridge.sent.map((item) => item.name)).toEqual(["ui-locale:get"]);
    expect(localStorage.getItem("vantare.locale")).toBe("it");
  });

  it("serializes rapid choices until confirmation and never caches a failed choice", () => {
    render(<I18nProvider mode="native-hub"><Consumer /></I18nProvider>);
    emit("ui-locale:snapshot", { locale: "es", revision: 1 });
    fireEvent.click(screen.getByText("en"));
    fireEvent.click(screen.getByText("it"));
    let requests = bridge.sent.filter((item) => item.name === "ui-locale:set");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.payload).toMatchObject({ locale: "en" });
    const firstID = (requests[0]?.payload as { requestId: string }).requestId;
    emit("ui-locale:changed", { locale: "en", revision: 2 });
    emit("ui-locale:confirmed", { requestId: firstID, locale: "en", revision: 2 });
    requests = bridge.sent.filter((item) => item.name === "ui-locale:set");
    expect(requests).toHaveLength(2);
    expect(requests[1]?.payload).toMatchObject({ locale: "it" });
    const secondID = (requests[1]?.payload as { requestId: string }).requestId;
    emit("ui-locale:error", { requestId: secondID, message: "disk failed" });
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(localStorage.getItem("vantare.locale")).toBe("en");
  });

  it("unsubscribes when the root unmounts", () => {
    const view = render(<I18nProvider mode="native-consumer"><Consumer /></I18nProvider>);
    view.unmount();
    expect([...bridge.listeners.values()].every((set) => set.size === 0)).toBe(true);
  });

  it("releases the request queue when the Wails transport rejects", async () => {
    render(<I18nProvider mode="native-hub"><Consumer /></I18nProvider>);
    bridge.rejectNextSet = true;
    fireEvent.click(screen.getByText("en"));
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByText("it"));
    const requests = bridge.sent.filter((item) => item.name === "ui-locale:set");
    expect(requests.map((item) => (item.payload as { locale: string }).locale)).toEqual(["en", "it"]);
  });

  it("uses each valid OBS reconnection snapshot as authority and ignores invalid events", async () => {
    class Source {
      handlers = new Map<string, (event: MessageEvent<string>) => void>();
      closed = false;
      constructor(readonly url: string) { expect(url).toBe("/api/ui-locale/stream"); }
      addEventListener(name: string, listener: EventListener) { this.handlers.set(name, listener as (event: MessageEvent<string>) => void); }
      close() { this.closed = true; }
      emit(name: string, data: unknown) { act(() => this.handlers.get(name)?.({ data: typeof data === "string" ? data : JSON.stringify(data) } as MessageEvent<string>)); }
    }
    const sources: Source[] = [];
    vi.stubGlobal("EventSource", class extends Source { constructor(url: string) { super(url); sources.push(this); } });
    const view = render(<I18nProvider mode="obs"><Consumer /></I18nProvider>);
    expect(sources).toHaveLength(1);
    const stream = sources[0]!;
    stream.emit("ui-locale:snapshot", { locale: "pt", revision: 9 });
    await waitFor(() => expect(screen.getByTestId("locale").textContent).toBe("pt"));
    stream.emit("ui-locale:snapshot", "{broken");
    stream.emit("ui-locale:changed", { locale: "es", revision: 1 });
    expect(localStorage.getItem("vantare.locale")).toBe("pt");
    stream.emit("ui-locale:snapshot", { locale: "en", revision: 1 });
    await waitFor(() => expect(screen.getByTestId("locale").textContent).toBe("en"));
    view.unmount();
    expect(stream.closed).toBe(true);
    stream.emit("ui-locale:changed", { locale: "it", revision: 2 });
    expect(localStorage.getItem("vantare.locale")).toBe("en");
  });
});
