import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { StartupSettings } from "./StartupSettings";

type Handler = (event: { data: unknown }) => void;

const runtimeMock = vi.hoisted(() => ({
  handlers: new Map<string, Handler[]>(),
  emit: vi.fn(),
}));

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: (name: string, handler: Handler) => {
      runtimeMock.handlers.set(name, [...(runtimeMock.handlers.get(name) ?? []), handler]);
      return () => runtimeMock.handlers.delete(name);
    },
    Emit: runtimeMock.emit,
  },
}));

function dispatch(name: string, data: unknown) {
  act(() => {
    for (const handler of runtimeMock.handlers.get(name) ?? []) {
      handler({ data });
    }
  });
}

function Harness() {
  return (
    <I18nProvider>
      <StartupSettings />
    </I18nProvider>
  );
}

describe("StartupSettings", () => {
  beforeEach(() => {
    runtimeMock.handlers.clear();
    runtimeMock.emit.mockClear();
  });

  afterEach(cleanup);

  it("asks the backend what the registry says on mount", () => {
    render(<Harness />);
    expect(runtimeMock.emit).toHaveBeenCalledWith("startup:get");
  });

  it("says so instead of offering a control the platform cannot honour", () => {
    render(<Harness />);
    dispatch("startup", { enabled: false, minimised: false, supported: false });

    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.getByText("Esta plataforma no permite abrir Vantare al iniciar sesión."),
    ).toBeDefined();
  });

  // The toggle must not move on its own. The registry is the truth, and a write
  // that fails has to leave the switch showing what is really set.
  it("does not flip the toggle until the backend confirms", () => {
    render(<Harness />);
    dispatch("startup", { enabled: false, minimised: false, supported: true });

    const enable = screen.getByRole("checkbox", {
      name: "Abrir Vantare al iniciar sesión en Windows",
    }) as HTMLInputElement;
    fireEvent.click(enable);

    expect(runtimeMock.emit).toHaveBeenCalledWith("startup:set", {
      enabled: true,
      minimised: false,
    });
    expect(enable.checked).toBe(false);

    dispatch("startup", { enabled: true, minimised: false, supported: true });
    expect(
      (screen.getByRole("checkbox", {
        name: "Abrir Vantare al iniciar sesión en Windows",
      }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  // Start-minimised travels in the registered command line, so with autostart
  // off there is no command line for it to travel in.
  it("disables start-minimised while autostart is off", () => {
    render(<Harness />);
    dispatch("startup", { enabled: false, minimised: false, supported: true });
    expect(
      (screen.getByRole("checkbox", { name: "Empezar minimizado" }) as HTMLInputElement).disabled,
    ).toBe(true);

    dispatch("startup", { enabled: true, minimised: false, supported: true });
    expect(
      (screen.getByRole("checkbox", { name: "Empezar minimizado" }) as HTMLInputElement).disabled,
    ).toBe(false);
  });

  it("surfaces a failed write", () => {
    render(<Harness />);
    dispatch("startup", { enabled: false, minimised: false, supported: true });
    dispatch("startup:error", { message: "acceso denegado" });

    expect(screen.getByRole("alert").textContent).toContain("acceso denegado");
  });
});
