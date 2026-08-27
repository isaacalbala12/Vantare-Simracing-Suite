import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Topbar } from "./Topbar";

/**
 * El pill de actualización, que hasta ahora no tenía prueba ninguna.
 *
 * Anunciaba «Descargando… 0%» de principio a fin porque el shell tiraba el
 * porcentaje del evento, y tenía un estado `ready` que no emitía nadie.
 */
function renderPill(overrides: Partial<React.ComponentProps<typeof Topbar>> = {}) {
  render(
    <Topbar eyebrow="Vantare" title="Inicio" update="available" view="inicio" {...overrides} />,
  );
}

afterEach(cleanup);

describe("pill de actualización", () => {
  it("no aparece cuando no hay nada que actualizar", () => {
    renderPill({ update: "none", updateLabel: "v0.1.0.9" });
    expect(screen.queryByText("v0.1.0.9")).toBeNull();
  });

  it("muestra la copia que le den para cada estado", () => {
    renderPill({ update: "downloading", updateLabel: "Descargando… 42%" });
    expect(screen.getByText("Descargando… 42%")).not.toBeNull();
  });

  it("marca el punto en dorado solo mientras se instala", () => {
    renderPill({ update: "downloading", updateLabel: "Descargando… 42%" });
    expect(document.querySelector(".orbit-pill__dot--gold")).toBeNull();
    expect(document.querySelector(".orbit-pill__dot--ring-gold")).not.toBeNull();

    cleanup();
    renderPill({ update: "installing", updateLabel: "Instalando actualización…" });
    expect(document.querySelector(".orbit-pill__dot--gold")).not.toBeNull();
  });

  it("late mientras descarga y deja de latir al instalar", () => {
    renderPill({ update: "downloading", updateLabel: "Descargando… 42%" });
    expect(document.querySelector(".orbit-pill--pulse")).not.toBeNull();

    cleanup();
    renderPill({ update: "installing", updateLabel: "Instalando actualización…" });
    expect(document.querySelector(".orbit-pill--pulse")).toBeNull();
  });

  it("lleva a Ajustes al pulsarlo", () => {
    const onUpdate = vi.fn();
    renderPill({ updateLabel: "v0.1.0.9", onUpdate });
    screen.getByText("v0.1.0.9").closest("button")?.click();
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it("expone el estado en el DOM para poder verificarlo", () => {
    renderPill({ update: "installing", updateLabel: "Instalando actualización…" });
    expect(document.querySelector('[data-s="installing"]')).not.toBeNull();
  });
});
