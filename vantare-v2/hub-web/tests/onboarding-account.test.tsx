// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AccountView } from "../src/contract/generated/account";
import type { HostToUi } from "../src/contract/generated/contract";
import { createMockHost } from "../src/mock/host";
import { OnboardingAccountIntro } from "../src/renderer/screens/onboarding/AccountIntro";

const fake = vi.hoisted(() => ({
  request: vi.fn(),
  unsubscribe: vi.fn(),
  listeners: new Set<(message: HostToUi) => void>(),
}));
vi.mock("../src/renderer/app/Host", () => {
  const client = {
    request: fake.request,
    subscribe: () => fake.unsubscribe,
    listen: (listener: (message: HostToUi) => void) => {
      fake.listeners.add(listener);
      return () => fake.listeners.delete(listener);
    },
  };
  return { useHost: () => ({ client }) };
});
vi.mock("../src/renderer/screens/onboarding/IntroPreview", async () => {
  const { AccountStep } = await import(
    "../src/renderer/ui/onboarding/AccountStep"
  );
  return {
    OnboardingIntroPreview: ({
      account,
    }: {
      account: Parameters<typeof AccountStep>[0]["value"];
    }) => <AccountStep value={account} />,
  };
});
function account(): AccountView {
  const reply = createMockHost("acceso-base")({
    kind: "request",
    id: 1,
    request: { method: "account.get" },
  });
  if (reply?.kind !== "response" || reply.result.method !== "account.get")
    throw new Error("account fixture missing");
  return {
    ...reply.result.value,
    session: "signedOut",
    gate: "none",
    working: false,
    blocked: false,
    verified: false,
    plan: { kind: "unverified" },
  };
}
function mount() {
  return render(<OnboardingAccountIntro extended onLeave={() => {}} />);
}
function update(value: AccountView) {
  act(() => {
    for (const listener of fake.listeners)
      listener({ kind: "event", event: { topic: "account", value } });
  });
}
beforeEach(() => {
  fake.request.mockReset();
  fake.unsubscribe.mockReset();
  fake.listeners.clear();
});
afterEach(cleanup);
it("uses Access's initial read, follows its topic and releases it on leaving the wizard", async () => {
  fake.request.mockResolvedValue({ method: "account.get", value: account() });
  const view = mount();
  await screen.findByText("Puedes continuar sin cuenta.");
  expect(fake.request.mock.calls.map(([request]) => request)).toEqual([
    { method: "account.get" },
  ]);
  update({
    ...account(),
    session: "signedIn",
    verified: true,
    plan: { kind: "verified" },
  });
  expect(document.querySelector(".v-ob-account > p")?.textContent).toBe(
    "Acceso verificado",
  );
  expect(screen.queryByText(/Tu plan: Pro/)).toBeNull();
  update({ ...account(), session: "signedIn", verified: false });
  expect(document.querySelector(".v-ob-account > p")?.textContent).toBe(
    "Cuenta conectada · plan sin confirmar",
  );
  update({
    ...account(),
    session: "signedIn",
    verified: true,
    blocked: true,
    working: true,
    plan: { kind: "founders" },
  });
  expect(document.querySelector(".v-ob-account > p")?.textContent).toBe(
    "Acceso bloqueado",
  );
  view.unmount();
  expect(fake.unsubscribe).toHaveBeenCalledOnce();
  expect(fake.listeners.size).toBe(0);
});
it("shows checking until the initial response and never invents a signed-in account", async () => {
  let release!: (reply: unknown) => void;
  fake.request.mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  mount();
  expect(document.querySelector(".v-ob-account > p")?.textContent).toBe(
    "Comprobando cuenta…",
  );
  await act(async () => release({ method: "account.get", value: account() }));
  expect(document.querySelector(".v-ob-account > p")?.textContent).toBe(
    "Puedes continuar sin cuenta.",
  );
});
it("explains a failed account read and recovers from the existing account topic", async () => {
  fake.request.mockRejectedValue(new Error("offline"));
  mount();
  await screen.findByText("No se pudo cargar la cuenta.");
  update({
    ...account(),
    session: "signedIn",
    verified: true,
    plan: { kind: "founders" },
  });
  await waitFor(() =>
    expect(document.querySelector(".v-ob-account > p")?.textContent).toBe(
      "Acceso verificado",
    ),
  );
});

it("keeps the onboarding reference guest separate from simulated core access", () => {
  const host = createMockHost("onboarding-3");
  const reply = host({
    kind: "request",
    id: 1,
    request: { method: "account.get" },
  });
  expect(reply).toMatchObject({
    kind: "response",
    result: {
      method: "account.get",
      value: {
        session: "signedOut",
        gate: "none",
        verified: false,
        plan: { kind: "unverified" },
      },
    },
  });
});
