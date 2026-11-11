// @vitest-environment jsdom

import { webcrypto } from "node:crypto";
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
import { reportBinaryNames } from "../src/contract/generated/report_local";
import { reportDigest } from "../src/contract/report-digest";
import { HostProvider } from "../src/renderer/app/Host";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { localDiagnosticText as text } from "../src/renderer/i18n/testing-local";
import { LocalDiagnostic } from "../src/renderer/screens/testing/LocalDiagnostic";
import { ReportsProvider } from "../src/renderer/screens/testing/ReportsState";
import { ToastProvider } from "../src/renderer/ui/Layers";

const caches: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
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
        <ToastProvider>
          <ReportsProvider>
            <LocalDiagnostic />
          </ReportsProvider>
        </ToastProvider>
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
  it("clears a previous review before preparing again, including when the new preparation fails", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: text.prepare }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(text.prepared),
    );
    expect(document.querySelector("pre")).not.toBeNull();
    vi.spyOn(Client.prototype, "request").mockRejectedValueOnce(
      new HostFailure({ kind: "io" }),
    );
    fireEvent.click(screen.getByRole("button", { name: text.prepare }));
    expect(document.querySelector("pre")).toBeNull();
    await screen.findByRole("alert");
    expect(
      screen
        .getByRole("button", { name: text.export })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
  it("never enables exporting a report whose main-owned hash differs from its visible bytes", async () => {
    const original = Client.prototype.request;
    vi.spyOn(Client.prototype, "request").mockImplementation(function (
      this: Client,
      request,
    ) {
      return request.method === "report.localPrepare"
        ? Promise.resolve({
            method: request.method,
            value: {
              core: "unavailable",
              binaries: [],
              report: "{}",
              preparedHash: "f".repeat(64),
            },
          })
        : original.call(this, request);
    });
    await mount();
    fireEvent.click(screen.getByRole("button", { name: text.prepare }));
    await screen.findByRole("alert");
    expect(document.querySelector("pre")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: text.export })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
  it.each(["cancelled", "conflict"] as const)(
    "requires another preparation after the dialog returns %s",
    async (status) => {
      const original = Client.prototype.request;
      const calls = vi
        .spyOn(Client.prototype, "request")
        .mockImplementation(function (this: Client, request) {
          return request.method === "report.localExport"
            ? Promise.resolve({ method: request.method, status })
            : original.call(this, request);
        });
      await mount();
      fireEvent.click(screen.getByRole("button", { name: text.prepare }));
      await waitFor(() =>
        expect(screen.getByRole("status").textContent).toBe(text.prepared),
      );
      fireEvent.click(screen.getByRole("button", { name: text.export }));
      await waitFor(() => expect(document.querySelector("pre")).toBeNull());
      expect(
        screen
          .getByRole("button", { name: text.export })
          .hasAttribute("disabled"),
      ).toBe(true);
      expect(
        calls.mock.calls.filter(
          ([request]) => request.method === "report.localExport",
        ),
      ).toHaveLength(1);
      if (status === "conflict")
        expect(screen.getByRole("alert").textContent).toBe(text.conflict);
    },
  );
  it("requires an explicit prepared review before requesting the save dialog", async () => {
    await mount();
    const calls = vi.spyOn(Client.prototype, "request");
    fireEvent.click(screen.getByRole("button", { name: text.export }));
    expect(
      screen
        .getByRole("button", { name: text.export })
        .hasAttribute("disabled"),
    ).toBe(true);
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
    for (const name of reportBinaryNames)
      expect(screen.getByText(name)).toBeDefined();
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
    ).toEqual([
      [
        {
          method: "report.localExport",
          preparedHash: await reportDigest(preview),
        },
      ],
    ]);
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
        value: {
          core: "unavailable",
          binaries: [],
          report: "{}",
          preparedHash: await reportDigest("{}"),
        },
      });
    });
    expect(document.querySelector("pre")).toBeNull();
  });
});
