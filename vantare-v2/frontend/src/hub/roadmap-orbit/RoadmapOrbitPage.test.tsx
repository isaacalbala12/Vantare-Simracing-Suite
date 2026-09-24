import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { RoadmapOrbitPage } from "./RoadmapOrbitPage";

const bus = vi.hoisted(() => ({
  owner: false,
  callbacks: new Map<string, (event: unknown) => void>(),
  emits: [] as Array<{ name: string; payload: Record<string, unknown> }>,
}));
vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: (name: string, callback: (event: unknown) => void) => {
      bus.callbacks.set(name, callback);
      return () => bus.callbacks.delete(name);
    },
    Emit: (name: string, payload: Record<string, unknown>) => {
      bus.emits.push({ name, payload });
      return Promise.resolve();
    },
  },
}));
vi.mock("../../lib/access", () => ({
  useAccess: () => ({ roles: bus.owner ? ["owner"] : [], isBlocked: false }),
}));

function mount(owner = false) {
  bus.owner = owner;
  render(<I18nProvider><RoadmapOrbitPage /></I18nProvider>);
}
function requestID(name: string) {
  return bus.emits.find((entry) => entry.name === name)?.payload.requestId as string;
}
async function reply(name: string, data: Record<string, unknown>) {
  await act(async () => { bus.callbacks.get(name)?.({ data }); });
}

afterEach(() => {
  cleanup();
  bus.callbacks.clear();
  bus.emits.length = 0;
  bus.owner = false;
  localStorage.clear();
});

describe("visual roadmap", () => {
  it("shows only published content to readers and never offers editing", async () => {
    mount();
    await reply("roadmap:current", {
      requestId: requestID("roadmap:current:get"),
      publication: {
        id: "published",
        document: {
          schemaVersion: 1,
          items: [{
            id: "11111111-1111-4111-8111-111111111111",
            section: "now",
            title: { es: "Beta abierta", en: "Open beta", pt: "Beta aberta", it: "Beta aperta" },
            body: { es: "En preparación", en: "In preparation", pt: "Em preparação", it: "In preparazione" },
          }],
        },
      },
    });
    expect(screen.getByText("Beta abierta")).toBeTruthy();
    expect(screen.queryByText("Editar")).toBeNull();
    expect(bus.emits.some((entry) => entry.name === "roadmap:draft:get")).toBe(false);
  });

  it("requires a saved owner draft before publication", async () => {
    mount(true);
    await reply("roadmap:current", { requestId: requestID("roadmap:current:get"), publication: null });
    await reply("roadmap:draft", { requestId: requestID("roadmap:draft:get"), publication: null });
    fireEvent.click(screen.getByText("Editar"));
    fireEvent.click(screen.getByText("Añadir elemento"));
    expect(screen.getByText("Publicar para todos").closest("button")?.disabled).toBe(true);
    fireEvent.change(screen.getAllByLabelText("Título")[0], { target: { value: "Un próximo paso" } });
    fireEvent.click(screen.getByText("Guardar borrador"));
    const save = bus.emits.findLast((entry) => entry.name === "roadmap:draft:save");
    expect(save?.payload.document).toMatchObject({ schemaVersion: 1, items: [{ section: "next" }] });
    await reply("roadmap:saved", { requestId: save?.payload.requestId, draftId: "22222222-2222-4222-8222-222222222222" });
    expect(screen.getByText("Publicar para todos").closest("button")?.disabled).toBe(false);
    fireEvent.click(screen.getByText("Publicar para todos"));
    expect(bus.emits.findLast((entry) => entry.name === "roadmap:publish")?.payload.draftId).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("keeps unsaved edits when the editor is closed and reopened", async () => {
    mount(true);
    await reply("roadmap:current", { requestId: requestID("roadmap:current:get"), publication: null });
    await reply("roadmap:draft", { requestId: requestID("roadmap:draft:get"), publication: null });
    fireEvent.click(screen.getByText("Editar"));
    fireEvent.click(screen.getByText("Añadir elemento"));
    fireEvent.change(screen.getAllByLabelText("Título")[0], { target: { value: "Pendiente" } });
    fireEvent.click(screen.getByText("Cerrar edición"));
    fireEvent.click(screen.getByText("Editar"));
    expect((screen.getAllByLabelText("Título")[0] as HTMLInputElement).value).toBe("Pendiente");
    expect(screen.getByText("Publicar para todos").closest("button")?.disabled).toBe(true);
  });
});
