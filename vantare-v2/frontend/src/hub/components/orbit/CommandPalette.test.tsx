import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette, type PaletteItem } from "./CommandPalette";

const labels = {
  title: "Comando de Vantare",
  placeholder: "Busca una sección o una acción…",
  goTo: "Ir a",
  actions: "Acciones",
  footNav: "↑↓ navegar",
  footRun: "↵ ejecutar",
  footLocked: "Los destinos bloqueados muestran el motivo",
};

function build() {
  const runInicio = vi.fn();
  const runEstrategia = vi.fn();
  const runSave = vi.fn();
  const destinations: PaletteItem[] = [
    { id: "inicio", label: "Inicio", icon: "i-inicio", run: runInicio },
    {
      id: "estrategia",
      label: "Estrategia",
      icon: "i-estrategia",
      locked: "Requiere Overlays",
      run: runEstrategia,
    },
  ];
  const actions: PaletteItem[] = [
    { id: "save", label: "Guardar perfil", meta: "Studio", icon: "i-studio", run: runSave },
  ];
  return { destinations, actions, runInicio, runEstrategia, runSave };
}

function renderPalette(open = true) {
  const { destinations, actions, runInicio, runEstrategia, runSave } = build();
  const onClose = vi.fn();
  const onBlocked = vi.fn();
  render(
    <CommandPalette
      actions={actions}
      destinations={destinations}
      labels={labels}
      onBlocked={onBlocked}
      onClose={onClose}
      open={open}
    />,
  );
  return { onClose, onBlocked, runInicio, runEstrategia, runSave };
}

const input = () => screen.getByTestId("orbit-palette-input");

afterEach(() => {
  cleanup();
});

describe("CommandPalette", () => {
  it("no renderiza nada cerrada", () => {
    renderPalette(false);
    expect(screen.queryByTestId("orbit-palette-backdrop")).toBeNull();
  });

  it("abre con el foco en el input", () => {
    renderPalette();
    expect(document.activeElement).toBe(screen.getByTestId("orbit-palette-input"));
  });

  it('escribir "guard" oculta el grupo "Ir a"', () => {
    renderPalette();
    fireEvent.change(screen.getByTestId("orbit-palette-input"), { target: { value: "guard" } });
    expect(screen.queryByTestId("orbit-palette-group-goTo")).toBeNull();
    expect(screen.getByTestId("orbit-palette-group-actions")).toBeTruthy();
    expect(screen.getByTestId("orbit-palette-item-save")).toBeTruthy();
  });

  it("↵ ejecuta el ítem seleccionado y cierra", () => {
    const { runInicio, onClose } = renderPalette();
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(runInicio).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("↓ mueve la selección al siguiente ítem", () => {
    const { runEstrategia, onBlocked } = renderPalette();
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(
      screen.getByTestId("orbit-palette-item-estrategia").getAttribute("data-selected"),
    ).toBe("true");
    fireEvent.keyDown(input(), { key: "Enter" });
    // Bloqueado: no se ejecuta, se avisa del motivo.
    expect(runEstrategia).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalled();
  });

  it("los ítems bloqueados muestran el motivo en vez del meta", () => {
    renderPalette();
    expect(screen.getByTestId("orbit-palette-item-estrategia").textContent).toContain("Requiere Overlays");
  });

  it("Esc cierra", () => {
    const { onClose } = renderPalette();
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("el clic en el fondo cierra", () => {
    const { onClose } = renderPalette();
    fireEvent.click(screen.getByTestId("orbit-palette-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});
