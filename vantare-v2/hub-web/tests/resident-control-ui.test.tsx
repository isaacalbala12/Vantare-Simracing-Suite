// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../fixtures/launcher-base.json";
import type { LauncherView } from "../src/contract/generated/contract";
import type { ResidentControlController } from "../src/renderer/screens/launcher/resident-control";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { LauncherProfiles } from "../src/renderer/ui/launcher/Profiles";
import { ResidentControlNotice } from "../src/renderer/ui/launcher/ResidentControlNotice";

afterEach(cleanup);
const activeTarget = {
  instance: "b".repeat(64),
  accountGeneration: "a".repeat(64),
  run: "1",
  revision: "c".repeat(64),
};
function controller(): ResidentControlController {
  return {
    results: { kind: "unsupported" },
    retry: vi.fn(),
    attempt: undefined,
    scope: { instance: "b".repeat(64), accountGeneration: "a".repeat(64) },
    capable: true,
    hasProfiles: true,
    cancelTarget: undefined,
    busy: false,
    reason: () => undefined,
    cancel: vi.fn(),
    rehearse: vi.fn(),
  };
}
function mount(
  control: ResidentControlController,
  view = structuredClone(fixture) as LauncherView,
) {
  return render(
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <LauncherProfiles
          view={view}
          control={control}
          pending={false}
          accepted={false}
          onAction={vi.fn()}
          onSelect={vi.fn()}
          onLaunch={vi.fn()}
          onReload={vi.fn()}
        />
      </TooltipProvider>
    </CSPProvider>,
  );
}
it("the visible rehearsal button submits its rendered profile and revision only", () => {
  const control = controller(),
    view = structuredClone(fixture) as LauncherView;
  view.revision = "c".repeat(64);
  mount(control, view);
  fireEvent.click(screen.getByRole("button", { name: "Probar sin el juego" }));
  expect(control.rehearse).toHaveBeenCalledExactlyOnceWith({
    ...control.scope,
    profile: view.profiles[0].id,
    revision: view.revision,
  });
});
it("cancel uses the active execution revision, not the current document revision", () => {
  const control = controller(),
    view = structuredClone(fixture) as LauncherView;
  control.cancelTarget = activeTarget;
  view.running = true;
  view.revision = "e".repeat(64);
  mount(control, view);
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(control.cancel).toHaveBeenCalledExactlyOnceWith(control.cancelTarget);
});
it("disabled capability has a keyboard-readable reason and never sends", () => {
  const control = controller();
  control.capable = false;
  control.reason = () => "unsupported";
  mount(control);
  const button = screen.getByRole("button", { name: "Probar sin el juego" });
  expect(button.getAttribute("aria-disabled")).toBe("true");
  expect(
    document.getElementById(button.getAttribute("aria-describedby") ?? "")
      ?.textContent,
  ).toBe(
    "El residente actual no admite cancelar ni probar perfiles de forma comprobada.",
  );
  fireEvent.click(button);
  expect(control.rehearse).not.toHaveBeenCalled();
});
it("exposes cancellation when the document has no visible profile", () => {
  const control = controller();
  control.cancelTarget = activeTarget;
  render(<ResidentControlNotice control={control} showCancel />);
  fireEvent.click(
    screen.getByRole("button", { name: "Cancelar secuencia actual" }),
  );
  expect(control.cancel).toHaveBeenCalledExactlyOnceWith(control.cancelTarget);
});
it.each(["accepted", "rejected", "unknown", "finished"] as const)(
  "announces control result %s honestly",
  (kind) => {
    const control = controller();
    control.attempt = {
      kind: "cancel",
      target: activeTarget,
      cursor: 1n,
      phase:
        kind === "accepted"
          ? { kind, request: "d".repeat(32), run: "1" }
          : kind === "rejected"
            ? { kind, reason: "no-steps" }
            : kind === "finished"
              ? { kind, outcome: { kind: "failed", reason: "cleanup-failed" } }
              : { kind },
    };
    render(<ResidentControlNotice control={control} />);
    const status = screen.getByRole("status").textContent;
    if (kind === "accepted")
      expect(status).toBe(
        "Cancelación: Orden aceptada. La secuencia sigue en curso.",
      );
    if (kind === "rejected")
      expect(status).toBe(
        "Cancelación: Orden rechazada. No se ha aplicado. Este perfil no tiene pasos que probar sin Le Mans Ultimate.",
      );
    if (kind === "unknown") expect(status).toContain("Resultado desconocido");
    if (kind === "finished")
      expect(status).toBe(
        "Cancelación: La secuencia ha terminado con un fallo al cerrar aplicaciones.",
      );
  },
);
