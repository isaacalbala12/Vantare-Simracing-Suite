import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { ToastProvider } from "../../ui/orbit/Toast";
import type { EngineerNotification, EngineerStatus } from "../../engineer/engineer-types";
import { EngineerOrbitPage } from "./EngineerOrbitPage";
import type { EngineerBridge, VoiceRuntime } from "./engineer-orbit-bridge";

vi.mock("@wailsio/runtime", () => ({
  Events: { Emit: vi.fn(), On: () => () => undefined },
}));

function message(
  id: string,
  role: "spotter" | "engineer",
  createdAt: number,
  text: string,
): EngineerNotification {
  return {
    version: 1,
    id,
    category: role === "spotter" ? "spotter" : "fuel",
    severity: "info",
    textKey: `${role}.key`,
    text,
    voiceText: text,
    locale: "es",
    role,
    channel: role,
    priority: 10,
    createdAt,
    expiresAt: createdAt + 10_000,
    source: "telemetry-core",
  };
}

const STATUS: EngineerStatus = {
  enabled: true,
  connected: true,
  source: "telemetry-core",
  presentationLifecycle: 1,
  spotterEnabled: true,
  spotterAvailability: { state: "ready" },
  sensitivity: "normal",
  ttsCacheCount: 0,
  recentMessages: [
    message("m1", "spotter", 1_000, "Coche a la izquierda"),
    message("m2", "engineer", 2_000, "Ventana de boxes abierta"),
  ],
  outputModes: { spotter: "both", fuel: "audio" },
  subtitlesEnabled: false,
};

/** Doble del puente: guarda lo escrito y republica el estado, como el servicio. */
function fakeBridge(initial: EngineerStatus = STATUS) {
  let status = { ...initial };
  let push: ((next: EngineerStatus) => void) | null = null;
  const calls: { event: string; value: unknown }[] = [];
  const republish = (patch: Partial<EngineerStatus>) => {
    status = { ...status, ...patch };
    push?.(status);
  };
  const bridge: EngineerBridge = {
    subscribe(onStatus) {
      push = onStatus;
      onStatus(status);
      return () => {
        push = null;
      };
    },
    setEnabled: (value) => {
      calls.push({ event: "enabled", value });
      republish({ enabled: value });
    },
    setSpotterEnabled: (value) => {
      calls.push({ event: "spotter", value });
      republish({ spotterEnabled: value });
    },
    setSubtitlesEnabled: (value) => {
      calls.push({ event: "subtitles", value });
      republish({ subtitlesEnabled: value });
    },
    setSensitivity: (value) => {
      calls.push({ event: "sensitivity", value });
      republish({ sensitivity: value });
    },
    setOutputMode: (category, mode) => {
      calls.push({ event: "output", value: { category, mode } });
      republish({ outputModes: { ...status.outputModes, [category]: mode } });
    },
  };
  return { bridge, calls, get status() { return status; } };
}

const silentVoices: VoiceRuntime = {
  list: () => [{ id: "v1", label: "Elvira · es-ES" }],
  onChange: () => () => undefined,
  speak: () => true,
};

