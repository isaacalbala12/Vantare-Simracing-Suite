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
};

function renderColumn(activeView: ViewId, overrides: Partial<React.ComponentProps<typeof ContextColumn>> = {}) {
  const onCollapse = vi.fn();
  const view = render(
    <ContextColumn
      activeView={activeView}
      blocks={blocks}
      labels={labels}
      onCollapse={onCollapse}
      title="Vantare Suite"
      version="v0.3.9"
      {...overrides}
    />,
  );
  return { ...view, onCollapse };
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

  // D-R3-B-1: la columna ya no tiene pie. Ni el estado del sim ni el plan se
  // repiten aquí; viven en el saludo de Inicio, en Ajustes › Diagnóstico y en
  // la fila de cuenta del rail.
  it("no pinta pie: ni estado del sim ni plan", () => {
    const { container } = renderColumn("inicio");
    expect(container.querySelector(".orbit-column__foot")).toBeNull();
    expect(screen.queryByText("LMU conectado")).toBeNull();
    expect(screen.queryByText("Suite")).toBeNull();
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
