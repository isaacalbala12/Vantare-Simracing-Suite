import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { RoadmapOrbitPage } from "./RoadmapOrbitPage";

const bus = vi.hoisted(() => ({
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

const translated = (es: string) => ({ es, en: "", pt: "", it: "" });
const publication = {
  id: "published",
  document: {
    schemaVersion: 1,
    items: [
      { id: "11111111-1111-4111-8111-111111111111", section: "done", title: translated("Base lista"), body: translated("Disponible") },
      { id: "22222222-2222-4222-8222-222222222222", section: "now", title: translated("Integración"), body: translated("En curso") },
      { id: "33333333-3333-4333-8333-333333333333", section: "next", title: translated("Nueva vista"), body: translated("") },
      { id: "44444444-4444-4444-8444-444444444444", section: "next", title: translated("Otra vista"), body: translated("") },
    ],
  },
};

function mount() {
  render(<I18nProvider><RoadmapOrbitPage /></I18nProvider>);
}
function requestID() {
  return bus.emits.find((entry) => entry.name === "roadmap:current:get")?.payload.requestId;
}
async function reply(value: unknown) {
  await act(async () => { bus.callbacks.get("roadmap:current")?.({ data: { requestId: requestID(), publication: value } }); });
}

afterEach(() => {
  cleanup();
  bus.callbacks.clear();
  bus.emits.length = 0;
  localStorage.clear();
});

describe("public roadmap graphs", () => {
  it("shows an ordered milestone timeline without editing controls or write requests", async () => {
    mount();
    await reply(publication);
    const timeline = screen.getByTestId("roadmap-timeline");
    expect(timeline.textContent).toContain("Base lista");
    expect(timeline.textContent).toContain("Integración");
    expect(timeline.textContent).toContain("Nueva vista");
    expect(timeline.textContent?.indexOf("Base lista")).toBeLessThan(timeline.textContent!.indexOf("Integración"));
    const detail = screen.getByTestId("roadmap-timeline-detail");
    expect(detail.textContent).toContain("Integración");
    fireEvent.click(screen.getByRole("button", { name: /Base lista/ }));
    expect(detail.textContent).toContain("Disponible");
    expect(screen.getByRole("button", { name: /Base lista/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Nueva vista/ }));
    expect(detail.textContent).toContain("Nueva vista");
    expect(detail.textContent).not.toContain("Disponible");
    expect(screen.queryByText("Editar")).toBeNull();
    expect(bus.emits.map((entry) => entry.name)).toEqual(["roadmap:current:get"]);
  });

  it("switches between timeline, stage board and a chart of actual item counts", async () => {
    mount();
    await reply(publication);
    fireEvent.click(screen.getByRole("button", { name: "Por estado" }));
    expect(screen.getByTestId("roadmap-board")).toBeTruthy();
    expect(screen.getAllByTestId(/roadmap-board-(done|now|next)/)).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Distribución" }));
    expect(screen.getByTestId("roadmap-distribution-next").textContent).toContain("2");
    expect(screen.queryByTestId("roadmap-editor")).toBeNull();
  });

  it("keeps the honest empty state when nothing is published", async () => {
    mount();
    await reply(null);
    expect(screen.getByText("Todavía no hay un roadmap publicado.")).toBeTruthy();
    expect(screen.queryByTestId("roadmap-timeline")).toBeNull();
  });
});