function mount(bridge: EngineerBridge, voices: VoiceRuntime = silentVoices) {
  return render(
    <I18nProvider>
      <ToastProvider>
        <EngineerOrbitPage bridge={bridge} voices={voices} />
      </ToastProvider>
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("EngineerOrbitPage", () => {
  it("atenúa el icono de los módulos apagados y deja Estrategia en vivo sin tocar", () => {
    mount(fakeBridge().bridge);
    expect(screen.getByTestId("orbit-eng-mod-engineer").dataset.on).toBe("true");
    expect(screen.getByTestId("orbit-eng-mod-subtitles").dataset.on).toBe("false");
    expect(screen.getByTestId("orbit-eng-mod-liveStrategy").dataset.on).toBe("false");
    const soon = within(screen.getByTestId("orbit-eng-mod-liveStrategy")).getByRole("button");
    expect(soon.hasAttribute("disabled")).toBe(true);
  });

  it("las salidas por categoría reflejan y persisten el estado real", async () => {
    const fake = fakeBridge();
    mount(fake.bridge);

    const fuel = within(screen.getByTestId("orbit-engineer-output-fuel"));
    expect(fuel.getByRole("button", { name: "A" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(fuel.getByRole("button", { name: "Off" }));
    await waitFor(() => {
      expect(fuel.getByRole("button", { name: "Off" }).getAttribute("aria-pressed")).toBe("true");
    });
    expect(fake.calls).toContainEqual({
      event: "output",
      value: { category: "fuel", mode: "disabled" },
    });
    expect(fake.status.outputModes.fuel).toBe("disabled");
  });

  it("los módulos escriben en la configuración real", () => {
    const fake = fakeBridge();
    mount(fake.bridge);
    fireEvent.click(
      within(screen.getByTestId("orbit-eng-mod-subtitles")).getByRole("button", {
        name: "Subtítulos",
      }),
    );
    expect(fake.calls).toContainEqual({ event: "subtitles", value: true });
  });

  it("filtra el feed por origen", () => {
    mount(fakeBridge().bridge);
    const feed = screen.getByTestId("orbit-engineer-feed");
    expect(within(feed).getAllByRole("listitem")).toHaveLength(2);
    // El más reciente arriba.
    expect(within(feed).getAllByRole("listitem")[0].textContent).toContain(
      "Ventana de boxes abierta",
    );

    const filter = within(screen.getByRole("group", { name: "Filtro por origen" }));
    fireEvent.click(filter.getByRole("button", { name: "Spotter" }));
    expect(within(screen.getByTestId("orbit-engineer-feed")).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByTestId("orbit-engineer-feed").textContent).toContain("Coche a la izquierda");
  });

  it("dice la verdad cuando no hay mensajes de sesión", () => {
    const fake = fakeBridge({ ...STATUS, connected: false, recentMessages: [] });
    mount(fake.bridge);
    expect(screen.getByTestId("orbit-engineer-feed-empty").textContent).toContain(
      "Sin mensajes de sesión",
    );
  });

  it("avisa si el Spotter no está disponible aunque la telemetría esté conectada", () => {
    const fake = fakeBridge({
      ...STATUS,
      connected: true,
      spotterAvailability: { state: "unavailable", reason: "capability" },
    });
    mount(fake.bridge);

    const notice = screen.getByTestId("orbit-engineer-spotter-unavailable");
    expect(notice.textContent).toContain("Spotter no disponible");
    expect(notice.textContent).toContain("telemetría espacial");

    fireEvent.click(
      within(screen.getByTestId("orbit-eng-mod-spotter")).getByRole("button", { name: "Spotter" }),
    );
    expect(screen.queryByTestId("orbit-engineer-spotter-unavailable")).toBeNull();
  });

  it("no usa el atributo `title` nativo", () => {
    mount(fakeBridge().bridge);
    expect(screen.getByTestId("orbit-engineer").querySelectorAll("[title]")).toHaveLength(0);
  });

  it("«Probar voz» reproduce con la voz y el volumen elegidos", () => {
    const speak = vi.fn(() => true);
    mount(fakeBridge().bridge, { ...silentVoices, speak });
    fireEvent.change(screen.getByTestId("orbit-engineer-volume"), { target: { value: "40" } });
    fireEvent.click(screen.getByTestId("orbit-engineer-test-voice"));
    expect(speak).toHaveBeenCalledWith(expect.any(String), { voiceId: "v1", volume: 0.4 });
  });
});

describe("EngineerOrbitPage · cableado auditado", () => {
  it("«Atenuar el juego» va deshabilitado con el motivo a la vista", () => {
    mount(fakeBridge().bridge);
    const duck = screen.getByRole("button", { name: "Atenuar el juego al hablar" }) as HTMLButtonElement;
    expect(duck.disabled).toBe(true);
    expect(duck.getAttribute("data-tip")).toBeTruthy();
    expect(duck.getAttribute("title")).toBeNull();
  });
});
