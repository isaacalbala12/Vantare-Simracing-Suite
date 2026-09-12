import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { I18nProvider } from "../../../i18n/I18nProvider";
import { StudioObsLink } from "./StudioObsLink";
import {
  buildObsOverlayUrl,
  OBS_URL_EVENT,
  OBS_URL_REQUEST_EVENT,
  useObsBaseUrl,
} from "./obs-url";

afterEach(() => {
  cleanup();
  vi.mocked(Events.On).mockClear();
  vi.mocked(Events.Emit).mockClear();
  Reflect.deleteProperty(navigator, "clipboard");
});

function renderLink(profileFile?: string) {
  return render(
    <I18nProvider>
      <StudioObsLink profileFile={profileFile} />
    </I18nProvider>,
  );
}

function obsUrlHandler(): (event: { data?: { baseUrl?: unknown } }) => void {
  const call = vi
    .mocked(Events.On)
    .mock.calls.find(([name]) => name === OBS_URL_EVENT);
  if (!call) throw new Error("obs:url handler not registered");
  return call[1] as (event: { data?: { baseUrl?: unknown } }) => void;
}

describe("StudioObsLink", () => {
  it("muestra la URL local del perfil abierto", () => {
    renderLink("mi-perfil.json");

    const input = screen.getByTestId("orbit-studio-obs-url") as HTMLInputElement;
    expect(input.value).toBe(
      "http://127.0.0.1:39261/overlay?profile=mi-perfil.json",
    );
  });

  it("cae al perfil por defecto cuando no hay fichero", () => {
    renderLink();
    const input = screen.getByTestId("orbit-studio-obs-url") as HTMLInputElement;
    expect(input.value).toContain("profile=example-streaming.json");
  });

  it("acepta un origen distinto cuando el servidor escucha en otro puerto", () => {
    render(
      <I18nProvider>
        <StudioObsLink baseUrl="http://127.0.0.1:40000" profileFile="mi-perfil.json" />
      </I18nProvider>,
    );
    const input = screen.getByTestId("orbit-studio-obs-url") as HTMLInputElement;
    expect(input.value).toBe("http://127.0.0.1:40000/overlay?profile=mi-perfil.json");
  });

  it("copia la URL al portapapeles y refleja el estado", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderLink("mi-perfil.json");

    fireEvent.click(screen.getByTestId("orbit-studio-obs-copy"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "http://127.0.0.1:39261/overlay?profile=mi-perfil.json",
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId("orbit-studio-obs-copy").textContent).not.toContain("Copiar URL");
    });
  });
});

describe("useObsBaseUrl", () => {
  it("pide la dirección al backend y aplica la recibida por obs:url", () => {
    const { result } = renderHook(() => useObsBaseUrl());

    expect(vi.mocked(Events.Emit)).toHaveBeenCalledWith(OBS_URL_REQUEST_EVENT);
    expect(result.current).toBe("http://127.0.0.1:39261");

    act(() => obsUrlHandler()({ data: { baseUrl: "http://127.0.0.1:40000/" } }));

    expect(result.current).toBe("http://127.0.0.1:40000");
  });

  it("ignora payloads sin baseUrl", () => {
    const { result } = renderHook(() => useObsBaseUrl());

    act(() => obsUrlHandler()({ data: {} }));
    act(() => obsUrlHandler()({ data: { baseUrl: 42 } }));

    expect(result.current).toBe("http://127.0.0.1:39261");
  });
});

describe("buildObsOverlayUrl", () => {
  it("normaliza la barra final del origen", () => {
    expect(buildObsOverlayUrl("http://127.0.0.1:39261/", "a.json")).toBe(
      "http://127.0.0.1:39261/overlay?profile=a.json",
    );
  });
});
