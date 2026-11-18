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
import type { StrategyView } from "../src/contract/generated/strategy";
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
  mapView?: (view: StrategyView) => StrategyView,
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
    if (reply?.kind === "response") {
      const result = reply.result;
      return mapView &&
        (result.method === "strategy.open" || result.method === "strategy.view")
        ? { ...result, value: mapView(result.value) }
        : result;
    }
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

async function openRace() {
  await screen.findByRole("heading", { name: "Tus estrategias" });
  click("Continuar");
}
const field = (name: string) =>
  screen.getByRole("textbox", { name }) as HTMLInputElement;

it("shows four cards from the active form and distinguishes the estimated laps", async () => {
  mount("ready", undefined, false, (view) => {
    if (view.form) view.form.fields.fuelCapacityLiters = "82.0";
    return view;
  });
  await openRace();
  for (const name of ["Carrera", "Coche", "Boxes", "Piloto"])
    expect(screen.getByRole("heading", { name })).toBeTruthy();
  expect(screen.getByText("82 L · 1,83 L/v")).toBeTruthy();
  expect(screen.getByText("90 min · 3 vueltas")).toBeTruthy();
  expect(screen.getByText("1:30,472 por vuelta")).toBeTruthy();
  click("Editar coche");
  expect(field("Depósito").value).toBe("82");
  expect(document.body.textContent).not.toMatch(/[a-z]:[\\/]|\\\\/i);
});

it("explains a null form without showing cards or editing actions", async () => {
  mount("ready", undefined, false, (view) => ({ ...view, form: null }));
  await openRace();
  expect(
    screen.getByText("No se pueden mostrar los datos de esta carrera."),
  ).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Coche" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();
});

it("shows absent entries without filling them with defaults", async () => {
  mount("noInputs");
  await openRace();
  click("Editar carrera");
  expect(field("Vueltas que vas a dar").value).toBe("");
  expect(field("Velocidad de repostaje").value).toBe("");
});

it("keeps invalid edits local, then restores the saved values and the triggering button", async () => {
  const request = mount("ready");
  await openRace();
  click("Editar coche");
  expect(field("Depósito").value).toBe("82");
  const laps = field("Vueltas que vas a dar");
  expect(laps.readOnly).toBe(false);
  fill({ Duración: "180" });
  expect(screen.getByText(/Vueltas ≈ duración ÷ ritmo/).textContent).toContain(
    "119",
  );
  expect(laps.value).toBe("3");
  for (const pace of ["", "0", "0,00000000000000001"]) {
    fill({ "Ritmo por vuelta": pace });
    expect(screen.queryByText(/Vueltas ≈ duración ÷ ritmo/)).toBeNull();
  }
  fill({ "Ritmo por vuelta": "90,472" });
  expect(laps.value).toBe("3");
  const date = screen.getByText("Fecha y hora de inicio");
  expect(date.closest("a, [role=link]")).toBeNull();
  expect(field("Salida").getAttribute("aria-describedby")).toBe(date.id);
  fill({ Depósito: "" });
  click("Confirmar datos");
  expect(field("Depósito").getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByRole("alert").textContent).toContain("Revisa 1 dato");
  expect(
    request.mock.calls.some(([r]) => r.method === "strategy.confirm"),
  ).toBe(false);
  click("Cancelar edición");
  expect(document.activeElement).toBe(button("Editar coche"));
  expect(screen.getByText("90 min · 3 vueltas")).toBeTruthy();
});

