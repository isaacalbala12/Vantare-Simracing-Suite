// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import coreFixture from "../fixtures/core-offline.json";
import type { OnboardingView } from "../src/contract/generated/contract";
import { OnboardingGate } from "../src/renderer/screens/onboarding/OnboardingGate";

const fake = vi.hoisted(() => ({
  request: vi.fn(),
  navigate: vi.fn(),
  loaded: vi.fn(),
}));
vi.mock("../src/renderer/app/Host", async () => ({
  useHost: () => ({ client: { request: fake.request } }),
  coreKey: ["core"],
  offline: (await import("../fixtures/core-offline.json")).default,
}));
vi.mock("../src/renderer/app/UiState", () => ({ useUi: () => fake.navigate }));
vi.mock("../src/renderer/app/WindowControls", () => ({
  WindowControls: () => <button type="button">Window controls</button>,
}));
vi.mock("../src/renderer/screens/onboarding/AccountIntro", () => {
  fake.loaded();
  return {
    OnboardingAccountIntro: ({
      onComplete,
    }: {
      onComplete: (privateSession: boolean, show: boolean) => void;
    }) => (
      <button type="button" onClick={() => onComplete(false, false)}>
        Complete required onboarding
      </button>
    ),
  };
});
const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const cache of caches) cache.clear();
});
const value: OnboardingView = {
  pending: false,
  simulators: [true, false],
  scanning: false,
  equipment: { cpu: null, gpu: null, cores: null, ramGb: null },
  recommendedLevel: "balanced",
  layoutReady: false,
  layoutRevision: null,
  settingsRevision: "a".repeat(64),
  privateSession: false,
};
function mount(pending: boolean) {
  fake.request.mockResolvedValue({
    method: "onboarding.get",
    value: { ...value, pending },
  });
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  caches.push(cache);
  cache.setQueryData(["core"], coreFixture);
  return render(
    <QueryClientProvider client={cache}>
      <OnboardingGate>{() => <p>Hub available</p>}</OnboardingGate>
    </QueryClientProvider>,
  );
}
it("does not evaluate the wizard for a completed setup and still gates a required one until completion", async () => {
  const completed = mount(false);
  await screen.findByText("Hub available");
  expect(fake.loaded).not.toHaveBeenCalled();
  completed.unmount();
  mount(true);
  expect(screen.queryByText("Hub available")).toBeNull();
  const finish = await screen.findByRole("button", {
    name: "Complete required onboarding",
  });
  expect(fake.loaded).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Hub available")).toBeNull();
  fireEvent.click(finish);
  await screen.findByText("Hub available");
});
