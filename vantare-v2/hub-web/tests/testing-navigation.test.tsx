// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HostProvider } from "../src/renderer/app/Host";
import {
  SectionChromeProvider,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import { testingQuestionnairesText } from "../src/renderer/i18n/testing-questionnaires";
import TestingEntry from "../src/renderer/screens/testing/entry";
import { ReportsProvider } from "../src/renderer/screens/testing/ReportsState";
import { ToastProvider } from "../src/renderer/ui/Layers";

let cache: QueryClient;
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  window.history.replaceState(null, "", "/?escena=testing-tester-reference");
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
            <SectionChromeProvider>
              <SectionTabsSlot />
              <TestingEntry />
            </SectionChromeProvider>
          </ReportsProvider>
        </ToastProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("tab", { name: "Resumen" })
        .getAttribute("aria-selected"),
    ).toBe("true"),
  );
}
it("keeps the GPUI diagnostic overlay independent of the selected tab", async () => {
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Diagnóstico local" }));
  expect(
    screen.getByRole("heading", { name: "Informe de diagnóstico" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("tab", { name: "Resumen" }).getAttribute("aria-selected"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("tab", { name: "Informes" }));
  expect(
    screen.getByRole("heading", { name: "Informe de diagnóstico" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Diagnóstico local" }));
  expect(
    screen.queryByRole("heading", { name: "Informe de diagnóstico" }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Ver mis informes" })).toBeTruthy();
});
it("preserves the reports subview across tabs and diagnostics, while New report explicitly selects compose", async () => {
  await mount();
  fireEvent.click(screen.getByRole("tab", { name: "Informes" }));
  fireEvent.click(screen.getByRole("button", { name: "Ver mis informes" }));
  expect(screen.getByRole("heading", { name: "Mis informes" })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Resumen" }));
  fireEvent.click(screen.getByRole("tab", { name: "Informes" }));
  expect(screen.getByRole("heading", { name: "Mis informes" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Diagnóstico local" }));
  fireEvent.click(screen.getByRole("button", { name: "Diagnóstico local" }));
  expect(screen.getByRole("heading", { name: "Mis informes" })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Resumen" }));
  fireEvent.click(screen.getByRole("button", { name: "Nuevo informe" }));
  expect(
    screen.getByRole("tab", { name: "Informes" }).getAttribute("aria-selected"),
  ).toBe("true");
  expect(screen.queryByRole("heading", { name: "Mis informes" })).toBeNull();
});

it("acknowledges a successful refresh even when there are no reports", async () => {
  window.history.replaceState(null, "", "/?escena=testing-tester-reports");
  await mount();
  fireEvent.click(screen.getByRole("button", { name: /^Recargar$/ }));
  await screen.findByText("Datos confirmados por el servicio");
  expect(screen.getByText("Aún no hay informes cargados")).toBeTruthy();
});

it("preserves questionnaire edits across Summary and the shared diagnostic overlay", async () => {
  window.history.replaceState(null, "", "/?escena=testing-tester-reports");
  await mount();
  fireEvent.click(screen.getByRole("tab", { name: "Cuestionarios" }));
  fireEvent.click(screen.getByRole("button", { name: /^Recargar$/ }));
  fireEvent.click(
    await screen.findByRole("button", { name: /Cuestionario local de QA/ }),
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: testingQuestionnairesText.note }),
    { target: { value: "Nota privada entre pestañas" } },
  );
  fireEvent.click(screen.getByRole("tab", { name: "Resumen" }));
  expect(
    screen.getByRole("heading", { name: "Tu experiencia cuenta" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Cuestionarios" }));
  expect(
    (
      screen.getByRole("textbox", {
        name: testingQuestionnairesText.note,
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("Nota privada entre pestañas");
  fireEvent.click(screen.getByRole("button", { name: "Diagnóstico local" }));
  expect(
    screen.getByRole("heading", { name: "Informe de diagnóstico" }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("tab", { name: "Cuestionarios" })
      .getAttribute("aria-selected"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Diagnóstico local" }));
  expect(
    (
      screen.getByRole("textbox", {
        name: testingQuestionnairesText.note,
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("Nota privada entre pestañas");
});