it("confirms the complete fields of the active variant and uses the returned view", async () => {
  const request = mount("ready");
  await openRace();
  click("Editar piloto");
  fill({
    "Nombre de la carrera": "Copa Fuji",
    Depósito: "82,50",
    "Vueltas que vas a dar": "120",
    "Ritmo por vuelta": "91,5",
  });
  click("Confirmar datos");
  await screen.findByRole("heading", { name: "Copa Fuji" });
  expect(
    request.mock.calls.find(([r]) => r.method === "strategy.confirm")?.[0],
  ).toMatchObject({
    method: "strategy.confirm",
    eventId: "event-1",
    strategyId: "variant-1",
    revision: "a".repeat(64),
    fields: {
      name: "Copa Fuji",
      track: "Fuji",
      class: "GT3",
      durationMinutes: "90",
      fuelCapacityLiters: "82.50",
      pitTransitSeconds: "25",
      startAt: "",
      driverName: "Pilot",
      driverInitials: "PI",
      team: "",
      variantName: "Base",
      variantMode: "dry",
      variantNote: "",
    },
    inputs: {
      raceLaps: "120",
      basePaceSeconds: "91.5",
      fuelPerLapLiters: "1.83",
      serviceMode: "parallel",
    },
  });
  expect(screen.getByText("82,5 L · 1,83 L/v")).toBeTruthy();
  expect(screen.getByText("90 min · 120 vueltas")).toBeTruthy();
  expect(screen.getByText("1:31,500 por vuelta")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe("Datos confirmados.");
  expect(screen.getByText("Sin guardar")).toBeTruthy();
});

it("keeps the draft visible when confirmation fails", async () => {
  mount("ready", (r) =>
    r.method === "strategy.confirm"
      ? { kind: "strategyInvalidText" }
      : undefined,
  );
  await openRace();
  click("Editar carrera");
  fill({ "Nombre de la carrera": "Copa Fuji" });
  expect((button("Guardar") as HTMLButtonElement).disabled).toBe(true);
  click("Confirmar datos");
  expect((await screen.findByRole("alert")).textContent).toBe(
    "No se han podido usar esos datos. Revisa lo que has escrito.",
  );
  expect(field("Nombre de la carrera").value).toBe("Copa Fuji");
  click("Cancelar edición");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("edits every confirmable value and offers no control for team or variant mode", async () => {
  mount("ready");
  await openRace();
  click("Editar carrera");
  // 13 fields − team − variantMode + 15 inputs − serviceMode = 25 text boxes.
  expect(screen.getAllByRole("textbox")).toHaveLength(25);
  expect(screen.getAllByRole("radio")).toHaveLength(2);
  expect(screen.queryByText(/Equipo|Modo de la estrategia/)).toBeNull();
  expect(
    screen.queryByRole("radio", { name: /Seco|Mojado|Ahorro/ }),
  ).toBeNull();
  for (const input of screen.getAllByRole("textbox"))
    expect(
      (input as HTMLInputElement).readOnly || input.hasAttribute("disabled"),
    ).toBe(false);
});

it("sends the saved variant mode untouched and shows a generic error when the host rejects it", async () => {
  // The mock applies the host rule: with inputs, any mode other than dry is rejected.
  const request = mount("ready", undefined, false, (view) => {
    if (view.form) view.form.fields.variantMode = "wet";
    return view;
  });
  await openRace();
  click("Editar carrera");
  fill({ "Nombre de la carrera": "Copa Fuji" });
  click("Confirmar datos");
  expect((await screen.findByRole("alert")).textContent).toBe(
    "No se ha podido completar la acción.",
  );
  expect(
    request.mock.calls.find(([r]) => r.method === "strategy.confirm")?.[0],
  ).toMatchObject({ fields: { variantMode: "wet" } });
  expect(field("Nombre de la carrera").value).toBe("Copa Fuji");
});

it("does not mark a focused field without an error as invalid", async () => {
  mount("ready");
  await openRace();
  click("Editar carrera");
  const deposit = field("Depósito");
  deposit.focus();
  fireEvent.change(deposit, { target: { value: "85" } });
  expect(deposit.getAttribute("aria-invalid")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("moves focus to the editing title, which is not a control, and returns it to Editar", async () => {
  mount("ready");
  await openRace();
  click("Editar carrera");
  const title = screen.getByRole("heading", {
    name: "Editando los datos de la carrera",
  });
  expect(title.getAttribute("tabindex")).toBe("-1");
  expect(document.activeElement).toBe(title);
  click("Cancelar edición");
  expect(document.activeElement).toBe(button("Editar carrera"));
});

it("returns focus to the Editar button that opened the form after confirming", async () => {
  mount("ready");
  await openRace();
  click("Editar piloto");
  fill({ "Nombre del piloto": "Pilot Two" });
  click("Confirmar datos");
  await screen.findByText("Pilot Two (PI)");
  expect(document.activeElement).toBe(button("Editar piloto"));
});
