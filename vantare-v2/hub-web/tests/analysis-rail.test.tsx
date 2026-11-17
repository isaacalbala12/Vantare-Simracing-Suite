// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { useAnalysis } from "../src/renderer/app/AnalysisState";
import * as host from "../src/renderer/app/Host";
import { UiProvider, useUi } from "../src/renderer/app/UiState";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function AnalysisSubscription() {
  useAnalysis();
  return null;
}
function RailButton() {
  const collapsed = useUi((s) => s.railCollapsed),
    toggle = useUi((s) => s.toggleRail);
  return (
    <button type="button" aria-expanded={!collapsed} onClick={toggle}>
      Información
    </button>
  );
}
function App({
  cache,
  analysis = true,
}: {
  cache: QueryClient;
  analysis?: boolean;
}) {
  return (
    <QueryClientProvider client={cache}>
      <UiProvider>
        {analysis && <AnalysisSubscription />}
        <RailButton />
      </UiProvider>
    </QueryClientProvider>
  );
}

it("keeps manual rail toggles through content resizing and restores the entry preference on leaving analysis", async () => {
  let width = 900,
    notify: (() => void) | undefined;
  const body = document.createElement("div");
  body.className = "v-shell-body";
  Object.defineProperty(body, "clientWidth", { get: () => width });
  document.body.append(body);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      emit: () => void;
      constructor(callback: ResizeObserverCallback) {
        this.emit = () => callback([], this);
      }
      observe(target: Element) {
        if (target === body) notify = this.emit;
      }
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(host, "useHost").mockReturnValue({ client: undefined } as ReturnType<
    typeof host.useHost
  >);
  const cache = new QueryClient();
  const ui = render(<App cache={cache} />);
  try {
    const button = screen.getByRole("button", { name: "Información" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    act(() => notify?.());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    width = 890;
    act(() => notify?.());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    width = 1280;
    act(() => notify?.());
    await userEvent.click(button);
    act(() => notify?.());
    expect(button.getAttribute("aria-expanded")).toBe("false");
    width = 900;
    act(() => notify?.());
    expect(button.getAttribute("aria-expanded")).toBe("false");
    width = 1280;
    act(() => notify?.());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    width = 900;
    act(() => notify?.());
    ui.rerender(<App cache={cache} analysis={false} />);
    expect(button.getAttribute("aria-expanded")).toBe("true");
  } finally {
    ui.unmount();
    body.remove();
    cache.clear();
  }
});
