import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { I18nProvider } from "../../i18n/I18nProvider";
import { LicenseProvider } from "../../lib/license";
import { SETTINGS_CONTEXT_SLOT_ID, SettingsOrbitPage } from "./SettingsOrbitPage";
import { conflictingHotkeys, keycapsOf, maskEmail, resolveSettingsSection, searchSettings } from "./settings-orbit-model";
import { UPDATER_CHANNEL_EVENT } from "../settings/updater-channel";
import { fixturePrepared } from "../settings/diagnostics/test-fixtures";

/** La shell reserva el hueco de la columna; en los tests lo monta el propio test. */
function mount(target?: string) {
  const slot = document.createElement("div");
  slot.id = SETTINGS_CONTEXT_SLOT_ID;
  document.body.append(slot);
  const view = render(
    <LicenseProvider>
      <I18nProvider>
        <SettingsOrbitPage target={target} />
      </I18nProvider>
    </LicenseProvider>,
  );
  return { ...view, slot };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  document.querySelectorAll(`#${SETTINGS_CONTEXT_SLOT_ID}`).forEach((node) => node.remove());
  delete document.body.dataset.density;
  delete document.body.dataset.reduceMotion;
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("modelo de Ajustes", () => {
  it("resuelve la sección pedida, después la guardada y por último Aplicación", () => {
    expect(resolveSettingsSection("hotkeys", "updates")).toBe("hotkeys");
    expect(resolveSettingsSection(null, "updates")).toBe("updates");
    expect(resolveSettingsSection("inventada", null)).toBe("application");
  });

  it("pinta una combinación como keycaps y deja vacía la que no existe", () => {
    expect(keycapsOf("ctrl+shift+right")).toEqual(["Ctrl", "Shift", "→"]);
    expect(keycapsOf("")).toEqual([]);
    expect(keycapsOf(undefined)).toEqual([]);
  });

  it("solo marca conflicto entre atajos realmente asignados", () => {
    expect([...conflictingHotkeys({ toggleOverlay: "ctrl+k", nextProfile: "ctrl+k" })].sort()).toEqual([
      "nextProfile",
      "toggleOverlay",
    ]);
    expect(conflictingHotkeys({ toggleOverlay: "", nextProfile: "" }).size).toBe(0);
  });

  it("enmascara el correo sin cambiar el dominio", () => {
    expect(maskEmail("isaacalbala@gmail.com")).toBe("isaac•••@gmail.com");
    expect(maskEmail("")).toBe("");
  });

  it("la búsqueda ignora mayúsculas y diacríticos y no inventa resultados", () => {
    const dict: Record<string, string> = {
      "settings.diag.core": "Telemetry Core",
      "settings.app.theme": "Tema",
    };
    const t = (key: string) => dict[key] ?? key;

    expect(searchSettings("TEMA", t)).toEqual([
      { section: "application", key: "settings.app.theme" },
    ]);
    // «TELEMETR» con mayúsculas encuentra «Telemetry Core».
    expect(searchSettings("TELEMETR", t)).toEqual([
      { section: "diagnostics", key: "settings.diag.core" },
    ]);
    // Consulta vacía: ningún resultado, la columna vuelve a las secciones.
    expect(searchSettings("   ", t)).toEqual([]);
  });
});

describe("SettingsOrbitPage", () => {
  it("permite probar una notificación de Windows y muestra el resultado real", () => {
    const handlers = new Map<string, Array<(event: { data: unknown }) => void>>();
    vi.mocked(Events.On).mockImplementation(((name: string, handler: (event: { data: unknown }) => void) => {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
      return () => handlers.delete(name);
    }) as typeof Events.On);

    mount("application");
    act(() => {
      for (const handler of handlers.get("notifications:status") ?? []) {
        handler({ data: { supported: true, authorized: true } });
      }
    });

    fireEvent.click(screen.getByTestId("orbit-settings-notification-test"));
    expect(Events.Emit).toHaveBeenCalledWith("notifications:test");
    expect(screen.getByText("Enviando prueba…")).toBeTruthy();

    act(() => {
      for (const handler of handlers.get("notifications:test:result") ?? []) {
        handler({ data: { ok: false, message: "toast rejected" } });
      }
    });
    expect(screen.getByRole("alert").textContent).toContain("toast rejected");

    act(() => {
      for (const handler of handlers.get("notifications:test:result") ?? []) {
        handler({ data: { ok: true } });
      }
    });
    expect(screen.getByRole("status").textContent).toContain("Windows aceptó el envío");
  });

  it("la columna lista exactamente las seis secciones y nada más", () => {
    mount("account");
    const rows = within(screen.getByTestId("orbit-settings-context")).getAllByRole("button");
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => row.textContent?.split("Sesión")[0])).toBeTruthy();
    expect(rows[0].getAttribute("aria-selected")).toBe("true");
  });

  it("navegar entre secciones cambia h2, lead y panel", () => {
    mount("account");
    const before = screen.getByTestId("orbit-settings-title").textContent;
    const leadBefore = screen.getByTestId("orbit-settings-lead").textContent;
    expect(screen.getByTestId("orbit-settings-panel-account")).toBeTruthy();

    const rows = within(screen.getByTestId("orbit-settings-context")).getAllByRole("button");
    fireEvent.click(rows[3]);

    expect(screen.getByTestId("orbit-settings-title").textContent).not.toBe(before);
    expect(screen.getByTestId("orbit-settings-lead").textContent).not.toBe(leadBefore);
    expect(screen.getByTestId("orbit-settings-panel-hotkeys")).toBeTruthy();
    expect(screen.queryByTestId("orbit-settings-panel-account")).toBeNull();
    // La sección visitada se recuerda para la próxima vez que se abra Ajustes.
    expect(resolveSettingsSection(null)).toBe("hotkeys");
  });

  it("la pantalla no usa el atributo `title` nativo", () => {
    const { container, slot } = mount("account");
    expect(container.querySelectorAll("[title]")).toHaveLength(0);
    expect(slot.querySelectorAll("[title]")).toHaveLength(0);
  });

  it("buscar un ajuste ofrece resultados que navegan a su sección", () => {
    mount("account");
    fireEvent.change(screen.getByTestId("orbit-settings-search"), {
      target: { value: "tema" },
    });

    const results = screen.getByTestId("orbit-settings-search-results");
    const rows = within(results).getAllByRole("button");
    expect(rows.length).toBeGreaterThan(0);

    // Elegir un resultado navega y devuelve la columna a las secciones.
    fireEvent.click(rows[0]);
    expect(screen.getByTestId("orbit-settings-panel-application")).toBeTruthy();
    expect(screen.queryByTestId("orbit-settings-search-results")).toBeNull();
  });

  it("una búsqueda sin resultados lo dice en vez de quedarse muda", () => {
    mount("account");
    fireEvent.change(screen.getByTestId("orbit-settings-search"), {
      target: { value: "zzzznada" },
    });

    expect(screen.queryByTestId("orbit-settings-search-results")).toBeNull();
    expect(screen.getByText("Ningún ajuste coincide con tu búsqueda.")).toBeTruthy();
  });

  it("cambiar la densidad la aplica al instante y la persiste", () => {
    mount("application");
    const row = screen.getByTestId("orbit-settings-density");
    // El `Select` del kit es un combobox propio: se abre y se elige la opción.
    fireEvent.click(within(row).getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Compacta" }));

    expect(document.body.dataset.density).toBe("compact");
    expect(window.localStorage.getItem("vantare.v03orbit.density")).toBe("compact");
  });

  it("el control de zoom cambia, persiste y restablece un único porcentaje", () => {
    mount("application");
    const value = screen.getByTestId("orbit-settings-zoom-value");
    expect(value.textContent).toBe("100%");

    fireEvent.click(screen.getByTestId("orbit-settings-zoom-plus"));
    expect(value.textContent).toBe("110%");
    expect(value.getAttribute("aria-label")).toContain("110%");
    expect(window.localStorage.getItem("vantare.v03orbit.appZoom")).toBe("1.1");

    fireEvent.click(value);
    expect(value.textContent).toBe("100%");
    expect(window.localStorage.getItem("vantare.v03orbit.appZoom")).toBe("1");
  });

  it("reducir animaciones marca el body y se guarda", () => {
    mount("application");
    const row = screen.getByTestId("orbit-settings-reduce-motion");
    fireEvent.click(within(row).getByRole("button"));

    expect(document.body.dataset.reduceMotion).toBe("true");
    expect(window.localStorage.getItem("vantare.v03orbit.reduceMotion")).toBe("1");
  });

  it("con licencia anónima los canales de testers y nightly llevan candado", () => {
    mount("updates");
    expect(screen.getByTestId("orbit-settings-channel-stable").getAttribute("aria-disabled")).toBeNull();
    for (const channel of ["testers", "nightly"]) {
      const card = screen.getByTestId(`orbit-settings-channel-${channel}`);
      expect(card.dataset.locked).toBe("true");
      // El candado se anuncia con `aria-disabled`, no con `disabled`: un botón
      // desactivado no recibe foco ni clic, así que el motivo no se podía leer.
      expect(card.getAttribute("aria-disabled")).toBe("true");
      expect(card.hasAttribute("disabled")).toBe(false);
      expect(screen.getByTestId(`orbit-settings-lock-${channel}`)).toBeTruthy();
    }
  });

  it("un canal bloqueado no se guarda y explica el motivo", () => {
    const emit = vi.spyOn(Events, "Emit");
    mount("updates");
    emit.mockClear();
    fireEvent.click(screen.getByTestId("orbit-settings-channel-nightly"));
    expect(emit.mock.calls.some(([name]) => name === "updater:settings:save")).toBe(false);
    expect(screen.getByTestId("orbit-settings-channel-denied").textContent).toContain("Nightly");
    expect(screen.getByTestId("orbit-settings-channel-stable").dataset.state).toBe("on");
  });

  it("seleccionar un canal permitido dispara el flujo real del actualizador", () => {
    const emit = vi.spyOn(Events, "Emit");
    mount("updates");
    emit.mockClear();
    fireEvent.click(screen.getByTestId("orbit-settings-channel-stable"));
    expect(emit.mock.calls.some(([name]) => name === "updater:settings:save")).toBe(true);
    // La shell se entera del canal por el mismo gesto, sin recargar (B4).
    expect(emit.mock.calls.some(([name]) => name === UPDATER_CHANNEL_EVENT)).toBe(true);
  });

  // Las tarjetas clasificaban por `prerelease` a secas, así que Testers y
  // Nightly enseñaban la MISMA release: con canal Stable activo la tarjeta de
  // Testers llegó a lucir una v0.1.0.7-nightly.9 (ISA-368).
  function mountUpdatesWith(info: unknown) {
    const handlers = new Map<string, (event: { data: unknown }) => void>();
    vi.spyOn(Events, "On").mockImplementation(((name: string, cb: unknown) => {
      handlers.set(name, cb as (event: { data: unknown }) => void);
      return () => handlers.delete(name);
    }) as never);
    vi.spyOn(Events, "Emit").mockImplementation(((name: string) => {
      if (name === "updater:check" || name === "updater:check:force")
        handlers.get("updater:available")?.({ data: { info } });
      if (name === "updater:settings:get") {
        handlers.get("updater:settings")?.({ data: { settings: { channel: "stable" } } });
      }
      return Promise.resolve(true);
    }) as never);
    mount("updates");
  }

  const nightly11 = {
    tag_name: "v0.1.0.7-nightly.11",
    name: "",
    body: "",
    prerelease: true,
    published_at: "2026-06-05T00:00:00Z",
    html_url: "",
    assets: [],
  };
  const testers1 = { ...nightly11, tag_name: "v0.1.0.7-testers.1", published_at: "2026-06-03T00:00:00Z" };
  const stable2 = {
    ...nightly11,
    tag_name: "v0.1.0.2",
    prerelease: false,
    published_at: "2026-06-02T00:00:00Z",
  };

  it("cada tarjeta de canal enseña la versión de SU canal, con el canal Stable activo", async () => {
    mountUpdatesWith({
      currentVersion: "v0.1.0.1",
      hasUpdate: true,
      isDowngrade: false,
      latestVersion: "v0.1.0.2",
      releases: [stable2],
      channels: { stable: stable2, testers: testers1, nightly: nightly11 },
    });

    await waitFor(() => {
      expect(screen.getByTestId("orbit-settings-channel-stable").textContent).toContain("v0.1.0.2");
    });
    const testers = screen.getByTestId("orbit-settings-channel-testers").textContent ?? "";
    const nightly = screen.getByTestId("orbit-settings-channel-nightly").textContent ?? "";
    expect(testers).toContain("v0.1.0.7-testers.1");
    expect(testers).not.toContain("nightly");
    expect(nightly).toContain("v0.1.0.7-nightly.11");
    expect(nightly).not.toContain("testers");
    // El hero sigue hablando del canal del usuario y de su última versión.
    expect(screen.getByTestId("orbit-settings-upd-hero").textContent).toContain("v0.1.0.2");
  });

  it("sin resumen del backend clasifica la lista y nunca cruza nightly con testers", async () => {
    mountUpdatesWith({
      currentVersion: "v0.1.0.1",
      hasUpdate: false,
      isDowngrade: false,
      releases: [nightly11, testers1, stable2],
    });

    await waitFor(() => {
      expect(screen.getByTestId("orbit-settings-channel-testers").textContent).toContain(
        "v0.1.0.7-testers.1",
      );
    });
    expect(screen.getByTestId("orbit-settings-channel-nightly").textContent).toContain(
      "v0.1.0.7-nightly.11",
    );
    expect(screen.getByTestId("orbit-settings-channel-stable").textContent).toContain("v0.1.0.2");
  });

  it("un canal sin release publicada lo dice en vez de tomar prestada otra", async () => {
    mountUpdatesWith({
      currentVersion: "v0.1.0.1",
      hasUpdate: false,
      isDowngrade: false,
      releases: [stable2],
      channels: { stable: stable2 },
    });

    await waitFor(() => {
      expect(screen.getByTestId("orbit-settings-channel-stable").textContent).toContain("v0.1.0.2");
    });
    for (const channel of ["testers", "nightly"]) {
      const text = screen.getByTestId(`orbit-settings-channel-${channel}`).textContent ?? "";
      expect(text).not.toContain("v0.1.0");
      expect(text).toContain("sin versión publicada");
    }
  });

  it("ida y vuelta del canal contra el bridge: se guarda, se relee y se refleja", async () => {
    // El bridge simulado hace el viaje entero de la app: `save` responde
    // `settings-saved`, eso dispara un `get` y el `get` devuelve lo guardado.
    const saved: unknown[] = [];
    const handlers = new Map<string, (event: { data: unknown }) => void>();
    vi.spyOn(Events, "On").mockImplementation(((name: string, cb: unknown) => {
      handlers.set(name, cb as (event: { data: unknown }) => void);
      return () => handlers.delete(name);
    }) as never);
    vi.spyOn(Events, "Emit").mockImplementation(((name: string, data: unknown) => {
      if (name === "updater:settings:save") {
        saved.push(data);
        handlers.get("updater:settings-saved")?.({ data: { ok: true } });
      }
      if (name === "updater:settings:get") {
        handlers
          .get("updater:settings")
          ?.({ data: { settings: saved[saved.length - 1] ?? { channel: "stable" } } });
      }
      return Promise.resolve(true);
    }) as never);

    // `?access=power-tester` es la licencia con nightly: el candado desaparece.
    window.history.replaceState({}, "", "/?access=power-tester");
    mount("updates");

    const card = screen.getByTestId("orbit-settings-channel-nightly");
    expect(card.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(card);

    await waitFor(() => {
      expect(screen.getByTestId("orbit-settings-channel-nightly").dataset.state).toBe("on");
    });
    expect(saved).toEqual([{ channel: "nightly" }]);
    expect(screen.getByTestId("orbit-settings-channel-stable").dataset.state).toBeUndefined();
    // El hero deja de decir «Stable» y pasa a decir el canal elegido.
    expect(screen.getByTestId("orbit-settings-upd-hero").textContent).toContain("Nightly");
  });

  it("grabar una combinación la muestra en keycaps", async () => {
    mount("hotkeys");
    const rows = screen.getAllByTestId("orbit-keycap-row");
    fireEvent.click(rows[0]);
    expect(rows[0].dataset.recording).toBe("true");

    fireEvent.keyDown(document, { key: "j", ctrlKey: true, shiftKey: true });

    await waitFor(() => {
      const keys = within(screen.getAllByTestId("orbit-keycap-row")[0])
        .getAllByText(/Ctrl|Shift|J/)
        .map((node) => node.textContent);
      expect(keys).toEqual(["Ctrl", "Shift", "J"]);
    });
  });

  it("grabar una combinación la guarda al instante, sin botón de guardar", async () => {
    const emit = vi.spyOn(Events, "Emit");
    mount("hotkeys");
    emit.mockClear();

    fireEvent.click(screen.getAllByTestId("orbit-keycap-row")[0]);
    fireEvent.keyDown(document, { key: "j", ctrlKey: true, shiftKey: true });

    await waitFor(() => {
      expect(emit.mock.calls.some(([name]) => name === "settings:save")).toBe(true);
    });
    // El guardado manual desapareció: la pantalla autoguarda como el resto
    // de secciones y no puede quedar un botón muerto.
    expect(screen.queryByTestId("orbit-settings-hk-save")).toBeNull();
  });

  it("un conflicto marca las dos filas y el contador lo dice", async () => {
    mount("hotkeys");
    expect(screen.getByTestId("orbit-settings-hk-status").textContent).toBe("Sin conflictos");

    // Se graba sobre «Alternar overlay» la combinación que ya tiene «Perfil
    // siguiente» (`ctrl+shift+right` por defecto): el conflicto lo produce el
    // bucle real de grabación, no un estado sembrado.
    fireEvent.click(screen.getAllByTestId("orbit-keycap-row")[0]);
    fireEvent.keyDown(document, { key: "ArrowRight", ctrlKey: true, shiftKey: true });

    await waitFor(() => {
      const marked = screen
        .getAllByTestId("orbit-keycap-row")
        .filter((row) => row.dataset.conflict === "true");
      expect(marked).toHaveLength(2);
    });
    expect(screen.getByTestId("orbit-settings-hk-status").textContent).toContain("2");
  });

  // ISA-379: «Registros» y «Últimos eventos» dejan de estar honestos-vacíos.
  // El backend publica ahora la ubicación del log y su anillo de eventos, así
  // que estas pruebas fijan las dos caras: con canal y sin él.
  describe("diagnóstico · registros y últimos eventos", () => {
    /** Bridge simulado del anillo del backend, como el de canales de arriba. */
    function mountDiagnosticsWith(options: {
      log?: { entries: unknown[]; path: string; available: boolean };
      locations?: unknown[];
    }) {
      const handlers = new Map<string, (event: { data: unknown }) => void>();
      const emitted: { name: string; data: unknown }[] = [];
      vi.spyOn(Events, "On").mockImplementation(((name: string, cb: unknown) => {
        handlers.set(name, cb as (event: { data: unknown }) => void);
        return () => handlers.delete(name);
      }) as never);
      vi.spyOn(Events, "Emit").mockImplementation(((name: string, data: unknown) => {
        emitted.push({ name, data });
        if (name === "applog:get" && options.log) {
          handlers.get("applog")?.({ data: options.log });
        }
        if (name === "storage:get" && options.locations) {
          handlers.get("storage")?.({
            data: { locations: options.locations, totalBytes: 0 },
          });
        }
        return Promise.resolve(true);
      }) as never);
      mount("diagnostics");
      return { handlers, emitted };
    }

    const entry = (seq: number, level: string, message: string) => ({
      seq,
      level,
      message,
      time: new Date(2026, 7, 20, 10, 0, seq).toISOString(),
    });

    it("sin canal de registros lo dice en vez de inventar filas", () => {
      mountDiagnosticsWith({});
      const log = screen.getByTestId("orbit-settings-log");
      expect(log.querySelectorAll("li")).toHaveLength(0);
      expect(log.textContent?.length).toBeGreaterThan(0);
      // Tampoco se ofrece copiar algo que no existe.
      expect(screen.queryByTestId("orbit-settings-log-copy")).toBeNull();
    });

    it("con el anillo del backend pinta una fila por evento y su nivel", async () => {
      mountDiagnosticsWith({
        log: {
          available: true,
          path: "C:\\logs\\vantare.log",
          entries: [
            entry(1, "info", "HTTP server: listening"),
            entry(2, "warn", "warning: hotkey ya registrado"),
            entry(3, "error", "storage error: disco lleno"),
          ],
        },
      });

      await waitFor(() => {
        expect(screen.getByTestId("orbit-settings-log").querySelectorAll("li")).toHaveLength(3);
      });
      const rows = [...screen.getByTestId("orbit-settings-log").querySelectorAll("li")];
      // Más reciente primero: es donde mira quien acaba de ver algo romperse.
      expect(rows.map((row) => row.dataset.level)).toEqual(["error", "warn", "info"]);
      expect(rows[0].textContent).toContain("disco lleno");
    });

    it("el filtro por nivel deja solo los eventos de ese nivel", async () => {
      mountDiagnosticsWith({
        log: {
          available: true,
          path: "C:\\logs\\vantare.log",
          entries: [
            entry(1, "info", "arranque"),
            entry(2, "error", "storage error: disco lleno"),
            entry(3, "info", "perfil cargado"),
          ],
        },
      });
      await waitFor(() => {
        expect(screen.getByTestId("orbit-settings-log").querySelectorAll("li")).toHaveLength(3);
      });

      fireEvent.click(screen.getByRole("button", { name: /^Error/ }));

      await waitFor(() => {
        const rows = [...screen.getByTestId("orbit-settings-log").querySelectorAll("li")];
        expect(rows).toHaveLength(1);
        expect(rows[0].textContent).toContain("disco lleno");
      });
    });

    it("un evento empujado se añade sin duplicar el que ya vino en el snapshot", async () => {
      const { handlers } = mountDiagnosticsWith({
        log: {
          available: true,
          path: "C:\\logs\\vantare.log",
          entries: [entry(1, "info", "arranque")],
        },
      });
      await waitFor(() => {
        expect(screen.getByTestId("orbit-settings-log").querySelectorAll("li")).toHaveLength(1);
      });

      // El mismo `seq` que ya está, y después uno nuevo.
      handlers.get("applog:entry")?.({ data: entry(1, "info", "arranque") });
      handlers.get("applog:entry")?.({ data: entry(2, "warn", "warning: algo raro") });

      await waitFor(() => {
        const rows = [...screen.getByTestId("orbit-settings-log").querySelectorAll("li")];
        expect(rows).toHaveLength(2);
        expect(rows[0].textContent).toContain("algo raro");
      });
    });

    it("ofrece abrir la carpeta de registros cuando el backend publica la ubicación", async () => {
      const { emitted } = mountDiagnosticsWith({
        locations: [
          { key: "configs", path: "C:\\configs", bytes: 0, files: 0, exists: true, clearable: false },
          { key: "logs", path: "C:\\logs", bytes: 10, files: 1, exists: true, clearable: false },
        ],
      });

      const row = await screen.findByTestId("orbit-settings-logs-folder");
      expect(row.textContent).toContain("C:\\logs");
      fireEvent.click(within(row).getByRole("button"));

      expect(emitted).toContainEqual({ name: "storage:reveal", data: { key: "logs" } });
    });

    it("sin ubicación de registros no pinta un botón que no abriría nada", async () => {
      mountDiagnosticsWith({
        locations: [
          { key: "configs", path: "C:\\configs", bytes: 0, files: 0, exists: true, clearable: false },
        ],
      });

      const row = await screen.findByTestId("orbit-settings-logs-folder");
      expect(within(row).queryByRole("button")).toBeNull();
      expect(row.textContent?.length).toBeGreaterThan(0);
    });
  });

  // El informe preparado tenía estado «listo» pero ninguna salida: la acción
  // de descarga existía y estaba probada, la pantalla Orbit no la ofrecía.
  it("un informe preparado se puede descargar como archivo JSON", async () => {
    const handlers = new Map<string, (event: { data: unknown }) => void>();
    vi.spyOn(Events, "On").mockImplementation(((name: string, cb: unknown) => {
      handlers.set(name, cb as (event: { data: unknown }) => void);
      return () => handlers.delete(name);
    }) as never);
    vi.spyOn(Events, "Emit").mockImplementation(((name: string, data: unknown) => {
      if (name === "diagnostics:prepare") {
        // Formato de cable: sin `report`, que el decoder reconstruye del payload.
        const { report: _report, ...wire } = fixturePrepared;
        void _report;
        handlers.get("diagnostics:prepared")?.({
          data: {
            requestId: (data as { requestId: string }).requestId,
            prepared: wire,
          },
        });
      }
      return Promise.resolve(true);
    }) as never);

    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    try {
      mount("diagnostics");
      // El informe se prepara con un gesto del usuario, no al abrir la sección.
      fireEvent.click(await screen.findByTestId("orbit-settings-prepare-report"));
      fireEvent.click(await screen.findByTestId("orbit-settings-report-download"));

      expect(click).toHaveBeenCalledTimes(1);
      const anchor = click.mock.instances[0] as HTMLAnchorElement;
      expect(anchor.download).toContain("vantare-diagnostics-");
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
