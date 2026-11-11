// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HostProvider } from "../src/renderer/app/Host";
import { Client } from "../src/renderer/bridge/client";
import { testingDiscardText as dialog } from "../src/renderer/i18n/testing-discard";
import { testingText as text } from "../src/renderer/screens/testing/es";
import { ReportsProvider } from "../src/renderer/screens/testing/ReportsState";
import { Reports } from "../src/renderer/screens/testing/Testing";
import { ToastProvider } from "../src/renderer/ui/Layers";

const caches: QueryClient[] = [];
beforeEach(() =>
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })),
);
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
it.each(["editor", "error"] as const)(
  "confirms discard from %s and preserves the draft when cancelled",
  async (source) => {
    window.history.replaceState(
      null,
      "",
      `/?escena=${source === "error" ? "testing-save-error" : "testing-reports"}`,
    );
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    caches.push(cache);
    const calls = vi.spyOn(Client.prototype, "request");
    render(
      <QueryClientProvider client={cache}>
        <HostProvider>
          <ToastProvider>
            <ReportsProvider>
              <Reports />
            </ReportsProvider>
          </ToastProvider>
        </HostProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: text.withScreenshots }),
    );
    const input = screen.getByLabelText(text.action) as HTMLInputElement;
    await waitFor(() => expect(input.disabled).toBe(false));
    fireEvent.change(input, { target: { value: "Conservar hasta confirmar" } });
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: text.save })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    if (source === "error") {
      fireEvent.click(screen.getByRole("button", { name: text.save }));
      await screen.findByText(text.failed);
    }
    fireEvent.click(screen.getAllByRole("button", { name: text.discard })[0]);
    let popup = await screen.findByRole("alertdialog", { name: dialog.title });
    expect(
      calls.mock.calls.filter(
        ([request]) => request.method === "draft.discard",
      ),
    ).toHaveLength(0);
    fireEvent.click(within(popup).getByRole("button", { name: dialog.cancel }));
    expect(input.value).toBe("Conservar hasta confirmar");
    expect(
      calls.mock.calls.filter(
        ([request]) => request.method === "draft.discard",
      ),
    ).toHaveLength(0);
    fireEvent.click(screen.getAllByRole("button", { name: text.discard })[0]);
    popup = await screen.findByRole("alertdialog", { name: dialog.title });
    fireEvent.click(
      within(popup).getByRole("button", { name: dialog.confirm }),
    );
    await waitFor(() =>
      expect(
        calls.mock.calls.filter(
          ([request]) => request.method === "draft.discard",
        ),
      ).toHaveLength(1),
    );
    await waitFor(() => expect(input.value).toBe(""));
  },
);
