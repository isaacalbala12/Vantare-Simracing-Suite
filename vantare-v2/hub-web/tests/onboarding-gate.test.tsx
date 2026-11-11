// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import coreFixture from "../fixtures/core-offline.json";
import type { OnboardingView } from "../src/contract/generated/contract";
import { OnboardingGate } from "../src/renderer/screens/onboarding/OnboardingGate";

const fake = vi.hoisted(() => ({ request: vi.fn(), navigate: vi.fn() }));
vi.mock("../src/renderer/app/Host", async () => ({
  useHost: () => ({ client: { request: fake.request } }),
  coreKey: ["core"],
  offline: (await import("../fixtures/core-offline.json")).default,
}));
vi.mock("../src/renderer/app/UiState", () => ({ useUi: () => fake.navigate }));
vi.mock("../src/renderer/app/WindowControls", () => ({
  WindowControls: () => null,
}));
vi.mock("../src/renderer/screens/onboarding/IntroPreview", () => ({
  OnboardingIntroPreview: ({
    onComplete,
  }: {
    onComplete: (privateSession: boolean, show: boolean) => void;
  }) => {
    const cache = useQueryClient();
    return (
      <>
        <button
          type="button"
          onClick={() => cache.setQueryData(["onboarding"], { pending: false })}
        >
          Publish finish
        </button>
        <button type="button" onClick={() => onComplete(false, false)}>
          Complete Studio
        </button>
        <button type="button" onClick={() => onComplete(true, true)}>
          Private
        </button>
      </>
    );
  },
}));
const view: OnboardingView = {
  pending: true,
  simulators: [true, false],
  scanning: false,
  equipment: { cpu: null, cores: null, ramGb: null },
  recommendedLevel: "balanced",
  layoutReady: false,
  layoutRevision: null,
  settingsRevision: "a".repeat(64),
  privateSession: false,
};
beforeEach(() => {
  fake.request.mockReset();
  fake.navigate.mockClear();
});
afterEach(cleanup);
function mount(value = view, access = coreFixture.access) {
  fake.request.mockResolvedValue({ method: "onboarding.get", value });
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
    },
  });
  cache.setQueryData(["core"], { ...coreFixture, access });
  render(
    <QueryClientProvider client={cache}>
      <OnboardingGate>
        {(privateSession) => (
          <p>{privateSession ? "private Hub" : "normal Hub"}</p>
        )}
      </OnboardingGate>
    </QueryClientProvider>,
  );
  return cache;
}
it("waits for explicit completion after the host publishes pending false and guards Studio", async () => {
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Publish finish" }),
  );
  expect(screen.queryByText("normal Hub")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Complete Studio" }));
  expect(await screen.findByText("normal Hub")).toBeTruthy();
  expect(fake.navigate).toHaveBeenCalledWith("home");
});
it("passes the private-session result only after completion", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Private" }));
  expect(await screen.findByText("private Hub")).toBeTruthy();
});
it("latches an already completed onboarding instead of remounting on later invalidation", async () => {
  const cache = mount({ ...view, pending: false });
  await screen.findByText("normal Hub");
  cache.setQueryData(["onboarding"], view);
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Private" })).toBeNull(),
  );
  expect(screen.getByText("normal Hub")).toBeTruthy();
});

it("opens Studio only with verified, unblocked access", async () => {
  mount(view, { ...coreFixture.access, verified: true, blocked: false });
  fireEvent.click(
    await screen.findByRole("button", { name: "Complete Studio" }),
  );
  await screen.findByText("normal Hub");
  expect(fake.navigate).toHaveBeenCalledWith("studio");
});
it("keeps a verified but blocked session out of Studio", async () => {
  mount(view, { ...coreFixture.access, verified: true, blocked: true });
  fireEvent.click(
    await screen.findByRole("button", { name: "Complete Studio" }),
  );
  await screen.findByText("normal Hub");
  expect(fake.navigate).toHaveBeenCalledWith("home");
});

vi.mock("../src/renderer/screens/onboarding/AccountIntro", async () => ({
  OnboardingAccountIntro: (
    await import("../src/renderer/screens/onboarding/IntroPreview")
  ).OnboardingIntroPreview,
}));
