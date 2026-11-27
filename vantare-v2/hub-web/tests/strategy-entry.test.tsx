// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { coreKey, offline } from "../src/renderer/app/Host";
import Screen from "../src/renderer/screens/strategy/entry";

const state = vi.hoisted(() => ({
  client: undefined as object | undefined,
  demo: false,
  beta: undefined as boolean | undefined,
  loaded: true,
  seen: [] as object[],
}));
vi.mock("../src/renderer/app/Host", async (original) => ({
  ...(await original<typeof import("../src/renderer/app/Host")>()),
  useHost: () => ({
    client: state.client,
    hello: state.demo ? { demo: true } : {},
  }),
}));
vi.mock("../src/renderer/app/SettingsState", () => ({
  useSettings: () => ({
    view: state.loaded ? { general: { analisisBeta: state.beta } } : undefined,
  }),
}));
vi.mock("../src/renderer/screens/strategy/StrategyReal", () => ({
  default: ({ client }: { client: object }) => {
    state.seen.push(client);
    return <p>pantalla real</p>;
  },
}));
vi.mock("../src/renderer/screens/upcoming/Upcoming", () => ({
  Upcoming: () => <p>próximamente</p>,
}));
vi.mock("../src/renderer/qa/strategy-entry", () => ({
  StrategyEntry: ({ fallback }: { fallback: React.ReactNode }) => fallback,
}));

afterEach(() => {
  cleanup();
  state.seen.length = 0;
  state.loaded = true;
});

const tester = {
  ...offline.access,
  verified: true,
  tester: true,
  strategy: true,
};
function open(access = tester) {
  const cache = new QueryClient();
  cache.setQueryData(coreKey, { ...offline, access });
  render(
    <QueryClientProvider client={cache}>
      <Screen />
    </QueryClientProvider>,
  );
}
async function staysUpcoming() {
  await waitFor(() => expect(screen.getByText("próximamente")).toBeTruthy());
  expect(screen.queryByText("pantalla real")).toBeNull();
  expect(state.seen).toEqual([]);
}

it("mounts the real screen with the host client for a tester with the beta", async () => {
  state.client = { request: vi.fn() };
  state.beta = true;
  open();
  await screen.findByText("pantalla real");
  expect(state.seen).toEqual([state.client]);
});

it.each([false, undefined])(
  "keeps the upcoming page for a tester with the beta %s",
  async (beta) => {
    state.client = { request: vi.fn() };
    state.beta = beta;
    open();
    await staysUpcoming();
  },
);

it.each([
  ["a non-tester", { ...tester, tester: false }],
  ["a tester without the Strategy right", { ...tester, strategy: false }],
  ["a blocked account", { ...offline.access, blocked: true }],
])("keeps the upcoming page for %s with the beta on", async (_, access) => {
  state.client = { request: vi.fn() };
  state.beta = true;
  open(access);
  await staysUpcoming();
});

it("keeps the upcoming page without a host client", async () => {
  state.client = undefined;
  state.beta = true;
  open();
  await staysUpcoming();
});

it("keeps the upcoming page while the settings are not loaded", async () => {
  state.client = { request: vi.fn() };
  state.beta = true;
  state.loaded = false;
  open();
  await staysUpcoming();
});
