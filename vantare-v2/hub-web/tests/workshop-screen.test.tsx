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
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  CoreStatus,
  HostError,
  HostToUi,
  Reply,
  Request,
} from "../src/contract/generated/contract";
import { previewTransparentPng } from "../src/contract/generated/preview";
import { createMockHost, hello } from "../src/mock/host";
import { workshopCatalog } from "../src/mock/modules/workshop";
import { HostProvider, offline } from "../src/renderer/app/Host";
import {
  SectionChromeProvider,
  SectionRailSlot,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import { UiProvider } from "../src/renderer/app/UiState";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import StudioEntry from "../src/renderer/screens/studio/entry";
import { TooltipProvider } from "../src/renderer/ui/Layers";

type PhotoRequest = Extract<Request, { method: "preview.render" }>;
const png: Reply = {
  method: "preview.render",
  value: { width: 1, height: 1, pngBase64: previewTransparentPng },
};
const battle = "Batalla cercana · conducción";
const imageName = /^Foto de Standings, escena /;
let cache: QueryClient;
let core: CoreStatus;
let notify: (message: HostToUi) => void;
let requests: Request[];
let respond: ((request: Request) => Promise<Reply> | undefined) | undefined;
const decode = vi.fn<() => Promise<void>>();

function held() {
  let resolve!: (reply: Reply) => void;
  const promise = new Promise<Reply>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function photoRequests() {
  return requests.filter(
    (request): request is PhotoRequest =>
      request.method === "preview.render" && request.target.kind === "scene",
  );
}
function button(name: string) {
  return screen.getByRole("button", { name });
}
async function choose(
  user: ReturnType<typeof userEvent.setup>,
  selector: RegExp,
  option: string | RegExp,
) {
  await user.click(screen.getByRole("combobox", { name: selector }));
  await user.click(await screen.findByRole("option", { name: option }));
}
async function emit(next: CoreStatus) {
  await act(async () =>
    notify({ kind: "event", event: { topic: "core", value: next } }),
  );
}
function mount() {
  return render(
    <QueryClientProvider client={cache}>
      <HostProvider>
        <UiProvider>
          <CSPProvider disableStyleElements>
            <TooltipProvider>
              <SectionChromeProvider>
                <SectionTabsSlot />
                <StudioEntry />
                <SectionRailSlot fallback={null} />
              </SectionChromeProvider>
            </TooltipProvider>
          </CSPProvider>
        </UiProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
}
async function enter() {
  const user = userEvent.setup();
  const ui = mount();
  await user.click(await screen.findByRole("tab", { name: "Taller" }));
  return { ui, user };
}
async function openBattle(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("img", { name: imageName });
  if (!screen.queryByRole("combobox", { name: new RegExp(battle) })) {
    await choose(
      user,
      /^Escena/,
      /^Batalla cercana · conducción(?: 4 fotogramas)?$/,
    );
    await screen.findByRole("img", { name: new RegExp(battle) });
  }
}

beforeEach(() => {
  requests = [];
  respond = undefined;
  decode.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      naturalWidth = 1;
      naturalHeight = 1;
      decode = decode;
    },
  );
  core = {
    ...structuredClone(offline),
    rights: "connected",
    accountGeneration: "a".repeat(64),
    access: { ...offline.access, verified: true, blocked: false, tester: true },
  };
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const mock = createMockHost("preview-image");
  const client = {
    listen(fn: typeof notify) {
      notify = fn;
      return () => {};
    },
    subscribe: () => () => {},
    start() {
      notify(hello);
      notify({ kind: "event", event: { topic: "core", value: core } });
    },
    close: vi.fn(),
    async request(request: Request): Promise<Reply> {
      requests.push(request);
      const response =
        request.method === "preview.render" && request.target.kind !== "scene"
          ? undefined
          : respond?.(request);
      if (response) return response;
      const result = mock({ kind: "request", id: 1, request });
      if (result?.kind === "response") return result.result;
      if (result?.kind === "failure") throw new HostFailure(result.error);
      throw Error(`Unexpected request: ${request.method}`);
    },
  };
  vi.spyOn(Client, "connect").mockResolvedValue(client as unknown as Client);
});
afterEach(() => {
  cleanup();
  cache.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("offers all 74 entries, puts the loose photos last and shows their distinct IDs", async () => {
  const { user } = await enter();
  await screen.findByRole("img", { name: imageName });
  await user.click(screen.getByRole("combobox", { name: /^Widget/ }));
  const widgets = within(await screen.findByRole("listbox")).getAllByRole(
    "option",
  );
  expect(widgets).toHaveLength(19);
  const counts = widgets.map((option) =>
    Number(option.textContent?.match(/(\d+) escenas?/)?.[1]),
  );
  expect(counts.reduce((sum, next) => sum + next, 0)).toBe(74);
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("combobox", { name: /^Escena/ }));
  const scenes = within(await screen.findByRole("listbox")).getAllByRole(
    "option",
  );
  expect(scenes).toHaveLength(12);
  expect(scenes.slice(-2).map((option) => option.textContent)).toEqual([
    expect.stringContaining("standings"),
    expect.stringContaining("standings-legacy"),
  ]);
  expect(scenes.at(-2)?.textContent).not.toContain("standings-legacy");
  expect(
    requests.filter(({ method }) => method === "workshop.catalog"),
  ).toHaveLength(1);
});

it("uses the real watchFor and sends one read-only scene request at scale 1 per choice", async () => {
  const { user } = await enter();
  const first = await screen.findByRole("img", { name: imageName });
  expect(first).toBeTruthy();
  await openBattle(user);
  const scene = workshopCatalog.widgets
    .find(({ kind }) => kind === "standings")
    ?.scenes.find(({ id }) => id === "standings-functional-battle");
  if (!scene?.watchFor) throw Error("Battle watchFor missing");
  expect(screen.getByText(scene.watchFor, { exact: true })).toBeTruthy();
  expect(photoRequests().at(-1)).toEqual({
    method: "preview.render",
    target: { kind: "scene", widget: "standings", sceneId: scene.id, frame: 0 },
    scene: "demo",
    scale: "1",
  });
  const workshopReads = requests.slice(
    requests.findIndex(({ method }) => method === "workshop.catalog"),
  );
  expect(
    workshopReads.every(
      ({ method }) =>
        method === "workshop.catalog" || method === "preview.render",
    ),
  ).toBe(true);
});

it("keeps the previous photo while pending and drops all clicks and shortcuts without queueing", async () => {
  const { user } = await enter();
  await openBattle(user);
  const pending = held();
  respond = ({ method }) =>
    method === "preview.render" ? pending.promise : undefined;
  const before = photoRequests().length;
  const next = button("Siguiente");
  await user.click(next);
  expect(photoRequests()).toHaveLength(before + 1);
  expect(next.getAttribute("aria-disabled")).toBe("true");
  expect(
    screen.getByText("Espera a que llegue la foto (15 s como máximo)."),
  ).toBeTruthy();
  expect(screen.getByText("Haciendo la foto del fotograma 2…")).toBeTruthy();
  expect(screen.getByRole("figure").getAttribute("aria-busy")).toBe("true");
  expect(screen.getByRole("img", { name: imageName })).toBeTruthy();
  fireEvent.click(next);
  fireEvent.click(button("Inicio"));
  fireEvent.click(button("Widget siguiente"));
  await user.keyboard("{ArrowRight}{ArrowLeft}{Home}");
  expect(photoRequests()).toHaveLength(before + 1);
  await act(async () => pending.resolve(png));
  expect(photoRequests()).toHaveLength(before + 1);
  expect(
    screen
      .getAllByRole("status")
      .map((node) => node.textContent)
      .filter((label) => label?.startsWith("Fotograma"))
      .join(""),
  ).toMatch(/^Fotograma 2 de 4 listo\./);
});

const failures: { error: HostError; text: string | RegExp; retry: boolean }[] =
  [
    {
      error: { kind: "busy" },
      text: "El pintor está ocupado con otra foto",
      retry: true,
    },
    {
      error: { kind: "previewFailed", reason: "timeout" },
      text: /^No se pudo hacer la foto del fotograma/,
      retry: true,
    },
    {
      error: { kind: "previewFailed", reason: "gpuUnavailable" },
      text: /^No se pudo hacer la foto del fotograma/,
      retry: true,
    },
    {
      error: { kind: "previewFailed", reason: "captureFailed" },
      text: /^No se pudo hacer la foto del fotograma/,
      retry: true,
    },
    {
      error: { kind: "previewFailed", reason: "noDemo" },
      text: "Esta escena no tiene ejemplo real",
      retry: false,
    },
    {
      error: { kind: "previewFailed", reason: "tooLarge" },
      text: "Esta foto es demasiado grande para el Taller",
      retry: false,
    },
    {
      error: { kind: "previewFailed", reason: "graphicsDisabled" },
      text: "Las fotos están desactivadas en este equipo",
      retry: false,
    },
    {
      error: { kind: "previewFailed", reason: "invalidInput" },
      text: "Esta escena no se pudo leer",
      retry: false,
    },
    {
      error: { kind: "denied" },
      text: "Standings no está incluido en tu plan",
      retry: false,
    },
  ];
it.each(failures)(
  "renders one error message and retries only on user action: $text",
  async ({ error, text, retry }) => {
    respond = ({ method }) =>
      method === "preview.render"
        ? Promise.reject(new HostFailure(error))
        : undefined;
    const { user } = await enter();
    await screen.findByText(text);
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText(text)).toBeTruthy();
    expect(
      screen
        .queryAllByRole("status")
        .some((node) => /Fotograma .* listo/.test(node.textContent ?? "")),
    ).toBe(false);
    expect(photoRequests()).toHaveLength(1);
    const control = screen.queryByRole("button", {
      name: "Volver a generar",
    });
    if (retry) {
      if (!control) throw Error("Missing retry");
      await user.click(control);
      expect(photoRequests()).toHaveLength(2);
    } else expect(control).toBeNull();
  },
);

it("shows the first-photo state and gives a loose photo just the one frame", async () => {
  const first = held();
  respond = ({ method }) =>
    method === "preview.render" ? first.promise : undefined;
  const { user } = await enter();
  expect(await screen.findByText("Haciendo la primera foto…")).toBeTruthy();
  expect(screen.getByRole("figure").getAttribute("aria-busy")).toBe("true");
  respond = undefined;
  await act(async () => first.resolve(png));
  await screen.findByRole("img", { name: imageName });
  await choose(user, /^Escena/, /standings-legacy/);
  expect(
    await screen.findByText("Es una foto suelta: solo tiene un fotograma."),
  ).toBeTruthy();
  expect(button("Siguiente").getAttribute("aria-disabled")).toBe("true");
});

it("shows an empty widget catalog entry without attempting a photo", async () => {
  respond = ({ method }) =>
    method === "workshop.catalog"
      ? Promise.resolve({
          ...workshopCatalog,
          widgets: workshopCatalog.widgets.map((widget) =>
            widget.kind === "track-map" ? { ...widget, scenes: [] } : widget,
          ),
        })
      : undefined;
  const { user } = await enter();
  await screen.findByRole("img", { name: imageName });
  const before = photoRequests().length;
  await choose(user, /^Widget/, /^Mapa del circuito/);
  expect(
    await screen.findByText("Mapa del circuito no tiene escenas de ejemplo"),
  ).toBeTruthy();
  expect(photoRequests()).toHaveLength(before);
});

it.each(["exit", "account", "live", "rights"] as const)(
  "drops a late PNG after %s",
  async (reason) => {
    const pending = held();
    respond = ({ method }) =>
      method === "preview.render" ? pending.promise : undefined;
    const { user } = await enter();
    await waitFor(() => expect(photoRequests()).toHaveLength(1));
    if (reason === "exit") {
      await user.click(screen.getByRole("tab", { name: "Studio" }));
    } else {
      await emit({
        ...core,
        accountGeneration:
          reason === "account" ? "b".repeat(64) : core.accountGeneration,
        rights: reason === "rights" ? "unavailable" : core.rights,
        live: reason === "live",
      });
    }
    if (reason === "account" || reason === "rights")
      await screen.findByText("Sin acceso a las fotos");
    if (reason === "live") await screen.findByText("Live está en marcha");
    await act(async () => pending.resolve(png));
    expect(screen.queryByRole("img", { name: imageName })).toBeNull();
    expect(
      screen
        .queryAllByRole("status")
        .some((node) => /Fotograma .* listo/.test(node.textContent ?? "")),
    ).toBe(false);
    expect(photoRequests()).toHaveLength(1);
    if (reason === "live")
      expect(screen.getByText("Live está en marcha")).toBeTruthy();
    if (reason === "rights")
      expect(screen.getByText("Sin acceso a las fotos")).toBeTruthy();
  },
);

it("rejects a corrupt image without showing it or starting another request", async () => {
  decode.mockRejectedValue(new Error("Invalid PNG"));
  await enter();
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("img", { name: imageName })).toBeNull();
  expect(photoRequests()).toHaveLength(1);
});

