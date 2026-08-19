import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { TelemetryOrbitPage } from "./TelemetryOrbitPage";
import { readTelemetryDemoFromSearch, resolveTelemetrySessions } from "./telemetry-orbit-source";

function mount(demo?: boolean) {
  return render(
    <I18nProvider>
      <TelemetryOrbitPage demo={demo} />
    </I18nProvider>,
  );
}

afterEach(cleanup);

describe("TelemetryOrbitPage", () => {
  it("arranca en el vacío honesto: sin sesiones, sin mapa y sin trazas", () => {
    mount(false);
    expect(screen.getByTestId("orbit-telemetry").dataset.mode).toBe("empty");
    expect(screen.getByTestId("orbit-telemetry-title").textContent).toBe("Sin sesión analizada");
    expect(screen.getByTestId("orbit-telemetry-map-empty")).toBeTruthy();
    expect(screen.getByTestId("orbit-telemetry-traces-empty")).toBeTruthy();
    expect(screen.getByTestId("orbit-telemetry-insights-empty").textContent).toContain(
      "No hay sesiones disponibles",
    );
    // La estructura sigue en pie: cabecera, referencia y las cuatro KPI.
    expect(screen.getByRole("group", { name: "Referencia" })).toBeTruthy();
    expect(screen.getByText("Vuelta analizada")).toBeTruthy();
    expect(screen.getByText("Consistencia")).toBeTruthy();
  });

  it("no etiqueta datos sintéticos en el estado vacío", () => {
    mount(false);
    expect(screen.getByTestId("orbit-telemetry-status").textContent).toBe("Sin sesiones");
    expect(screen.queryByText("Datos sintéticos")).toBeNull();
  });

  it("el modo demo solo entra con el flag y va etiquetado en cabecera y nota", () => {
    mount(true);
    expect(screen.getByTestId("orbit-telemetry").dataset.mode).toBe("demo");
    expect(screen.getByTestId("orbit-telemetry-status").textContent).toBe("Datos sintéticos");
    expect(screen.getByText(/los insights los genera la propia pantalla/i)).toBeTruthy();
    expect(screen.getByTestId("orbit-telemetry-insights").children).toHaveLength(8);
  });

  it("el flag se lee de la query y por defecto está apagado", () => {
    expect(readTelemetryDemoFromSearch("?telemetryDemo=1")).toBe(true);
    expect(readTelemetryDemoFromSearch("?telemetryDemo=0")).toBe(false);
    expect(readTelemetryDemoFromSearch("?view=telemetria")).toBeNull();
    // Sin fuente real y sin demo no se inventa ninguna sesión.
    expect(resolveTelemetrySessions(false)).toEqual({ sessions: [], synthetic: false });
    expect(resolveTelemetrySessions(true).synthetic).toBe(true);
  });

  it("sincroniza cursor, mapa e insight al pulsar un insight", () => {
    mount(true);
    expect(screen.getByTestId("orbit-telemetry-cursor").textContent).toBe("— m");
    expect(screen.queryByTestId("orbit-trackmap-car")).toBeNull();

    fireEvent.click(screen.getByTestId("orbit-telemetry-insight-T7"));

    // T7 está al 44 % de una vuelta de 3700 m.
    expect(screen.getByTestId("orbit-telemetry-cursor").textContent).toContain("1628 m ·");
    expect(screen.getByTestId("orbit-telemetry-insight-T7").dataset.on).toBe("true");
    expect(screen.getByTestId("orbit-trackmap-car")).toBeTruthy();
    const selectedSegments = screen
      .getAllByTestId("orbit-trackmap-segment")
      .filter((node) => node.getAttribute("data-on") === "true");
    expect(selectedSegments).toHaveLength(1);
  });

  it("enfoca también desde el tramo del mapa", () => {
    mount(true);
    const segment = screen
      .getAllByTestId("orbit-trackmap-segment")
      .find((node) => (node.getAttribute("aria-label") ?? "").startsWith("T13"));
    fireEvent.click(segment!);
    expect(screen.getByTestId("orbit-telemetry-insight-T13").dataset.on).toBe("true");
    expect(screen.getByTestId("orbit-telemetry-cursor").textContent).toContain("2627 m ·");
  });

  it("cambiar la referencia reescala el delta y los insights", () => {
    mount(true);
    const before = screen.getByTestId("orbit-telemetry-delta").textContent;
    const worstBefore = screen.getByTestId("orbit-telemetry-insights").children[0].textContent;

    fireEvent.click(
      within(screen.getByRole("group", { name: "Referencia" })).getByRole("button", {
        name: "vs referencia Vantare",
      }),
    );

    const after = screen.getByTestId("orbit-telemetry-delta").textContent;
    expect(after).not.toBe(before);
    expect(Number(after)).toBeCloseTo(Number(before) * 1.6, 3);
    expect(screen.getByTestId("orbit-telemetry-insights").children[0].textContent).not.toBe(
      worstBefore,
    );
  });

  it("no usa el atributo `title` nativo", () => {
    mount(true);
    expect(screen.getByTestId("orbit-telemetry").querySelectorAll("[title]")).toHaveLength(0);
  });
});

describe("TelemetryOrbitPage · cableado auditado", () => {
  it("el eje Tiempo va deshabilitado con motivo y Distancia sigue activo", () => {
    render(
      <I18nProvider>
        <TelemetryOrbitPage demo />
      </I18nProvider>,
    );
    const time = screen.getByRole("button", { name: "Tiempo" }) as HTMLButtonElement;
    expect(time.disabled).toBe(true);
    expect(time.getAttribute("data-tip")).toBeTruthy();
    expect(time.getAttribute("title")).toBeNull();
    expect((screen.getByRole("button", { name: "Distancia" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
