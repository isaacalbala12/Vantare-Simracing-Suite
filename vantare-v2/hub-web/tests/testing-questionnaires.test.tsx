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
import {
  type CoreStatus,
  testingAnswerNoteMaxChars,
} from "../src/contract/generated/contract";
import { AccountProvider } from "../src/renderer/app/AccountState";
import { coreKey, HostProvider } from "../src/renderer/app/Host";
import { Client } from "../src/renderer/bridge/client";
import { testingQuestionnairesText as text } from "../src/renderer/i18n/testing-questionnaires";
import { TestingQuestionnaires } from "../src/renderer/screens/testing/Questionnaires";
import { ReportsProvider } from "../src/renderer/screens/testing/ReportsState";
import { ToastProvider } from "../src/renderer/ui/Layers";

let cache: QueryClient;
beforeEach(async () => {
  // Load the local fixture before the UI readiness assertion, outside its timeout.
  await import("../src/mock/host");
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
          <AccountProvider>
            <ReportsProvider>
              <TestingQuestionnaires onDiagnostic={() => {}} />
            </ReportsProvider>
          </AccountProvider>
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
it("sends the selected score and edited note only after explicit save and prevents double submission", async () => {
  await mount();
  const calls = vi.spyOn(Client.prototype, "request");
  await select();
  fireEvent.change(screen.getByRole("textbox", { name: text.note }), {
    target: { value: "Comentario editado" },
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
    note: "Comentario editado",
  });
  fireEvent.click(
    screen.getByRole("button", { name: /Cuestionario local de QA/ }),
  );
  expect(
    (screen.getByRole("textbox", { name: text.note }) as HTMLTextAreaElement)
      .value,
  ).toBe("Comentario editado");
});
it("preloads the prior score and note and sends an intentional empty note", async () => {
  window.history.replaceState(
    null,
    "",
    "/?escena=testing-tester-questionnaire-note",
  );
  await mount();
  await select();
  const field = screen.getByRole("textbox", { name: text.note });
  expect((field as HTMLTextAreaElement).value).toBe(
    "Comentario guardado anteriormente.",
  );
  expect(
    screen.getByRole("button", { name: "4 ✓" }).getAttribute("aria-pressed"),
  ).toBe("true");
  const calls = vi.spyOn(Client.prototype, "request");
  fireEvent.change(field, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: text.save }));
  await waitFor(() =>
    expect(
      calls.mock.calls.some(([value]) => value.method === "testing.answer"),
    ).toBe(true),
  );
  expect(
    calls.mock.calls.find(([value]) => value.method === "testing.answer")?.[0],
  ).toEqual({
    method: "testing.answer",
    id: "15350000-0000-0000-0000-000000000001",
    score: 4,
    note: "",
  });
  const answerIndex = calls.mock.calls.findIndex(
    ([value]) => value.method === "testing.answer",
  );
  await act(async () => {
    await calls.mock.results[answerIndex].value;
  });
  fireEvent.click(
    screen.getByRole("button", { name: /Cuestionario local de QA/ }),
  );
  expect(
    (screen.getByRole("textbox", { name: text.note }) as HTMLTextAreaElement)
      .value,
  ).toBe("");
});
it("validates the scalar character limit after saving is attempted and keeps focus and text", async () => {
  await mount();
  await select();
  const calls = vi.spyOn(Client.prototype, "request");
  const field = screen.getByRole("textbox", { name: text.note });
  const note = "😀".repeat(testingAnswerNoteMaxChars + 1);
  fireEvent.change(field, { target: { value: note } });
  expect(
    screen.queryByText(text.noteTooLong(testingAnswerNoteMaxChars)),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: text.save }));
  expect(
    await screen.findByText(text.noteTooLong(testingAnswerNoteMaxChars)),
  ).toBeTruthy();
  expect(document.activeElement).toBe(field);
  expect((field as HTMLTextAreaElement).value).toBe(note);
  expect(
    calls.mock.calls.some(([value]) => value.method === "testing.answer"),
  ).toBe(false);
  fireEvent.change(field, {
    target: { value: "😀".repeat(testingAnswerNoteMaxChars) },
  });
  expect(
    screen.queryByText(text.noteTooLong(testingAnswerNoteMaxChars)),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: text.save }));
  await waitFor(() =>
    expect(
      calls.mock.calls.some(([value]) => value.method === "testing.answer"),
    ).toBe(true),
  );
  const row = await screen.findByRole("button", {
    name: /Cuestionario local de QA.*Respondido/,
  });
  fireEvent.click(row);
  expect(
    (screen.getByRole("textbox", { name: text.note }) as HTMLTextAreaElement)
      .value,
  ).toBe("😀".repeat(testingAnswerNoteMaxChars));
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

it.each([
  "testing-tester-questionnaires-reference",
  "visual-light:testing-tester-questionnaires-reference",
])("keeps the product status after loading QA data in %s", async (scene) => {
  window.history.replaceState(null, "", `/?escena=${scene}`);
  await mount();
  expect(screen.queryByText(text.loaded)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Recargar" }));
  expect(await screen.findByText(text.loaded)).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: "0.0.974 · QA · experiencia del Hub · Sin responder",
    }),
  ).toBeTruthy();
});
