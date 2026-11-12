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
import type { HostToUi } from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus.json";
import { AccountProvider } from "../src/renderer/app/AccountState";
import { HostProvider } from "../src/renderer/app/Host";
import {
  SectionChromeProvider,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import { UiProvider, useUi } from "../src/renderer/app/UiState";
import { Client } from "../src/renderer/bridge/client";
import { testingQuestionnairesText } from "../src/renderer/i18n/testing-questionnaires";
import TestingEntry from "../src/renderer/screens/testing/entry";
import {
  ReportsProvider,
  useReports,
} from "../src/renderer/screens/testing/ReportsState";
import { ToastProvider } from "../src/renderer/ui/Layers";

function ReportProbe({
  read,
}: {
  read: (value: ReturnType<typeof useReports>) => void;
}) {
  read(useReports());
  return null;
}
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
function OpenReports() {
  const navigate = useUi((state) => state.navigate);
  return (
    <button type="button" onClick={() => navigate("testing", "reports")}>
      Abrir aviso de informe
    </button>
  );
}
async function mount() {
  render(
    <QueryClientProvider client={cache}>
      <HostProvider>
        <ToastProvider>
          <AccountProvider>
            <ReportsProvider>
              <UiProvider>
                <SectionChromeProvider>
                  <SectionTabsSlot />
                  <TestingEntry />
                  <OpenReports />
                </SectionChromeProvider>
              </UiProvider>
            </ReportsProvider>
          </AccountProvider>
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

it("opens the report list from an external notice, consumes the target and permits changing tabs", async () => {
  await mount();
  fireEvent.click(
    screen.getByRole("button", { name: "Abrir aviso de informe" }),
  );
  await screen.findByRole("heading", { name: "Mis informes" });
  expect(
    screen.getByRole("tab", { name: "Informes" }).getAttribute("aria-selected"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("tab", { name: "Resumen" }));
  expect(
    screen.getByRole("tab", { name: "Resumen" }).getAttribute("aria-selected"),
  ).toBe("true");
  fireEvent.click(
    screen.getByRole("button", { name: "Abrir aviso de informe" }),
  );
  await screen.findByRole("heading", { name: "Mis informes" });
});

it("keeps a visible discard notice through reloads, incidental account updates and tab changes", async () => {
  window.history.replaceState(null, "", "/?escena=testing-tester-reports");
  const listeners = new Set<(message: HostToUi) => void>();
  const listen = Client.prototype.listen;
  vi.spyOn(Client.prototype, "listen").mockImplementation(function (
    this: Client,
    fn,
  ) {
    listeners.add(fn);
    const stop = listen.call(this, fn);
    return () => {
      listeners.delete(fn);
      return stop();
    };
  });
  let reports: ReturnType<typeof useReports> | undefined;
  // Same production entry and providers as mount; the probe only exposes actions for this regression.
  render(
    <QueryClientProvider client={cache}>
      <HostProvider>
        <ToastProvider>
          <AccountProvider>
            <ReportsProvider>
              <UiProvider>
                <SectionChromeProvider>
                  <SectionTabsSlot />
                  <TestingEntry />
                  <ReportProbe
                    read={(value) => {
                      reports = value;
                    }}
                  />
                </SectionChromeProvider>
              </UiProvider>
            </ReportsProvider>
          </AccountProvider>
        </ToastProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(reports?.available).toBe(true));
  await act(async () => {
    await reports?.load();
  });
  act(() => reports?.editLocal({ title: "UNSAVED_PRIVATE_NOTE_A" }));
  const sample = (corpus.host as HostToUi[]).find(
    (m) => m.kind === "response" && m.result.method === "account.get",
  );
  if (sample?.kind !== "response" || sample.result.method !== "account.get")
    throw new Error("missing account fixture");
  const event: HostToUi = {
    kind: "event",
    event: {
      topic: "account",
      value: {
        ...sample.result.value,
        session: "signedIn",
        gate: "none",
        verified: true,
        blocked: false,
      },
    },
  };
  act(() => {
    for (const receive of listeners) receive(event);
  });
  const warning =
    "La sesión ha cambiado y el informe sin guardar se ha descartado";
  expect(await screen.findByText(warning)).toBeTruthy();
  expect(screen.queryByText("UNSAVED_PRIVATE_NOTE_A")).toBeNull();
  await act(async () => {
    await reports?.load();
    await reports?.refresh();
  });
  act(() => {
    for (const receive of listeners) receive(event);
  });
  fireEvent.click(screen.getByRole("tab", { name: "Cuestionarios" }));
  expect(screen.getByText(warning)).toBeTruthy();
  expect(reports?.sessionDiscarded).toBe(true);
});
