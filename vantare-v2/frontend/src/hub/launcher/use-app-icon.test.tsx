import { Events } from "@wailsio/runtime";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAppIconCache, useAppIcon, type IconApp } from "./use-app-icon";

/** Sonda mínima: pinta el candidato vigente y deja fallarlo desde la prueba. */
function Probe({ app }: { app: IconApp }) {
  const { src, onError } = useAppIcon(app);
  return (
    <button data-testid="probe" onClick={onError} type="button">
      {src ?? "monogram"}
    </button>
  );
}

type IconListener = (event: { data?: { id?: string; iconUrl?: string } }) => void;

let listeners: IconListener[] = [];

beforeEach(() => {
  resetAppIconCache();
  listeners = [];
  vi.mocked(Events.On).mockImplementation(((name: string, handler: IconListener) => {
    if (name === "launcher:app:icon:result") listeners.push(handler);
    return () => {
      listeners = listeners.filter((entry) => entry !== handler);
    };
  }) as never);
  vi.mocked(Events.Emit).mockClear();
});

afterEach(() => {
  cleanup();
  vi.mocked(Events.On).mockReset();
  vi.mocked(Events.On).mockImplementation((() => () => {}) as never);
});

function fail() {
  act(() => {
    screen.getByTestId("probe").click();
  });
}

function emitResult(id: string, iconUrl: string) {
  act(() => {
    for (const listener of [...listeners]) listener({ data: { id, iconUrl } });
  });
}

describe("useAppIcon", () => {
  it("walks the whole candidate chain before falling back to initials", () => {
    render(
      <Probe
        app={{
          id: "crewchief",
          iconOverridePath: "override.png",
          iconUrl: "contract.png",
          executablePath: "C:/CrewChief/cc.exe",
        }}
      />,
    );

    expect(screen.getByTestId("probe").textContent).toBe("override.png");
    fail();
    expect(screen.getByTestId("probe").textContent).toBe("contract.png");

    // Solo al agotarse los candidatos locales se pide la extracción del .exe.
    expect(Events.Emit).not.toHaveBeenCalled();
    fail();
    expect(Events.Emit).toHaveBeenCalledWith("launcher:app:icon", {
      id: "crewchief",
      executablePath: "C:/CrewChief/cc.exe",
    });
    expect(screen.getByTestId("probe").textContent).toBe("monogram");
  });

  it("paints a late extracted icon without remounting", () => {
    render(<Probe app={{ id: "crewchief", executablePath: "C:/CrewChief/cc.exe" }} />);

    expect(screen.getByTestId("probe").textContent).toBe("monogram");
    emitResult("crewchief", "extracted.png");
    expect(screen.getByTestId("probe").textContent).toBe("extracted.png");

    // Otra aplicación no puede robarle la losa.
    emitResult("obs", "otro.png");
    expect(screen.getByTestId("probe").textContent).toBe("extracted.png");
  });

  it("uses the path corrected by the user to extract the icon", () => {
    render(
      <Probe
        app={{
          id: "crewchief",
          executablePath: "C:/mal/cc.exe",
          userExecutablePath: "D:/bien/cc.exe",
        }}
      />,
    );

    expect(Events.Emit).toHaveBeenCalledWith("launcher:app:icon", {
      id: "crewchief",
      executablePath: "D:/bien/cc.exe",
    });
  });

  it("drops a broken extracted icon and keeps the monogram", () => {
    render(<Probe app={{ id: "crewchief", executablePath: "C:/CrewChief/cc.exe" }} />);
    emitResult("crewchief", "roto.png");
    expect(screen.getByTestId("probe").textContent).toBe("roto.png");

    fail();
    expect(screen.getByTestId("probe").textContent).toBe("monogram");
  });
});
