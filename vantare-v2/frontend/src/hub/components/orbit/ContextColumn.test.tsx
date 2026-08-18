import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextColumn, type ContextColumnBlock } from "./ContextColumn";
import type { ViewId } from "../../orbit/views";

const blocks: ContextColumnBlock[] = [
  { id: "races", hiddenFor: ["carreras"], content: <p>Próximas carreras</p> },
  { id: "profile", hiddenFor: ["studio"], content: <p>Perfil de overlay</p> },
  { id: "launcher", hiddenFor: ["launcher"], content: <p>Bloque Launcher</p> },
];

const labels = {
  column: "Panel contextual",
  collapse: "Plegar la columna lateral",
  sim: "LMU conectado",
  simTitle: "Fuente de telemetría: LMU conectado · en directo",
};

function renderColumn(activeView: ViewId, overrides: Partial<React.ComponentProps<typeof ContextColumn>> = {}) {
  const onCollapse = vi.fn();
  const onOpenAccount = vi.fn();
  render(
    <ContextColumn
      activeView={activeView}
      blocks={blocks}
      labels={labels}
      onCollapse={onCollapse}
      onOpenAccount={onOpenAccount}
      planLabel="Suite"
      simStatus="connected"
      title="Vantare Suite"
      version="v0.3.9"
      {...overrides}
    />,
  );
  return { onCollapse, onOpenAccount };
}

afterEach(() => {
  cleanup();
});

describe("ContextColumn", () => {
  it("en Inicio muestra los tres bloques persistentes", () => {
    renderColumn("inicio");
    const container = screen.getByTestId("orbit-column-blocks");
    expect(container.querySelectorAll("[data-block]")).toHaveLength(3);
  });

  it("en Carreras oculta el bloque de próximas carreras (hiddenFor)", () => {
    renderColumn("carreras");
    expect(screen.queryByText("Próximas carreras")).toBeNull();
    expect(screen.getByText("Perfil de overlay")).toBeTruthy();
  });

  it("en Studio oculta el bloque de perfil de overlay", () => {
    renderColumn("studio");
    expect(screen.queryByText("Perfil de overlay")).toBeNull();
  });

  it("en Ajustes esconde todos los bloques y deja solo el contexto", () => {
    renderColumn("ajustes", { context: <p>Secciones de Ajustes</p> });
    expect(screen.queryByTestId("orbit-column-blocks")).toBeNull();
    expect(screen.getByText("Secciones de Ajustes")).toBeTruthy();
  });

  it("el pie es la única fuente textual del estado del sim y lleva el plan a Cuenta", () => {
    const { onOpenAccount } = renderColumn("inicio");
    expect(screen.getByText("LMU conectado")).toBeTruthy();
    fireEvent.click(screen.getByText("Suite"));
    expect(onOpenAccount).toHaveBeenCalled();
  });

  it("el botón ‹ pliega la columna", () => {
    const { onCollapse } = renderColumn("inicio");
    fireEvent.click(screen.getByTestId("orbit-column-collapse"));
    expect(onCollapse).toHaveBeenCalled();
  });

  it("muestra el título de la sección y la versión", () => {
    renderColumn("inicio");
    expect(screen.getByTestId("orbit-column-title").textContent).toContain("Vantare Suite");
    expect(screen.getByText("v0.3.9")).toBeTruthy();
  });
});
