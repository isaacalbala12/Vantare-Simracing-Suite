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
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CoreStatus } from "../src/contract/generated/contract";
import { coreKey, HostProvider } from "../src/renderer/app/Host";
import { Client } from "../src/renderer/bridge/client";
import { testingQuestionnairesText as text } from "../src/renderer/i18n/testing-questionnaires";
import { TestingQuestionnaires } from "../src/renderer/screens/testing/Questionnaires";
import { ReportsProvider } from "../src/renderer/screens/testing/ReportsState";
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
  render(
    <QueryClientProvider client={cache}>
      <HostProvider>
        <ToastProvider>
          <ReportsProvider>
            <TestingQuestionnaires onDiagnostic={() => {}} />
          </ReportsProvider>
        </ToastProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Recargar" }).hasAttribute("disabled"),
    ).toBe(false),
  );
}
async function select() {
  fireEvent.click(screen.getByRole("button", { name: "Recargar" }));
  fireEvent.click(
    await screen.findByRole("button", { name: /Cuestionario local de QA/ }),
  );
}
it("sends only the selected score after an explicit save, keeps the note local and prevents double submission", async () => {
  await mount();
  const calls = vi.spyOn(Client.prototype, "request");
  await select();
  fireEvent.change(screen.getByRole("textbox", { name: text.note }), {
    target: { value: "PRIVATE_NOTE_NEVER_SEND" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^5$/ }));
  expect(
    calls.mock.calls.some(([request]) => request.method === "testing.answer"),
  ).toBe(false);
  const save = screen.getByRole("button", { name: text.save });
  fireEvent.click(save);
  fireEvent.click(save);
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: /Cuestionario local de QA.*Respondido/,
      }),
    ).toBeTruthy(),
  );
  const answers = calls.mock.calls.filter(
    ([request]) => request.method === "testing.answer",
  );
  expect(answers).toHaveLength(1);
  expect(answers[0][0]).toEqual({
    method: "testing.answer",
    id: "15350000-0000-0000-0000-000000000001",
    score: 5,
  });
  expect(JSON.stringify(calls.mock.calls)).not.toContain(
    "PRIVATE_NOTE_NEVER_SEND",
  );
});
it("keeps a selected local note but disables saving and reload when the core disconnects", async () => {
  await mount();
  await select();
  fireEvent.change(screen.getByRole("textbox", { name: text.note }), {
    target: { value: "LOCAL_ONLY" },
  });
  const calls = vi.spyOn(Client.prototype, "request");
  act(() =>
    cache.setQueryData(coreKey, {
      ...cache.getQueryData<CoreStatus>(coreKey),
      services: "unavailable",
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: text.save }).hasAttribute("disabled"),
    ).toBe(true),
  );
  expect(
    screen.getByRole("button", { name: "Recargar" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(
    (screen.getByRole("textbox", { name: text.note }) as HTMLTextAreaElement)
      .value,
  ).toBe("LOCAL_ONLY");
  fireEvent.click(screen.getByRole("button", { name: text.save }));
  expect(calls).not.toHaveBeenCalled();
});
it("reproduces cached reference data after disconnecting, without accepting another refresh offline", async () => {
  window.history.replaceState(
    null,
    "",
    "/?escena=testing-tester-questionnaires-reference",
  );
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Recargar" }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: /0.0.974.*QA.*experiencia del Hub/,
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: text.save }).hasAttribute("disabled"),
    ).toBe(true),
  );
  expect(cache.getQueryData<CoreStatus>(coreKey)?.services).toBe("unavailable");
  expect(
    screen.getByRole("button", { name: "Recargar" }).hasAttribute("disabled"),
  ).toBe(true);
});
