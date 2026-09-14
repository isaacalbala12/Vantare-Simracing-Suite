import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { LaunchProfile, LauncherAppEntry } from "../launcher/launcher-state";
import { OrbitProfileEditor } from "./OrbitProfileEditor";
import { getHubSuspendBlockerReasons } from "../hub-suspend-guard";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function app(id: string, displayName: string): LauncherAppEntry {
  return {
    id,
    displayName,
    abbreviation: id.slice(0, 3).toUpperCase(),
    category: "utility",
    launchMethod: "executable",
    detected: true,
    gradientFrom: "#111111",
    gradientTo: "#222222",
  };
}

const APPS = [app("lmu", "Le Mans Ultimate"), app("obs", "OBS Studio")];

const PROFILE: LaunchProfile = {
  id: "creator",
  name: "Creador de Contenido",
  description: "Simulador y captura.",
  steps: [{ appId: "lmu", delay: 0 }],
};

function setup(profile: LaunchProfile = PROFILE) {
  const onClose = vi.fn();
  const onSave = vi.fn();
  render(
    <I18nProvider>
      <OrbitProfileEditor
        apps={APPS}
        onClose={onClose}
        onSave={onSave}
        open
        profile={profile}
      />
    </I18nProvider>,
  );
  return { onClose, onSave };
}

describe("OrbitProfileEditor", () => {
  it("abre como cajón del kit con el perfil cargado", () => {
    setup();
    expect(screen.getByTestId("orbit-profile-editor")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByTestId("orbit-profile-editor-name") as HTMLInputElement).value).toBe(
      "Creador de Contenido",
    );
    expect(screen.getByTestId("orbit-editor-step-0")).toBeTruthy();
  });

  it("cierra con Cancelar y con Esc", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByTestId("orbit-profile-editor-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("guarda el borrador editado por el mismo handler que el editor legado", () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByTestId("orbit-profile-editor-name"), {
      target: { value: "Retransmisión" },
    });
    fireEvent.change(screen.getByTestId("orbit-editor-step-delay-0"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByTestId("orbit-profile-editor-save"));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      id: "creator",
      name: "Retransmisión",
      steps: [{ appId: "lmu", delay: 4 }],
    });
  });

  it("bloquea la suspensión mientras conserva un borrador local sin guardar", async () => {
    setup();
    expect(getHubSuspendBlockerReasons()).toEqual([]);
    fireEvent.change(screen.getByTestId("orbit-profile-editor-name"), {
      target: { value: "Borrador local" },
    });
    await vi.waitFor(() => expect(getHubSuspendBlockerReasons()).toEqual([
      "El editor de perfiles del Launcher tiene un borrador sin guardar",
    ]));
  });

  it("bloquea Guardar mientras un paso no tiene aplicación", () => {
    setup();
    fireEvent.click(screen.getByTestId("orbit-editor-step-add"));
    const save = screen.getByTestId("orbit-profile-editor-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.click(screen.getByTestId("orbit-editor-step-remove-1"));
    expect((screen.getByTestId("orbit-profile-editor-save") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("avisa de aplicaciones repetidas fuera del modo avanzado y las permite dentro", () => {
    setup({ ...PROFILE, steps: [{ appId: "lmu", delay: 0 }, { appId: "lmu", delay: 2 }] });
    expect(screen.getByTestId("orbit-profile-editor-duplicate-warning")).toBeTruthy();
    expect((screen.getByTestId("orbit-profile-editor-save") as HTMLButtonElement).disabled).toBe(
      true,
    );

    fireEvent.click(screen.getByTestId("orbit-profile-editor-advanced-toggle"));
    expect(screen.queryByTestId("orbit-profile-editor-duplicate-warning")).toBeNull();
    expect((screen.getByTestId("orbit-profile-editor-save") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("reordena los pasos con las flechas", () => {
    setup({ ...PROFILE, steps: [{ appId: "lmu", delay: 0 }, { appId: "obs", delay: 2 }] });
    fireEvent.click(screen.getByTestId("orbit-editor-step-down-0"));
    fireEvent.click(screen.getByTestId("orbit-profile-editor-save"));
    // El `Select` del kit es un combobox propio: el valor se lee del rótulo del trigger.
    const values = screen
      .getAllByRole("combobox")
      .map((node) => node.querySelector(".orbit-select__value")?.textContent ?? "");
    expect(values[0]).toBe("OBS Studio");
    expect(values[1]).toBe("Le Mans Ultimate");
  });

  it("graba la combinación real del atajo global", () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByTestId("orbit-keycap-row"));
    fireEvent.keyDown(window, { key: "l", ctrlKey: true, altKey: true });
    fireEvent.click(screen.getByTestId("orbit-profile-editor-save"));
    expect(onSave.mock.calls[0][0].hotkey).toBe("ctrl+alt+l");
  });

  it("no deja iniciar con Windows un perfil sin pasos", () => {
    setup({ ...PROFILE, steps: [] });
    const toggle = screen.getByRole("button", {
      name: "Iniciar con Windows",
    }) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
  });
});
