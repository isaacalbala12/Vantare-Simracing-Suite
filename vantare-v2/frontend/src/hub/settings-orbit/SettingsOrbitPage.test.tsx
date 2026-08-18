import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { I18nProvider } from "../../i18n/I18nProvider";
import { LicenseProvider } from "../../lib/license";
import { SETTINGS_CONTEXT_SLOT_ID, SettingsOrbitPage } from "./SettingsOrbitPage";
import { conflictingHotkeys, keycapsOf, maskEmail, resolveSettingsSection } from "./settings-orbit-model";

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
});

describe("SettingsOrbitPage", () => {
  it("la columna lista exactamente las cinco secciones y nada más", () => {
    mount("account");
    const rows = within(screen.getByTestId("orbit-settings-context")).getAllByRole("button");
    expect(rows).toHaveLength(5);
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

  it("cambiar la densidad la aplica al instante y la persiste", () => {
    mount("application");
    const row = screen.getByTestId("orbit-settings-density");
    // El `Select` del kit es un combobox propio: se abre y se elige la opción.
    fireEvent.click(within(row).getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Compacta" }));

    expect(document.body.dataset.density).toBe("compact");
    expect(window.localStorage.getItem("vantare.v03orbit.density")).toBe("compact");
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
    expect(screen.getByTestId("orbit-settings-channel-stable").hasAttribute("disabled")).toBe(false);
    for (const channel of ["testers", "nightly"]) {
      const card = screen.getByTestId(`orbit-settings-channel-${channel}`);
      expect(card.dataset.locked).toBe("true");
      expect(card.hasAttribute("disabled")).toBe(true);
      expect(screen.getByTestId(`orbit-settings-lock-${channel}`)).toBeTruthy();
    }
  });

  it("seleccionar un canal permitido dispara el flujo real del actualizador", () => {
    const emit = vi.spyOn(Events, "Emit");
    mount("updates");
    emit.mockClear();
    fireEvent.click(screen.getByTestId("orbit-settings-channel-stable"));
    expect(emit.mock.calls.some(([name]) => name === "updater:settings:save")).toBe(true);
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

  it("el diagnóstico no inventa registros cuando no hay búfer", () => {
    mount("diagnostics");
    const log = screen.getByTestId("orbit-settings-log");
    expect(log.querySelectorAll("li")).toHaveLength(0);
    expect(log.textContent?.length).toBeGreaterThan(0);
  });
});
