import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Rail, type RailItem } from "./Rail";

const labels = {
  rail: "Secciones de Vantare",
  brand: "Vantare",
  palette: "Comando de Vantare · Ctrl K",
  settings: "Ajustes",
  account: "Cuenta · plan Free",
  toggleColumn: "Mostrar la columna lateral",
  toggleColumnHide: "Ocultar la columna lateral",
  noContext: "Esta sección no tiene panel contextual",
  requiresPlan: "Requiere el plan Overlays · plan actual Free",
};

const baseItems: RailItem[] = [
  { id: "inicio", icon: "i-vantare", label: "Inicio" },
  { id: "studio", icon: "i-studio", label: "Overlays Studio" },
  {
    id: "estrategia",
    icon: "i-estrategia",
    label: "Estrategia",
    locked: { requiredPlan: "Overlays", currentPlan: "Free" },
  },
  { id: "telemetria", icon: "i-telemetria", label: "Telemetría · Próximamente", soon: true },
];

function renderRail(overrides: Partial<React.ComponentProps<typeof Rail>> = {}) {
  const onNavigate = vi.fn();
  const onToggleColumn = vi.fn();
  const onTogglePalette = vi.fn();
  render(
    <Rail
      active="inicio"
      columnAvailable
      columnOpen
      items={baseItems}
      labels={labels}
      onNavigate={onNavigate}
      onToggleColumn={onToggleColumn}
      onTogglePalette={onTogglePalette}
      accountName="Isaac Albalá"
      {...overrides}
    />,
  );
  return { onNavigate, onToggleColumn, onTogglePalette };
}

afterEach(() => {
  cleanup();
});

describe("Rail", () => {
  it("marca la vista activa con aria-current", () => {
    renderRail();
    expect(screen.getByTestId("orbit-rail-inicio").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("orbit-rail-studio").getAttribute("aria-current")).toBeNull();
  });

  it("pinta el candado y el motivo del plan en el tooltip, sin title nativo", () => {
    renderRail();
    const locked = screen.getByTestId("orbit-rail-estrategia");
    expect(locked.getAttribute("data-tip")).toBe(labels.requiresPlan);
    expect(locked.getAttribute("title")).toBeNull();
    expect(locked.className).toContain("orbit-rail__button--locked");
  });

  it("marca Telemetría como próximamente", () => {
    renderRail();
    expect(
      screen.getByTestId("orbit-rail-telemetria").querySelector(".orbit-rail__soon"),
    ).not.toBeNull();
  });

  it("no renderiza Testing Center cuando no está en los items (canal stable)", () => {
    renderRail();
    expect(screen.queryByTestId("orbit-rail-testing")).toBeNull();
  });

  it("renderiza Testing Center cuando el canal lo incluye", () => {
    renderRail({
      items: [...baseItems, { id: "testing", icon: "i-flask", label: "Testing Center" }],
    });
    expect(screen.getByTestId("orbit-rail-testing")).toBeTruthy();
  });

  it("navega y avisa al plegar la columna", () => {
    const { onNavigate, onToggleColumn } = renderRail();
    fireEvent.click(screen.getByTestId("orbit-rail-studio"));
    expect(onNavigate).toHaveBeenCalledWith("studio");
    fireEvent.click(screen.getByTestId("orbit-rail-toggle-column"));
    expect(onToggleColumn).toHaveBeenCalled();
  });

  it("el botón de plegar refleja el estado con aria-pressed", () => {
    renderRail({ columnOpen: false });
    const toggle = screen.getByTestId("orbit-rail-toggle-column");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.getAttribute("data-tip")).toBe(labels.toggleColumn);
  });

  it("deshabilita el plegado cuando la columna no tiene nada que mostrar", () => {
    renderRail({ columnAvailable: false });
    const toggle = screen.getByTestId("orbit-rail-toggle-column");
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect(toggle.getAttribute("data-tip")).toBe(labels.noContext);
  });

  it("el avatar y Ajustes llevan a su destino de Cuenta/Aplicación", () => {
    const { onNavigate } = renderRail();
    fireEvent.click(screen.getByTestId("orbit-rail-account"));
    expect(onNavigate).toHaveBeenCalledWith("ajustes", "account");
    fireEvent.click(screen.getByTestId("orbit-rail-ajustes"));
    expect(onNavigate).toHaveBeenCalledWith("ajustes", "application");
  });

  it("Inicio usa la marca de Vantare, no la casita", () => {
    renderRail();
    const use = screen.getByTestId("orbit-rail-inicio").querySelector("use");
    expect(use?.getAttribute("href")).toMatch(/#i-vantare$/);
  });

  it("el avatar pinta la foto de la cuenta cuando la hay", () => {
    renderRail({ avatarSrc: "https://lh3.googleusercontent.com/a/foto" });
    const img = screen.getByTestId("orbit-rail-account-avatar") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://lh3.googleusercontent.com/a/foto");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-label")).toBe("Isaac Albalá");
    expect(screen.getByTestId("orbit-rail-account").textContent).toBe("");
  });

  it("sin foto cae a la inicial del nombre, nunca a la del plan", () => {
    renderRail({ accountName: "Isaac Albalá", accountEmail: "isaac@vantare.app" });
    expect(screen.getByTestId("orbit-rail-account").textContent).toBe("I");
    expect(screen.queryByTestId("orbit-rail-account-avatar")).toBeNull();
  });

  it("sin nombre usa la inicial del correo", () => {
    renderRail({ accountName: undefined, accountEmail: "piloto@vantare.app" });
    expect(screen.getByTestId("orbit-rail-account").textContent).toBe("P");
  });

  it("si la foto no carga, vuelve a la inicial del nombre", () => {
    renderRail({ avatarSrc: "https://lh3.googleusercontent.com/a/rota" });
    fireEvent.error(screen.getByTestId("orbit-rail-account-avatar"));
    expect(screen.queryByTestId("orbit-rail-account-avatar")).toBeNull();
    expect(screen.getByTestId("orbit-rail-account").textContent).toBe("I");
  });

  it("la marca no usa `title` nativo: lleva el tooltip propio del rail", () => {
    renderRail();
    const brand = screen.getByTestId("orbit-rail-brand");
    expect(brand.getAttribute("title")).toBeNull();
    expect(brand.getAttribute("data-tip")).toBe(labels.brand);
  });
});
