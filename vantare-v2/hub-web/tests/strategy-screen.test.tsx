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

function clientFor(
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
  return Object.assign(request, { host });
}
const shell = (request: ReturnType<typeof clientFor>) => (
  <SectionChromeProvider>
    <SectionTabsSlot />
    <StrategyScreen client={{ request }} />
  </SectionChromeProvider>
);
function mount(...args: Parameters<typeof clientFor>) {
  const request = clientFor(...args);
  render(shell(request));
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

it("sends the saved variant mode untouched and says the calculation did not accept the data when the host refuses it", async () => {
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
    "El cálculo no ha aceptado los datos. Revísalos.",
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

// ---- E4c-1 review: conflict, exact payload, lock, resets and validators ----

const disabled = (node: HTMLElement) =>
  (node as HTMLButtonElement).disabled ||
  node.getAttribute("aria-disabled") === "true" ||
  node.hasAttribute("data-disabled");
const editedConflict =
  (seen: { view?: StrategyView }, mutate?: (view: StrategyView) => void) =>
  (r: Request) => {
    if (r.method !== "strategy.confirm" || !seen.view?.form) return undefined;
    const current = structuredClone(seen.view);
    if (current.form) current.form.fields.name = "Cambiado fuera";
    current.events[0].name = "Cambiado fuera";
    current.revision = "b".repeat(64);
    mutate?.(current);
    return { kind: "strategyConflict", current } as HostError;
  };
function watch() {
  const seen: { view?: StrategyView } = {};
  return {
    seen,
    map: (view: StrategyView) => {
      seen.view ??= structuredClone(view);
      return view;
    },
  };
}

it("keeps the draft and says the data changed when confirming hits a conflict", async () => {
  const { seen, map } = watch();
  mount("ready", editedConflict(seen), false, map);
  await openRace();
  click("Editar carrera");
  fill({ "Nombre de la carrera": "Mi nombre", Depósito: "90" });
  click("Confirmar datos");
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe(
    "Los datos de la carrera han cambiado fuera de esta pantalla. Revisa lo que has escrito y vuelve a confirmar.",
  );
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(field("Nombre de la carrera").value).toBe("Mi nombre");
  expect(field("Depósito").value).toBe("90");
  expect(document.body.textContent).not.toContain("No se ha guardado");
  click("Cancelar edición");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("heading", { name: "Cambiado fuera" })).toBeTruthy();
});

it("resets the editor when the form disappears under it", async () => {
  const { seen, map } = watch();
  mount(
    "ready",
    editedConflict(seen, (view) => {
      view.form = null;
    }),
    false,
    map,
  );
  await openRace();
  click("Editar carrera");
  click("Confirmar datos");
  await screen.findByText("No se pueden mostrar los datos de esta carrera.");
  expect(screen.queryByRole("button", { name: "Cancelar edición" })).toBeNull();
  expect(disabled(button("Más acciones de archivo"))).toBe(false);
});

it("resets the editor when the client changes", async () => {
  const view = render(shell(clientFor("ready")));
  await openRace();
  click("Editar carrera");
  view.rerender(shell(clientFor("ready")));
  expect(
    await screen.findByRole("button", { name: "Editar carrera" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Cancelar edición" })).toBeNull();
  expect(disabled(button("Más acciones de archivo"))).toBe(false);
});

const allFields = {
  "Nombre de la carrera": "Copa Fuji",
  Circuito: "Suzuka",
  "Clase o coche": "LMP2",
  Salida: "2026-12-06T13:00:00+01:00",
  Duración: "361",
  "Vueltas que vas a dar": "237",
  "Vuelta de formación": "1",
  Depósito: "83,5",
  "Consumo por vuelta": "1,9",
  "Reserva al final": "0,9",
  "Ritmo por vuelta": "91,5",
  "Energía virtual máxima": "99",
  "Energía virtual por vuelta": "2,4",
  "Vida del neumático": "44",
  "Pérdida por desgaste": "0,3",
  "Tránsito por boxes": "26",
  "Velocidad de repostaje": "4,5",
  "Velocidad de recarga de energía": "2,7",
  "Cambio de neumáticos": "31",
  "Cargar combustible de": "2",
  "Cargar energía de": "3",
  "Nombre del piloto": "Ana Pérez",
  Iniciales: "AP",
  "Nombre de esta estrategia": "Húmedo B",
  Nota: "Nota larga",
};
type Confirm = Extract<Request, { method: "strategy.confirm" }>;
const confirmSent = (request: ReturnType<typeof clientFor>) =>
  request.mock.calls.find(
    ([r]) => r.method === "strategy.confirm",
  )?.[0] as Confirm;

it("sends every field and every input to the right place, all values different", async () => {
  const request = mount("ready", undefined, false, (view) => {
    if (view.form) view.form.fields.team = "Equipo Z";
    return view;
  });
  await openRace();
  click("Editar carrera");
  fill(allFields);
  fireEvent.click(screen.getByRole("radio", { name: "Uno tras otro" }));
  click("Confirmar datos");
  await screen.findByRole("heading", { name: "Copa Fuji" });
  const sent = confirmSent(request);
  expect(sent.fields).toEqual({
    name: "Copa Fuji",
    track: "Suzuka",
    class: "LMP2",
    durationMinutes: "361",
    fuelCapacityLiters: "83.5",
    pitTransitSeconds: "26",
    startAt: "2026-12-06T12:00:00.000Z",
    driverName: "Ana Pérez",
    driverInitials: "AP",
    team: "Equipo Z",
    variantName: "Húmedo B",
    variantMode: "dry",
    variantNote: "Nota larga",
  });
  expect(sent.inputs).toEqual({
    basePaceSeconds: "91.5",
    fuelPerLapLiters: "1.9",
    raceLaps: "237",
    veCapacityPercent: "99",
    vePerLapPercent: "2.4",
    tyreLifeLaps: "44",
    degradationSeconds: "0.3",
    refuelRate: "4.5",
    veRate: "2.7",
    tyreServiceSeconds: "31",
    formationSeconds: "1",
    fuelStep: "2",
    veStep: "3",
    reserveLaps: "0.9",
    serviceMode: "sequential",
  });
});

it("confirming without changes sends the saved texts as they are", async () => {
  const saved: { form?: StrategyView["form"] } = {};
  const request = mount("ready", undefined, false, (view) => {
    if (view.form) {
      Object.assign(view.form.fields, {
        fuelCapacityLiters: "82.0",
        pitTransitSeconds: "25.00",
        startAt: "2026-12-06T12:00:00Z",
      });
      view.form.inputs.refuelRate = "4.0";
      view.form.inputs.reserveLaps = "0.80";
      saved.form = structuredClone(view.form);
    }
    return view;
  });
  await openRace();
  click("Editar carrera");
  click("Confirmar datos");
  await screen.findByText("Datos confirmados.");
  const sent = confirmSent(request);
  expect(sent.fields).toEqual(saved.form?.fields);
  expect(sent.inputs).toEqual(saved.form?.inputs);
});

it("confirming again without changes does not move the revision", async () => {
  const request = mount("ready");
  await openRace();
  click("Editar carrera");
  fill({ Depósito: "83" });
  click("Confirmar datos");
  await screen.findByText("Datos confirmados.");
  for (let again = 0; again < 2; again++) {
    click("Editar carrera");
    click("Confirmar datos");
    await waitFor(() =>
      expect(
        request.mock.calls.filter(([r]) => r.method === "strategy.confirm"),
      ).toHaveLength(2 + again),
    );
    await screen.findByText("Datos confirmados.");
  }
  const revisions = request.mock.calls
    .filter(([r]) => r.method === "strategy.confirm")
    .map(([r]) => (r as Confirm).revision);
  expect(revisions[1]).not.toBe(revisions[0]);
  expect(revisions[2]).toBe(revisions[1]);
});

it("blocks everything else while the form has unconfirmed data", async () => {
  const request = mount("ready");
  await openRace();
  // an earlier confirmed change makes the file unsaved, so Ctrl+S would be live
  click("Editar piloto");
  fill({ "Nombre de la carrera": "Copa Fuji" });
  click("Confirmar datos");
  await screen.findByText("Datos confirmados.");
  expect(screen.getByText("Sin guardar")).toBeTruthy();

  click("Editar carrera");
  expect(screen.getByText("Datos sin confirmar")).toBeTruthy();
  fireEvent.keyDown(window, { key: "s", ctrlKey: true });
  expect(request.mock.calls.some(([r]) => r.method === "strategy.save")).toBe(
    false,
  );
  expect(disabled(button("Más acciones de archivo"))).toBe(true);
  expect(disabled(button("Guardar"))).toBe(true);
  expect(disabled(button("← Tus estrategias"))).toBe(true);
  expect(disabled(screen.getByRole("combobox", { name: "Estrategia" }))).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("tab", { name: "Plan" }));
  expect(
    screen.getByRole("tab", { name: "Carrera" }).getAttribute("aria-selected"),
  ).toBe("true");
  expect(button("Confirmar datos")).toBeTruthy();

  click("Cancelar edición");
  expect(screen.getByText("Sin guardar")).toBeTruthy();
  expect(disabled(button("Más acciones de archivo"))).toBe(false);
  click("Editar carrera");
  click("Confirmar datos");
  await screen.findByText("Datos confirmados.");
  expect(screen.getByText("Sin guardar")).toBeTruthy();
});

it("shows a clean file as saved again after cancelling an edit", async () => {
  mount("ready");
  await openRace();
  click("Editar carrera");
  expect(screen.getByText("Datos sin confirmar")).toBeTruthy();
  click("Cancelar edición");
  expect(screen.getByText("Guardado")).toBeTruthy();
});

it("clears the host error when confirming again, so only one alert shows", async () => {
  let failures = 1;
  mount("ready", (r) =>
    r.method === "strategy.confirm" && failures-- > 0
      ? { kind: "rejected" }
      : undefined,
  );
  await openRace();
  click("Editar carrera");
  fill({ "Nombre de la carrera": "Copa Fuji" });
  click("Confirmar datos");
  await screen.findByText("No se ha podido completar la acción.");
  // the focus goes back to a sensible place: the confirm button
  await waitFor(() =>
    expect(document.activeElement).toBe(button("Confirmar datos")),
  );
  fill({ Depósito: "" });
  click("Confirmar datos");
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByRole("alert").textContent).toContain("Revisa 1 dato");
});

it("aligns the renderer with the host rules: positive rates, control characters, length", async () => {
  const request = mount("ready");
  await openRace();
  click("Editar carrera");
  fill({
    "Velocidad de repostaje": "0",
    "Velocidad de recarga de energía": "0",
    Circuito: "Fu\u0007ji",
    "Nombre de la carrera": "é".repeat(257),
  });
  click("Confirmar datos");
  expect(screen.getByRole("alert").textContent).toContain("Revisa 4 datos");
  for (const name of [
    "Velocidad de repostaje",
    "Velocidad de recarga de energía",
    "Circuito",
    "Nombre de la carrera",
  ])
    expect(field(name).getAttribute("aria-invalid")).toBe("true");
  expect(screen.getAllByText(/^Tiene que ser mayor que 0./)).toHaveLength(2);
  expect(
    screen.getByText(/^No uses saltos de línea ni caracteres invisibles./),
  ).toBeTruthy();
  expect(screen.getByText(/^Acorta este texto./)).toBeTruthy();
  expect(confirmSent(request)).toBeUndefined();
});

it("marks empty, non numeric and badly separated numbers in their field", async () => {
  mount("ready");
  await openRace();
  click("Editar carrera");
  fill({
    "Nombre de la carrera": "",
    Depósito: "abc",
    "Consumo por vuelta": "1,2,3",
    "Ritmo por vuelta": "",
    Duración: "",
  });
  click("Confirmar datos");
  expect(screen.getByRole("alert").textContent).toContain("Revisa 5 datos");
  for (const name of [
    "Nombre de la carrera",
    "Depósito",
    "Consumo por vuelta",
    "Ritmo por vuelta",
    "Duración",
  ])
    expect(field(name).getAttribute("aria-invalid")).toBe("true");
  fill({ Depósito: "82,5", "Consumo por vuelta": "1,83" });
  for (const name of ["Depósito", "Consumo por vuelta"])
    expect(field(name).getAttribute("aria-invalid")).toBeNull();
});

it("does not block incoherent duration and laps: the plan uses the laps", async () => {
  const request = mount("ready");
  await openRace();
  click("Editar carrera");
  fill({ Duración: "180", "Vueltas que vas a dar": "3" });
  click("Confirmar datos");
  await screen.findByText("Datos confirmados.");
  const sent = confirmSent(request);
  expect(sent.fields.durationMinutes).toBe("180");
  expect(sent.inputs?.raceLaps).toBe("3");
});

it("does not bring the draft back after cancelling and editing again", async () => {
  mount("ready");
  await openRace();
  click("Editar carrera");
  fill({ Depósito: "99" });
  click("Cancelar edición");
  click("Editar carrera");
  expect(field("Depósito").value).toBe("82");
});

it("sends a single request on a double click on Confirmar datos", async () => {
  const request = mount("ready");
  await openRace();
  click("Editar carrera");
  fill({ Depósito: "83" });
  const confirm = button("Confirmar datos");
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await screen.findByText("Datos confirmados.");
  expect(
    request.mock.calls.filter(([r]) => r.method === "strategy.confirm"),
  ).toHaveLength(1);
});

it("puts aria-invalid only where the role allows it", async () => {
  mount("noInputs");
  await openRace();
  click("Editar carrera");
  click("Confirmar datos");
  const group = screen.getByRole("radiogroup", { name: "En la parada" });
  expect(group.getAttribute("aria-invalid")).toBe("true");
  expect(
    screen
      .queryAllByRole("group")
      .filter((n) => n.hasAttribute("aria-invalid")),
  ).toHaveLength(0);
});

it("confirms again after a conflict with the revision of the replaced view", async () => {
  const { seen, map } = watch();
  let conflicts = 1;
  const request = mount(
    "ready",
    (r) => {
      if (
        r.method !== "strategy.confirm" ||
        conflicts-- <= 0 ||
        !seen.view?.form
      )
        return undefined;
      // someone else really confirms a change first: the host moves on
      const other = request.host({
        kind: "request",
        id: 99,
        request: {
          ...(r as Confirm),
          fields: { ...seen.view.form.fields, name: "Cambiado fuera" },
        },
      });
      if (
        other?.kind !== "response" ||
        other.result.method !== "strategy.confirm"
      )
        throw Error("The concurrent change failed");
      return { kind: "strategyConflict", current: other.result.value };
    },
    false,
    map,
  );
  await openRace();
  click("Editar carrera");
  fill({ Depósito: "90" });
  click("Confirmar datos");
  await screen.findByText(/Los datos de la carrera han cambiado/);
  click("Confirmar datos");
  await screen.findByText("Datos confirmados.");
  const [first, second] = request.mock.calls
    .filter(([r]) => r.method === "strategy.confirm")
    .map(([r]) => r as Confirm);
  expect(first.revision).toBe("a".repeat(64));
  expect(second.revision).not.toBe(first.revision);
  expect(second.fields.fuelCapacityLiters).toBe("90");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("90 L · 1,83 L/v")).toBeTruthy();
});

it("does not keep the draft of one strategy when the new view has another active one", async () => {
  const { seen, map } = watch();
  mount(
    "ready",
    editedConflict(seen, (view) => {
      const other = view.events[0].strategies[1];
      view.activeStrategyId = other.id;
      if (view.form) {
        view.form.fields.name = "Otra carrera";
        view.form.fields.variantName = other.name;
      }
    }),
    false,
    map,
  );
  await openRace();
  click("Editar carrera");
  fill({ "Nombre de la carrera": "Mi nombre", Depósito: "90" });
  click("Confirmar datos");
  expect((await screen.findByRole("alert")).textContent).toMatch(
    /^Los datos de la carrera han cambiado fuera de esta pantalla/,
  );
  await waitFor(() =>
    expect(field("Nombre de la carrera").value).toBe("Otra carrera"),
  );
  expect(field("Depósito").value).toBe("82");
});

it("asks to sign in when the host denies the screen (no session or blocked account)", async () => {
  mount("ready", (r) =>
    r.method === "strategy.view" || r.method === "strategy.open"
      ? { kind: "denied" }
      : undefined,
  );
  expect(
    await screen.findByText(
      "Inicia sesión con una cuenta verificada y que no esté bloqueada para usar Estrategia.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText("No se ha podido completar la acción.")).toBeNull();
});
