// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import core from "../fixtures/core-offline.json";
import type { CoreStatus, HomeView } from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus/home.json";
import {
  isEvent,
  isHome,
  isReply,
  isRequest,
} from "../src/contract/modules/home";
import { isHostMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";
import { HomeLayout, type HomeProps } from "../src/renderer/ui/home/HomeLayout";
import { greeting, profileChoice } from "../src/renderer/ui/home/model";

const response = corpus.host[0]?.result;
const event = corpus.host[1]?.event;
if (!response || !event) throw new Error("Rust corpus missing Home samples");
const value = structuredClone(response.value) as HomeView;
const props = (): HomeProps => ({
  view: structuredClone(value),
  core: { ...core, access: { ...core.access, verified: true } } as CoreStatus,
  name: "Isaac",
  now: new Date(2026, 8, 30, 16, 30),
  selected: "",
  pending: false,
  records: [],
  select: vi.fn(),
  launch: vi.fn(),
  navigate: vi.fn(),
  commands: vi.fn(),
  retry: vi.fn(),
});
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(cleanup);
it.each([
  [11, 59, "Buenos días"],
  [12, 0, "Buenas tardes"],
  [19, 59, "Buenas tardes"],
  [20, 0, "Buenas noches"],
])("changes the greeting at %i:%i", (h, m, label) => {
  expect(greeting("Isaac", new Date(2026, 8, 30, h, m))).toBe(
    `${label}, Isaac`,
  );
  expect(greeting("", new Date())).toBe("Bienvenido a Vantare");
});
it("validates the real Rust corpus and rejects unknown fields, unsafe coordinates and foreign favorites", () => {
  expect(isRequest({ method: "home.get" })).toBe(true);
  expect(isRequest({ method: "home.get", path: "elsewhere" })).toBe(false);
  expect(isReply(response)).toBe(true);
  expect(isEvent(event)).toBe(true);
  for (const extra of [
    { ...value, settings: {} },
    { ...value, favorite: "unknown" },
    { ...value, sim: { connected: false, track: null, raw: {} } },
    {
      ...value,
      layout: {
        state: "ready",
        width: 1920,
        height: 1080,
        widgets: [
          { kind: "standings", x: Infinity, y: 0, w: 160, h: 80, opacity: 100 },
        ],
      },
    },
    { ...value, launch: { kind: "running", text: "x".repeat(481) } },
  ])
    expect(isHome(extra)).toBe(false);
});
it("keeps a valid selection, then falls back to favorite and first profile", () => {
  const profiles = [
    { id: "a", name: "A", steps: 0, favorite: false, lastLaunchedAt: null },
    { id: "b", name: "B", steps: 0, favorite: true, lastLaunchedAt: null },
  ];
  expect(profileChoice(profiles, "b", "a")).toBe("a");
  expect(profileChoice(profiles, "b", "gone")).toBe("b");
  expect(profileChoice(profiles, null)).toBe("a");
  expect(profileChoice([], null)).toBe("");
});
it("opens Launcher for the first profile and Studio for templates, without enabling Stop", async () => {
  const p = props();
  render(<HomeLayout {...p} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Crear mi primer perfil" }),
  );
  expect(p.navigate).toHaveBeenCalledWith("launcher");
  await userEvent.click(screen.getByRole("button", { name: "Ver plantillas" }));
  expect(p.navigate).toHaveBeenCalledWith("studio");
});
it("retries a blocked access and disables launching", async () => {
  const p = props();
  p.core.access.blocked = true;
  if (!p.view) throw new Error("fixture missing");
  p.view.profiles = [
    {
      id: "fav",
      name: "Favorito",
      steps: 1,
      favorite: true,
      lastLaunchedAt: null,
    },
  ];
  p.view.favorite = "fav";
  render(<HomeLayout {...p} />);
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: /Lanzar Favorito/ })
      .disabled,
  ).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(p.retry).toHaveBeenCalledOnce();
});

it("summarizes visible widgets and keeps Stop disabled with its reason", () => {
  const p = props();
  if (!p.view) throw new Error("fixture");
  p.view.profiles = [
    { id: "a", name: "A", steps: 1, favorite: true, lastLaunchedAt: null },
  ];
  p.view.favorite = "a";
  p.view.layout.widgets = ["standings", "relative", "delta", "pedals"].map(
    (kind, i) => ({
      kind: kind as HomeView["layout"]["widgets"][number]["kind"],
      x: i * 200,
      y: 0,
      w: 160,
      h: 80,
      opacity: 100,
    }),
  );
  render(<HomeLayout {...p} />);
  expect(screen.getByText("+1")).toBeTruthy();
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Detener" }).disabled,
  ).toBe(true);
  expect(
    screen.getByTitle("Control de overlays desde Inicio: próximamente"),
  ).toBeTruthy();
});

it("shows the resident progress verbatim and the wide-screen favorite details", () => {
  const p = props();
  if (!p.view) throw new Error("fixture");
  p.view.profiles = [
    {
      id: "a",
      name: "Favorito",
      steps: 3,
      favorite: true,
      lastLaunchedAt: null,
    },
  ];
  p.view.favorite = "a";
  p.view.launch = { kind: "running", text: "2/3 pasos listos" };
  render(<HomeLayout {...p} />);
  expect(
    screen.getByRole<HTMLButtonElement>("button", {
      name: /Lanzando… 2\/3 pasos listos/,
    }).disabled,
  ).toBe(true);
  expect(screen.getByText("3 pasos de lanzamiento")).toBeTruthy();
});

it.each([
  "inicio-referencia",
  "inicio-base",
  "inicio-vacio",
  "inicio-error",
  "inicio-lanzando",
  "inicio-sin-diseno",
])("keeps %s inside the generated wire contract", (scene) => {
  const reply = createMockHost(scene)({
    kind: "request",
    id: 1,
    request: { method: "home.get" },
  });
  expect(isHostMessage(reply)).toBe(true);
});

it("does not offer creation into a protected empty launcher document", () => {
  const p = props();
  if (!p.view) throw new Error("fixture");
  p.view.protected = true;
  render(<HomeLayout {...p} />);
  expect(
    screen.getByRole<HTMLButtonElement>("button", {
      name: "Crear mi primer perfil",
    }).disabled,
  ).toBe(true);
});
