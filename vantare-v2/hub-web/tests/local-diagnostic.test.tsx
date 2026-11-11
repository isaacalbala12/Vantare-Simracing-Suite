// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Reply } from "../src/contract/generated/contract";
import { HostProvider } from "../src/renderer/app/Host";
import { Client } from "../src/renderer/bridge/client";
import { LocalDiagnostic } from "../src/renderer/screens/testing/LocalDiagnostic";
import { localDiagnosticText as text } from "../src/renderer/screens/testing/local-diagnostic.es";
import { ReportsProvider } from "../src/renderer/screens/testing/ReportsState";

const caches: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  window.history.replaceState(null, "", "/?escena=testing-reports");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  window.history.replaceState(null, "", "/");
});
async function mount() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  caches.push(cache);
  const result = render(
    <QueryClientProvider client={cache}>
      <HostProvider>
        <ReportsProvider>
          <LocalDiagnostic />
        </ReportsProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: text.prepare })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  return result;
}
describe("local diagnostic review and main-only export", () => {
  it("requires an explicit prepared review before requesting the save dialog", async () => {
    await mount();
    const calls = vi.spyOn(Client.prototype, "request");
    fireEvent.click(screen.getByRole("button", { name: text.export }));
    expect(screen.getByRole("alert").textContent).toBe(text.prepareFirst);
    expect(
      calls.mock.calls.some(
        ([request]) => request.method === "report.localExport",
      ),
    ).toBe(false);
  });
  it("shows the exact safe payload and asks main to export without text or a destination", async () => {
    const original = Client.prototype.request;
    const calls = vi
      .spyOn(Client.prototype, "request")
      .mockImplementation(function (this: Client, request) {
        return request.method === "report.localExport"
          ? Promise.resolve({ method: "report.localExport", status: "saved" })
          : original.call(this, request);
      });
    await mount();
    fireEvent.click(screen.getByRole("button", { name: text.prepare }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(text.prepared),
    );
    const preview = document.querySelector("pre")?.textContent ?? "";
    expect(JSON.parse(preview)).toMatchObject({
      privateText: "omitted_for_privacy",
    });
    fireEvent.click(screen.getByRole("button", { name: text.export }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(text.saved),
    );
    expect(
      calls.mock.calls.filter(
        ([request]) => request.method === "report.localExport",
      ),
    ).toEqual([[{ method: "report.localExport" }]]);
  });
  it("discards a preparation that arrives after leaving the view", async () => {
    const original = Client.prototype.request;
    let deliver: ((reply: Reply) => void) | undefined;
    vi.spyOn(Client.prototype, "request").mockImplementation(function (
      this: Client,
      request,
    ) {
      return request.method === "report.localPrepare"
        ? new Promise<Reply>((resolve) => {
            deliver = resolve;
          })
        : original.call(this, request);
    });
    const view = await mount();
    fireEvent.click(screen.getByRole("button", { name: text.prepare }));
    await waitFor(() => expect(deliver).toBeDefined());
    view.unmount();
    await act(async () => {
      deliver?.({
        method: "report.localPrepare",
        value: { core: "unavailable", binaries: [], report: "{}" },
      });
    });
    expect(document.querySelector("pre")).toBeNull();
  });
});
