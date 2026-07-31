import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@wailsio/runtime", () => ({
  Events: {
    Emit: vi.fn(),
    On: vi.fn(() => () => {}),
  },
}));

import { I18nProvider } from "../../../i18n/I18nProvider";
import type { DiagnosticsActions } from "./diagnostics-actions";
import {
  DiagnosticsClientError,
  type DiagnosticsClient,
} from "./diagnostics-client";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import {
  createFixtureDiagnosticsClient,
  fixtureCorruptSession,
  fixtureCurrentSession,
  fixtureFutureSession,
  fixturePayload,
  fixturePrepared,
} from "./test-fixtures";

function renderPanel(
  client: DiagnosticsClient = createFixtureDiagnosticsClient(0),
  actions?: DiagnosticsActions,
) {
  return render(
    <I18nProvider>
      <DiagnosticsPanel client={client} actions={actions} />
    </I18nProvider>,
  );
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = hex
      .replace("#", "")
      .match(/.{2}/gu)
      ?.map((value) => Number.parseInt(value, 16) / 255) ?? [0, 0, 0];
    const [red, green, blue] = channels.map((value) =>
      value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4,
    );
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("DiagnosticsPanel", () => {
  it("shows loading, metadata sessions and the exact preview before actions", async () => {
    renderPanel(createFixtureDiagnosticsClient(10));

    expect(screen.getAllByText("Preparando datos locales…").length).toBeGreaterThan(0);
    await screen.findByText("En directo");

    expect(screen.getByText("Actual")).toBeDefined();
    expect(screen.getByText("Versión futura")).toBeDefined();
    expect(screen.getByText("No válida")).toBeDefined();
    expect(screen.getByTestId("diagnostics-payload").textContent).toBe(fixturePayload);
    expect(
      screen.getByRole("button", { name: "Copiar contenido exacto" }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Descargar JSON exacto" }),
    ).toBeDefined();
    const localMuted = screen
      .getByTestId("diagnostics-panel")
      .style.getPropertyValue("--v-text-muted");
    expect(localMuted).toMatch(/^#[0-9a-f]{6}$/iu);
    expect(contrastRatio(localMuted, "#0F0F0F")).toBeGreaterThanOrEqual(4.5);
  });

  it("copies and downloads the exact prepared payload", async () => {
    const actions: DiagnosticsActions = {
      copy: vi.fn().mockResolvedValue(undefined),
      download: vi.fn(),
    };
    renderPanel(createFixtureDiagnosticsClient(0), actions);
    await screen.findByTestId("diagnostics-payload");

    fireEvent.click(screen.getByRole("button", { name: "Copiar contenido exacto" }));
    await waitFor(() => {
      expect(actions.copy).toHaveBeenCalledWith(fixturePayload);
    });
    fireEvent.click(screen.getByRole("button", { name: "Descargar JSON exacto" }));
    expect(actions.download).toHaveBeenCalledWith(fixturePrepared);
  });

  it("inspects a selected current session and shows fields and aggregate quality", async () => {
    renderPanel();
    await screen.findByText("Versión futura");
    fireEvent.click(screen.getAllByRole("button", { name: /LMU/i })[0]);

    expect(await screen.findByText("18")).toBeDefined();
    const speed = screen.getByTestId("diagnostics-field-speed");
    expect(speed.getAttribute("aria-label")).toBe("Velocidad: Presente");
    expect(speed.querySelector("[aria-hidden='true']")?.textContent).toBe("●");
    expect(screen.getByText("Obsoleta")).toBeDefined();
    expect(screen.queryByText(/C:\\/u)).toBeNull();
    expect(
      screen
        .getByTestId("diagnostics-panel")
        .querySelector(".text-vantare-textDim"),
    ).toBeNull();
  });

  it.each([
    [fixtureFutureSession, "Esta sesión usa una versión futura."],
    [fixtureCorruptSession, "El manifest no es válido"],
  ])("renders the %s compatibility state without inspecting storage", async (session, message) => {
    const inspectSession = vi.fn<DiagnosticsClient["inspectSession"]>();
    const client: DiagnosticsClient = {
      prepare: async () => fixturePrepared,
      listSessions: async () => ({ sessions: [session], truncated: false }),
      inspectSession,
    };
    renderPanel(client);
    const button = await screen.findByRole("button", { name: /LMU/i });
    fireEvent.click(button);
    expect(await screen.findByText(new RegExp(message, "i"))).toBeDefined();
    expect(screen.getByTestId("diagnostics-detail-laps").textContent).toBe("—");
    expect(screen.getByTestId("diagnostics-detail-vehicles").textContent).toBe(
      "—",
    );
    expect(inspectSession).not.toHaveBeenCalled();
  });

  it("explains a current unavailable session without inspecting storage", async () => {
    const inspectSession = vi.fn<DiagnosticsClient["inspectSession"]>();
    const currentUnavailable = {
      ...fixtureCurrentSession,
      handle: "diag-44444444444444444444444444444444",
      availability: "unavailable" as const,
      unavailableReason: "inspection_failed" as const,
      fields: [],
      quality: [],
    };
    const client: DiagnosticsClient = {
      prepare: async () => fixturePrepared,
      listSessions: async () => ({
        sessions: [currentUnavailable],
        truncated: false,
      }),
      inspectSession,
    };

    renderPanel(client);
    fireEvent.click(await screen.findByRole("button", { name: /LMU/i }));

    expect(
      (
        await screen.findByTestId(
          "diagnostics-session-notice-unavailable",
        )
      ).textContent,
    ).toContain("No se pudo inspeccionar esta sesión de forma segura.");
    expect(screen.getByTestId("diagnostics-detail-laps").textContent).toBe("—");
    expect(screen.getByTestId("diagnostics-detail-vehicles").textContent).toBe(
      "—",
    );
    expect(inspectSession).not.toHaveBeenCalled();
  });

  it("preserves legitimate zero lap and vehicle counts after a current ready inspection", async () => {
    const client: DiagnosticsClient = {
      prepare: async () => fixturePrepared,
      listSessions: async () => ({
        sessions: [fixtureCurrentSession],
        truncated: false,
      }),
      inspectSession: async () => ({
        ...fixtureCurrentSession,
        lapCount: 0,
        vehicleCount: 0,
      }),
    };

    renderPanel(client);
    fireEvent.click(await screen.findByRole("button", { name: /LMU/i }));

    expect((await screen.findByTestId("diagnostics-detail-laps")).textContent).toBe(
      "0",
    );
    expect(screen.getByTestId("diagnostics-detail-vehicles").textContent).toBe(
      "0",
    );
  });

  it("renders a clear empty state", async () => {
    const client: DiagnosticsClient = {
      prepare: async () => fixturePrepared,
      listSessions: async () => ({ sessions: [], truncated: false }),
      inspectSession: async () => fixtureCurrentSession,
    };
    renderPanel(client);
    expect(await screen.findByText("No hay sesiones")).toBeDefined();
  });

  it("distinguishes timeout, backend error and cancellation", async () => {
    const timeoutClient: DiagnosticsClient = {
      prepare: async () => {
        throw new DiagnosticsClientError("timeout", "prepare");
      },
      listSessions: async () => {
        throw new DiagnosticsClientError("list_failed", "sessions.list");
      },
      inspectSession: async () => fixtureCurrentSession,
    };
    const first = renderPanel(timeoutClient);
    expect(await screen.findAllByText("La respuesta tardó demasiado")).not.toHaveLength(0);
    expect(screen.getByText("No se pudo leer el catálogo local.")).toBeDefined();
    first.unmount();

    const canceledClient: DiagnosticsClient = {
      prepare: (signal) =>
        new Promise((_, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DiagnosticsClientError("canceled", "prepare")),
            { once: true },
          );
        }),
      listSessions: ({ signal } = {}) =>
        new Promise((_, reject) => {
          signal?.addEventListener(
            "abort",
            () =>
              reject(
                new DiagnosticsClientError("canceled", "sessions.list"),
              ),
            { once: true },
          );
        }),
      inspectSession: async () => fixtureCurrentSession,
    };
    renderPanel(canceledClient);
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(await screen.findAllByText("Operación cancelada")).not.toHaveLength(0);
  });

  it("aborts pending requests when unmounted", () => {
    const signals: AbortSignal[] = [];
    const client: DiagnosticsClient = {
      prepare: (signal) => {
        if (signal) signals.push(signal);
        return new Promise(() => {});
      },
      listSessions: ({ signal } = {}) => {
        if (signal) signals.push(signal);
        return new Promise(() => {});
      },
      inspectSession: async () => fixtureCurrentSession,
    };
    const view = renderPanel(client);
    view.unmount();
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it.each([
    ["es", "Inspector y paquete de diagnóstico"],
    ["en", "Inspector and diagnostics package"],
    ["it", "Inspector e pacchetto diagnostico"],
    ["pt", "Inspetor e pacote de diagnóstico"],
  ])("renders complete diagnostics copy in %s", async (locale, title) => {
    localStorage.setItem("vantare.locale", locale);
    renderPanel();
    expect(await screen.findByRole("heading", { name: title })).toBeDefined();
  });
});
