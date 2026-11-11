// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { triageItems } from "../src/contract/generated/triage";
import { HostProvider } from "../src/renderer/app/Host";
import { Client } from "../src/renderer/bridge/client";
import { testingTriageText as text } from "../src/renderer/i18n/testing-triage";
import {
  ReportsProvider,
  useReports,
} from "../src/renderer/screens/testing/ReportsState";
import { TriageEditor } from "../src/renderer/screens/testing/TriageEditor";
import { ToastProvider } from "../src/renderer/ui/Layers";

let cache: QueryClient;
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  window.history.replaceState(null, "", "/?escena=testing-tester-reports");
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  cache.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
async function mount() {
  const hook = renderHook(useReports, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={cache}>
        <HostProvider>
          <ToastProvider>
            <ReportsProvider>
              {children}
              <TriageEditor />
            </ReportsProvider>
          </ToastProvider>
        </HostProvider>
      </QueryClientProvider>
    ),
  });
  await waitFor(() => expect(hook.result.current.available).toBe(true));
  return hook;
}
it("sends only the reviewed structured selection and opaque id, never local prose, and serializes double send", async () => {
  const hook = await mount();
  const calls = vi.spyOn(Client.prototype, "request");
  fireEvent.change(screen.getByRole("textbox", { name: text.localTitle }), {
    target: { value: "PRIVATE_LOCAL_TITLE" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: text.localBody }), {
    target: { value: "PRIVATE_LOCAL_BODY" },
  });
  expect(
    screen.getByRole("button", { name: text.prepare }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: text.choices.system }));
  fireEvent.click(screen.getByRole("checkbox", { name: text.consent }));
  fireEvent.click(screen.getByRole("button", { name: text.prepare }));
  const preview = await screen.findByRole("region", { name: text.preview });
  expect(preview.textContent).not.toMatch(
    /PRIVATE_LOCAL_TITLE|PRIVATE_LOCAL_BODY/,
  );
  expect(
    calls.mock.calls.filter(([request]) => request.method === "triage.prepare"),
  ).toEqual([
    [
      {
        method: "triage.prepare",
        selection: { items: triageItems.filter((item) => item !== "system") },
        consent: true,
      },
    ],
  ]);
  const send = screen.getByRole("button", { name: text.send });
  fireEvent.click(send);
  fireEvent.click(send);
  await waitFor(() =>
    expect(hook.result.current.participation.reports).toHaveLength(1),
  );
  expect(
    calls.mock.calls.filter(([request]) => request.method === "triage.send"),
  ).toHaveLength(1);
  expect(JSON.stringify(calls.mock.calls)).not.toMatch(
    /PRIVATE_LOCAL_TITLE|PRIVATE_LOCAL_BODY/,
  );
  expect(screen.queryByRole("region", { name: text.preview })).toBeNull();
  await act(async () => {
    await hook.result.current.refresh();
  });
  expect(hook.result.current.participation.reports).toHaveLength(1);
});
it("revokes preview and consent immediately when the local note or selected evidence changes", async () => {
  await mount();
  fireEvent.click(screen.getByRole("checkbox", { name: text.consent }));
  fireEvent.click(screen.getByRole("button", { name: text.prepare }));
  await screen.findByRole("region", { name: text.preview });
  fireEvent.change(screen.getByRole("textbox", { name: text.localBody }), {
    target: { value: "Local edit" },
  });
  expect(screen.queryByRole("region", { name: text.preview })).toBeNull();
  expect(
    screen
      .getByRole("checkbox", { name: text.consent })
      .getAttribute("aria-checked"),
  ).toBe("false");
  expect(
    screen.getByRole("button", { name: text.prepare }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: text.consent }));
  fireEvent.click(screen.getByRole("checkbox", { name: text.choices.app_log }));
  expect(
    screen
      .getByRole("checkbox", { name: text.consent })
      .getAttribute("aria-checked"),
  ).toBe("false");
});

it("retries Busy through the Testing queue without losing the reviewed selection", async () => {
  window.history.replaceState(null, "", "/?escena=testing-tester-triage-busy");
  const hook = await mount();
  const calls = vi.spyOn(Client.prototype, "request");
  fireEvent.click(screen.getByRole("checkbox", { name: text.choices.system }));
  fireEvent.click(screen.getByRole("checkbox", { name: text.consent }));
  fireEvent.click(screen.getByRole("button", { name: text.prepare }));
  await screen.findByRole("region", { name: text.preview });
  const requests = calls.mock.calls.filter(
    ([request]) => request.method === "triage.prepare",
  );
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual(requests[1]);
  expect(requests[0][0]).toEqual({
    method: "triage.prepare",
    selection: { items: triageItems.filter((item) => item !== "system") },
    consent: true,
  });
  expect(hook.result.current.busy).toBe(false);
});
