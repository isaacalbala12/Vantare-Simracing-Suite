// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockHost } from "../src/mock/host";
import { HostProvider } from "../src/renderer/app/Host";
import { testingCommunityText as text } from "../src/renderer/i18n/testing-community";
import { testingTriageText as triageText } from "../src/renderer/i18n/testing-triage";
import { TestingCommunity } from "../src/renderer/screens/testing/Community";
import { testingText } from "../src/renderer/screens/testing/es";
import {
  ReportsProvider,
  useReports,
} from "../src/renderer/screens/testing/ReportsState";
import { ToastProvider } from "../src/renderer/ui/Layers";
import { TestingCommunityView } from "../src/renderer/ui/TestingCommunityView";

let cache: QueryClient;
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
async function mount(scene: string) {
  window.history.replaceState(null, "", `/?escena=${scene}`);
  const hook = renderHook(useReports, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={cache}>
        <HostProvider>
          <ToastProvider>
            <ReportsProvider>
              {children}
              <TestingCommunity onDiagnostic={() => {}} />
            </ReportsProvider>
          </ToastProvider>
        </HostProvider>
      </QueryClientProvider>
    ),
  });
  await waitFor(() => expect(hook.result.current.access.verified).toBe(true));
  return hook;
}
it("keeps loaded contributions visible when the QA service disconnects and prevents another request", async () => {
  const hook = await mount("testing-tester-community-reference");
  await screen.findByText(text.empty);
  fireEvent.click(screen.getByRole("button", { name: testingText.reload }));
  await screen.findByText("QA · documentación de una prueba · En revisión");
  await waitFor(() => expect(hook.result.current.available).toBe(false));
  expect(hook.result.current.participationLoaded).toBe(true);
  expect(
    screen
      .getByRole("button", { name: testingText.reload })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen
      .getByRole("button", { name: triageText.prepare })
      .hasAttribute("disabled"),
  ).toBe(true);
});
it("updates the community list after a local mock Triage send without retaining private prose in that list", async () => {
  const hook = await mount("testing-tester-community");
  await screen.findByRole("heading", { name: triageText.title });
  fireEvent.change(
    screen.getByRole("textbox", { name: triageText.localTitle }),
    { target: { value: "PRIVATE COMMUNITY TITLE" } },
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: triageText.localBody }),
    { target: { value: "PRIVATE COMMUNITY NOTES" } },
  );
  fireEvent.click(screen.getByRole("checkbox", { name: triageText.consent }));
  fireEvent.click(screen.getByRole("button", { name: triageText.prepare }));
  await screen.findByRole("region", { name: triageText.preview });
  fireEvent.click(screen.getByRole("button", { name: triageText.send }));
  await screen.findByText("[contenido retirado por privacidad] · Recibida");
  expect(hook.result.current.participationLoaded).toBe(true);
  expect(JSON.stringify(hook.result.current.participation.reports)).not.toMatch(
    /PRIVATE COMMUNITY/,
  );
});
it("never renders the tester editor or contribution list for a verified non-tester", async () => {
  const hook = await mount("testing-reports");
  expect(hook.result.current.access.tester).toBe(false);
  expect(screen.queryByRole("heading", { name: triageText.title })).toBeNull();
  expect(
    screen.queryByRole("heading", { name: text.contributions }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: testingText.reload })).toBeNull();
});
it("uses the GPUI feminine contribution states without exposing receipt identifiers", () => {
  render(
    <TestingCommunityView
      header={null}
      editor={null}
      reports={Object.keys(text.states).map((state, i) => ({
        id: `private-id-${i}`,
        title: `Informe ${i}`,
        state,
        credit: false,
        updatedAt: null,
        fixedVersion: null,
        notice: false,
      }))}
    />,
  );
  for (const [i, label] of Object.values(text.states).entries())
    expect(screen.getByText(`Informe ${i} · ${label}`)).toBeTruthy();
  expect(document.body.textContent).not.toContain("private-id");
});

it("normalizes the closed visual scene before checking tester rights", () => {
  for (const scheme of ["dark", "light"]) {
    const host = createMockHost(
      `visual-${scheme}:testing-tester-community-reference`,
    );
    const reply = host({
      kind: "request",
      id: 1,
      request: { method: "testing.refresh" },
    });
    expect(reply).toMatchObject({
      kind: "response",
      result: {
        method: "testing.refresh",
        value: { reports: [{ title: "QA · documentación de una prueba" }] },
      },
    });
  }
});
