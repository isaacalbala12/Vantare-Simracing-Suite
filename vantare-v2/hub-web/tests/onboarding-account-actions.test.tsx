// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
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
import settings from "../fixtures/settings-base.json";
import type { HostToUi, Request } from "../src/contract/generated/contract";
import { createMockHost } from "../src/mock/host";
import { HostFailure } from "../src/renderer/bridge/client";
import { accessText } from "../src/renderer/i18n/access.es";
import { OnboardingAccountIntro } from "../src/renderer/screens/onboarding/AccountIntro";
import { ToastProvider, TooltipProvider } from "../src/renderer/ui/Layers";

const fake = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../src/renderer/app/Host", () => {
  const client = {
    request: fake.request,
    listen: (_listener: (value: HostToUi) => void) => () => {},
    subscribe: () => () => {},
    addCloseGuard: () => () => {},
  };
  return { useHost: () => ({ client }) };
});
vi.mock("../src/renderer/app/SettingsState", () => ({
  useSettings: () => ({
    view: {
      ...settings,
      appearance: { ...settings.appearance, reducedMotion: true },
    },
    pending: false,
    update: vi.fn(),
  }),
}));
vi.mock("../src/renderer/app/WindowControls", () => ({
  WindowControls: () => null,
}));
beforeEach(() => {
  fake.request.mockReset();
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function mount(signedIn = false, configured = true) {
  let id = 0;
  const account = createMockHost(signedIn ? "cuenta-base" : "onboarding-3");
  const onboarding = createMockHost("onboarding-3");
  fake.request.mockImplementation(async (request: Request) => {
    if (request.method === "onboarding.prices")
      return { method: request.method, accepted: true };
    const reply = (
      request.method.startsWith("account.") ? account : onboarding
    )({ kind: "request", id: ++id, request });
    if (reply?.kind === "failure") throw new HostFailure(reply.error);
    if (reply?.kind !== "response") throw new Error("response missing");
    if (reply.result.method === "account.get" && !configured)
      return {
        ...reply.result,
        value: { ...reply.result.value, configured: false },
      };
    return reply.result;
  });
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={query}>
      <CSPProvider disableStyleElements>
        <TooltipProvider>
          <ToastProvider>
            <OnboardingAccountIntro extended onLeave={() => {}} />
          </ToastProvider>
        </TooltipProvider>
      </CSPProvider>
    </QueryClientProvider>,
  );
  const start = await screen.findByRole("button", { name: "Empezar" });
  await waitFor(() => expect(start.hasAttribute("disabled")).toBe(false));
  fireEvent.click(start);
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  if (configured) {
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Elegir Pro" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
  } else
    await screen.findByText("El acceso no está configurado en esta versión.");
}
it("shows the three native sign-in choices and reuses Access's hosted browser flow", async () => {
  await mount();
  for (const name of [
    "Continuar con Discord",
    "Continuar con Google",
    "Continuar con email",
  ])
    expect(screen.getByRole("button", { name })).toBeTruthy();
  for (const name of ["Continuar con Discord", "Continuar con Google"]) {
    fireEvent.click(screen.getByRole("button", { name }));
    await screen.findByText(accessText.waitingBrowser);
    fireEvent.click(screen.getByRole("button", { name: accessText.cancel }));
    await screen.findByRole("button", { name: "Continuar con email" });
  }
  expect(
    fake.request.mock.calls.filter(([r]) => r.method === "account.begin"),
  ).toHaveLength(2);
});
it("opens the existing email form and retains the current wizard step", async () => {
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Continuar con email" }));
  await screen.findByRole("textbox", { name: accessText.emailLabel });
  expect(
    screen.queryByRole("button", { name: "Continuar con Discord" }),
  ).toBeNull();
  expect(screen.getByRole("heading", { name: /GUARDA TU/ })).toBeTruthy();
  expect(
    fake.request.mock.calls.some(
      ([r]) =>
        r.method === "account.email" &&
        r.action.action === "open" &&
        r.action.mode === "signInCode",
    ),
  ).toBe(true);
});
it("Pro without a session opens email instead of a purchase or prices", async () => {
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Elegir Pro" }));
  await screen.findByRole("textbox", { name: accessText.emailLabel });
  expect(
    fake.request.mock.calls.some(([r]) =>
      ["account.purchase", "onboarding.prices"].includes(r.method),
    ),
  ).toBe(false);
});
it("Pro with a session purchases the existing product once on a batched double click", async () => {
  await mount(true);
  const pro = screen.getByRole("button", { name: "Elegir Pro" });
  act(() => {
    pro.click();
    pro.click();
  });
  await screen.findByText("Ya hay una compra en espera de comprobación.");
  expect(
    fake.request.mock.calls
      .filter(([r]) => r.method === "account.purchase")
      .map(([r]) => r),
  ).toEqual([{ method: "account.purchase", product: "proMonthly" }]);
  expect(
    fake.request.mock.calls.some(([r]) => r.method === "onboarding.prices"),
  ).toBe(false);
});
it("Plus and Launch open prices instead of a purchase", async () => {
  await mount(true);
  for (const name of ["Elegir Pro Plus", /LAUNCH EDITION/]) {
    const button = screen.getByRole("button", { name });
    fireEvent.click(button);
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  }
  expect(
    fake.request.mock.calls.filter(([r]) => r.method === "onboarding.prices"),
  ).toHaveLength(2);
  expect(
    fake.request.mock.calls.some(([r]) => r.method === "account.purchase"),
  ).toBe(false);
});

it("keeps public prices usable when account access is not configured", async () => {
  await mount(false, false);
  expect(
    screen.getByRole("button", { name: "Elegir Pro" }).hasAttribute("disabled"),
  ).toBe(true);
  const plus = screen.getByRole("button", { name: "Elegir Pro Plus" });
  expect(plus.hasAttribute("disabled")).toBe(false);
  fireEvent.click(plus);
  await waitFor(() =>
    expect(
      fake.request.mock.calls.filter(([r]) => r.method === "onboarding.prices"),
    ).toHaveLength(1),
  );
  expect(
    fake.request.mock.calls.some(([r]) => r.method === "account.purchase"),
  ).toBe(false);
});
