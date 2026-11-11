// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResidentView } from "../src/contract/generated/contract";
import { residentActionLabels } from "../src/contract/generated/launcher_resident";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { ResidentInbox } from "../src/renderer/ui/launcher/ResidentInbox";
import { WindowButtons } from "../src/renderer/ui/WindowButtons";

const view: ResidentView = {
  protected: false,
  online: true,
  running: true,
  error: false,
  decision: {
    id: "18446744073709551615",
    kind: "authorization",
    actions: [
      { id: "trust", label: residentActionLabels.trust },
      { id: "cancel", label: residentActionLabels.cancel },
    ],
  },
  registrations: [],
};
afterEach(cleanup);
function mount(value: ResidentView) {
  return render(
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <ResidentInbox view={value} />
      </TooltipProvider>
    </CSPProvider>,
  );
}
describe("resident decisions are read-only", () => {
  it("keeps window controls reachable while the automatic drawer is open", async () => {
    const minimize = vi.fn(),
      maximize = vi.fn(),
      close = vi.fn();
    render(
      <CSPProvider disableStyleElements>
        <TooltipProvider>
          <WindowButtons
            maximized={false}
            disabled={false}
            labels={{
              minimize: "Minimizar",
              maximize: "Maximizar",
              restore: "Restaurar",
              close: "Cerrar ventana",
            }}
            minimize={minimize}
            maximize={maximize}
            close={close}
          />
          <ResidentInbox view={view} />
        </TooltipProvider>
      </CSPProvider>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).not.toBe("true");
    const action = screen.getByRole("button", {
      name: residentActionLabels.trust,
    });
    const note = document.getElementById(
      action.getAttribute("aria-describedby") ?? "",
    );
    expect(note?.textContent).toBe(
      "Responder desde el Hub estará disponible próximamente.",
    );
    for (const [label, handler] of [
      ["Minimizar", minimize],
      ["Maximizar", maximize],
      ["Cerrar ventana", close],
    ] as const) {
      const button = screen.getByRole("button", { name: label });
      expect(button.closest('[inert], [aria-hidden="true"]')).toBeNull();
      button.focus();
      expect(document.activeElement).toBe(button);
      fireEvent.click(button);
      expect(handler).toHaveBeenCalledOnce();
    }
  });
  it("shows the native actions disabled and Escape only closes the local drawer", async () => {
    const mounted = mount(view);
    expect(
      screen.getByRole("dialog", { name: "Decisión de lanzamiento" }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: residentActionLabels.trust,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: residentActionLabels.cancel,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    mounted.rerender(
      <CSPProvider disableStyleElements>
        <TooltipProvider>
          <ResidentInbox view={structuredClone(view)} />
        </TooltipProvider>
      </CSPProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver decisión" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("removes stale decisions and displays only a closed error state", () => {
    const mounted = mount({ ...view, error: true, decision: null });
    expect(
      screen.getByText("El residente ha informado de un error."),
    ).toBeTruthy();
    mounted.rerender(
      <CSPProvider disableStyleElements>
        <TooltipProvider>
          <ResidentInbox
            view={{
              ...view,
              online: false,
              running: false,
              error: false,
              decision: null,
            }}
          />
        </TooltipProvider>
      </CSPProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.queryByText("El residente ha informado de un error."),
    ).toBeNull();
  });
});
