// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { HostError, Request } from "../src/contract/generated/contract";
import { createMockHost } from "../src/mock/host";
import {
  SectionChromeProvider,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import { HostFailure } from "../src/renderer/bridge/client";
import { fileActions } from "../src/renderer/screens/strategy/useStrategy";
import { StrategyScreen } from "../src/renderer/ui/strategy/StrategyScreen";

afterEach(cleanup);

function mount(
  scene: string,
  override?: (request: Request) => HostError | undefined,
  cancelPicker = false,
) {
  const host = createMockHost(`strategy-${scene}`);
  const request = vi.fn(async (request: Request) => {
    const error = override?.(request);
    if (error) throw new HostFailure(error);
    const id =
      cancelPicker && request.method === "strategy.pickFile" ? 0x80000001 : 1;
    let reply = host({ kind: "request", id, request });
    if (id !== 1 && reply?.kind === "response")
      reply = host({ kind: "pickedStrategyFile", id, path: null });
    if (reply?.kind === "failure") throw new HostFailure(reply.error);
    if (reply?.kind === "response") return reply.result;
    throw Error("Missing strategy response");
  });
  render(
    <SectionChromeProvider>
      <SectionTabsSlot />
      <StrategyScreen client={{ request }} />
    </SectionChromeProvider>,
  );
  return request;
}
const button = (name: string) => screen.getByRole("button", { name });
const click = (name: string) => fireEvent.click(button(name));
function fill(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values))
    fireEvent.change(screen.getByRole("textbox", { name }), {
      target: { value },
    });
}
async function openWizard() {
  await screen.findByRole("heading", { name: "Tus estrategias" });
  click("Nueva estrategia");
  click("Continuar");
}
function completeWizard() {
  fill({ Circuito: "Fuji Speedway", "Clase o coche": "Hypercar" });
  click("Continuar");
  fill({
    "Nombre de la carrera": "Fuji 6 Horas",
    Duración: "360",
    "Vueltas que vas a dar": "236",
    Depósito: "82",
    "Consumo por vuelta": "1,830",
  });
  click("Continuar");
  fill({
    "Nombre del piloto": "Isaac",
    Iniciales: "IA",
    "Ritmo por vuelta": "90,472",
  });
  click("Continuar");
  fill({ "Nombre de esta estrategia": "Seco" });
}

it.each([
  ["empty", "Aún no tienes estrategias", true],
  ["ready", "Guardadas", true],
  [
    "recovered",
    "Tu archivo de estrategias estaba dañado y no se podía leer",
    true,
  ],
  ["importedLegacy", "Hemos traído tu último borrador del Hub anterior", true],
  ["protected", "Este archivo es de una versión más nueva de Vantare", false],
])("shows collection scene %s", async (scene, content, canCreate) => {
  mount(scene);
  await screen.findByText(content, { exact: true });
  expect((button("Guardar") as HTMLButtonElement).disabled).toBe(true);
  expect(
    !!screen.queryByRole("button", { name: /^(Nueva estrategia|Empezar)$/ }),
  ).toBe(canCreate);
  expect(screen.getAllByRole("status")).toHaveLength(1);
});

it("marks field and summary errors, retains edits on back, and sends only v63 fields", async () => {
  const request = mount("empty");
  await openWizard();
  click("Continuar");
  expect(screen.getByRole("alert").textContent).toContain("Revisa");
  expect(
    screen
      .getByRole("textbox", { name: "Circuito" })
      .getAttribute("aria-invalid"),
  ).toBe("true");
  fill({ Circuito: "Fuji Speedway" });
  click("Atrás");
  click("Continuar");
  expect(
    (screen.getByRole("textbox", { name: "Circuito" }) as HTMLInputElement)
      .value,
  ).toBe("Fuji Speedway");
  completeWizard();
  click("Crear carrera");
  await screen.findByRole("tab", { name: "Carrera" });
  expect(
    request.mock.calls.find(([r]) => r.method === "strategy.create")?.[0],
  ).toEqual({
    method: "strategy.create",
    revision: expect.any(String),
    basePaceSeconds: "90.472",
    fuelPerLapLiters: "1.830",
    inputs: null,
    fields: {
      name: "Fuji 6 Horas",
      track: "Fuji Speedway",
      class: "Hypercar",
      durationMinutes: "360",
      fuelCapacityLiters: "82",
      pitTransitSeconds: "0",
      startAt: "",
      team: "",
      driverName: "Isaac",
      driverInitials: "IA",
      variantName: "Seco",
      variantNote: "",
      variantMode: "dry",
    },
  });
  expect((button("Guardar") as HTMLButtonElement).disabled).toBe(false);
  fireEvent.keyDown(window, { key: "s", ctrlKey: true });
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe("Guardado."),
  );
});

