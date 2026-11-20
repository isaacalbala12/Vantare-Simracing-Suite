// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Screen from "../src/renderer/screens/strategy/entry";

const state = vi.hoisted(() => ({
  client: undefined as object | undefined,
  demo: false,
  beta: undefined as boolean | undefined,
  channel: undefined as string | undefined,
  failed: false,
  loaded: true,
  seen: [] as object[],
}));
vi.mock("../src/renderer/app/Host", () => ({
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
vi.mock("../src/renderer/app/UpdatesState", () => ({
  useUpdates: () => ({
    isError: state.failed,
    data: state.channel ? { channel: state.channel } : undefined,
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
  state.failed = false;
  state.loaded = true;
});

it("mounts the real screen with the host client on nightly with the beta", async () => {
  state.client = { request: vi.fn() };
  state.beta = true;
  state.channel = "nightly";
  render(<Screen />);
  await screen.findByText("pantalla real");
  expect(state.seen).toEqual([state.client]);
});

it.each([
  ["testers", true],
  ["master", true],
  [undefined, true],
  ["nightly", false],
  ["nightly", undefined],
])("keeps the upcoming page on %s with beta %s", async (channel, beta) => {
  state.client = { request: vi.fn() };
  state.channel = channel;
  state.beta = beta;
  render(<Screen />);
  await waitFor(() => expect(screen.getByText("próximamente")).toBeTruthy());
  expect(screen.queryByText("pantalla real")).toBeNull();
  expect(state.seen).toEqual([]);
});

it("keeps the upcoming page without a host client", () => {
  state.client = undefined;
  state.beta = true;
  state.channel = "nightly";
  render(<Screen />);
  expect(screen.getByText("próximamente")).toBeTruthy();
});

it("keeps the real screen when a later read of the channel fails", async () => {
  state.client = { request: vi.fn() };
  state.beta = true;
  state.channel = "nightly";
  state.failed = true;
  render(<Screen />);
  await screen.findByText("pantalla real");
});

it("keeps the upcoming page when the channel was never read", async () => {
  state.client = { request: vi.fn() };
  state.beta = true;
  state.channel = undefined;
  state.failed = true;
  render(<Screen />);
  await waitFor(() => expect(screen.getByText("próximamente")).toBeTruthy());
  expect(state.seen).toEqual([]);
});

it("keeps the upcoming page while the settings are not loaded", async () => {
  state.client = { request: vi.fn() };
  state.beta = true;
  state.channel = "nightly";
  state.loaded = false;
  render(<Screen />);
  await waitFor(() => expect(screen.getByText("próximamente")).toBeTruthy());
  expect(state.seen).toEqual([]);
});