it.each(["tester", "ordinary", "blocked", "unverified"] as const)(
  "gates the Taller tab: %s",
  async (account) => {
    core.access = {
      ...core.access,
      tester: account !== "ordinary",
      blocked: account === "blocked",
      verified: account !== "unverified",
    };
    mount();
    await waitFor(() => expect(cache.getQueryData(["core"])).toEqual(core));
    expect(!!screen.queryByRole("tab", { name: "Taller" })).toBe(
      account === "tester",
    );
    expect(requests.some(({ method }) => method === "workshop.catalog")).toBe(
      false,
    );
  },
);

it("navigates with arrows and Home and keeps keyboard focus on the frame control", async () => {
  const { user } = await enter();
  await openBattle(user);
  const next = button("Siguiente");
  next.focus();
  for (const [key, frame] of [
    ["{ArrowRight}", 1],
    ["{ArrowRight}", 2],
    ["{ArrowLeft}", 1],
    ["{Home}", 0],
  ] as const) {
    await user.keyboard(key);
    await screen.findByRole("img", {
      name: new RegExp(`fotograma ${frame + 1} de 4`),
    });
    expect(photoRequests().at(-1)?.target).toMatchObject({
      kind: "scene",
      frame,
    });
    expect(document.activeElement).toBe(next);
  }
});