it("keeps the review open when creation fails", async () => {
  const request = mount("empty", (request) =>
    request.method === "strategy.create"
      ? { kind: "strategyInvalidText" }
      : undefined,
  );
  await openWizard();
  completeWizard();
  click("Crear carrera");
  await screen.findByRole("alert");
  expect(screen.queryByRole("tab", { name: "Carrera" })).toBeNull();
  expect(
    request.mock.calls.filter(([r]) => r.method === "strategy.create"),
  ).toHaveLength(1);
});

it("retries busy once after reading the next view", async () => {
  let busy = true;
  const request = mount("empty", (request) => {
    if (request.method !== "strategy.create" || !busy) return;
    busy = false;
    return { kind: "busy" };
  });
  await openWizard();
  completeWizard();
  click("Crear carrera");
  await screen.findByRole("tab", { name: "Carrera" });
  expect(request.mock.calls.map(([r]) => r.method).slice(-3)).toEqual([
    "strategy.create",
    "strategy.view",
    "strategy.create",
  ]);
});

async function fileMenu(action: string) {
  const user = userEvent.setup();
  await user.click(button("Más acciones de archivo"));
  await user.click(await screen.findByRole("menuitem", { name: action }));
}
it.each([
  ["Abrir archivo…", "open", "carreras-2026.json"],
  ["Guardar como…", "saveAs", "copia-estrategia.json"],
] as const)(
  "invokes %s with only its mode and revision",
  async (label, mode, name) => {
    const request = mount("ready");
    await screen.findByText("strategy-v2.json");
    await fileMenu(label);
    await screen.findByText(name);
    expect(request.mock.calls.at(-1)?.[0]).toEqual({
      method: "strategy.pickFile",
      mode,
      revision: expect.any(String),
    });
  },
);

it.each([
  ["fileUnavailable", "Abrir archivo…", "No se puede usar ese archivo."],
  [
    "fileTooLarge",
    "Abrir archivo…",
    "Ese archivo de estrategias es demasiado grande.",
  ],
  [
    "targetExists",
    "Guardar como…",
    "Ya existe un archivo con ese nombre. Elige otro nombre.",
  ],
] as const)(
  "shows a path-free message for %s",
  async (scene, action, message) => {
    mount(scene);
    await screen.findByText("strategy-v2.json");
    await fileMenu(action);
    expect((await screen.findByRole("alert")).textContent).toBe(message);
  },
);

it.each([
  ["pickExpired", false],
  ["ready", true],
] as const)("returns quietly from %s (cancel=%s)", async (scene, cancel) => {
  const request = mount(scene, undefined, cancel);
  await screen.findByText("strategy-v2.json");
  await fileMenu("Abrir archivo…");
  await waitFor(() =>
    expect(request.mock.calls.at(-1)?.[0].method).toBe("strategy.pickFile"),
  );
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("strategy-v2.json")).toBeTruthy();
});

it("keeps unsaved changes when opening an archive would discard them", async () => {
  mount("empty");
  await openWizard();
  completeWizard();
  click("Crear carrera");
  await screen.findByText("Sin guardar");
  await fileMenu("Abrir archivo…");
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Guarda o descarta los cambios antes de continuar.",
  );
  expect(screen.getByText("Sin guardar")).toBeTruthy();
});

it("uses the persisted file and explicit unconfirmed form state for the action matrix", () => {
  const host = createMockHost("strategy-ready");
  const reply = host({
    kind: "request",
    id: 1,
    request: { method: "strategy.open" },
  });
  if (reply?.kind !== "response" || reply.result.method !== "strategy.open")
    throw Error("missing view");
  const view = reply.result.value;
  expect(fileActions(view)).toEqual({
    status: "saved",
    save: false,
    open: true,
    saveAs: true,
    discard: false,
  });
  expect(fileActions({ ...view, dirty: true })).toEqual({
    status: "dirty",
    save: true,
    open: true,
    saveAs: true,
    discard: true,
  });
  expect(fileActions({ ...view, dirty: true }, true)).toEqual({
    status: "pending",
    save: false,
    open: true,
    saveAs: true,
    discard: true,
  });
  expect(fileActions({ ...view, state: "protected" })).toEqual({
    status: "protected",
    save: false,
    open: true,
    saveAs: false,
    discard: false,
  });
  expect(
    fileActions({ ...view, state: "empty", file: null, events: [] }),
  ).toEqual({
    status: "empty",
    save: false,
    open: true,
    saveAs: false,
    discard: false,
  });
  expect(
    fileActions({
      ...view,
      dirty: true,
      plan: { ...view.plan, state: "pendingChanges" },
    }).save,
  ).toBe(true);
});
