// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Dialog } from "../src/renderer/ui/Layers";
import { NotificationPopover } from "../src/renderer/ui/NotificationPopover";
import { WindowDialogProvider } from "../src/renderer/ui/WindowDialog";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function Harness({ action = () => {} }: { action?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <CSPProvider disableStyleElements>
      <WindowDialogProvider>
        <header className="v-titlebar">
          <div className="v-titlebar-actions">
            <NotificationPopover
              label="Notificaciones"
              open={open}
              onOpenChange={setOpen}
            >
              <button type="button">Primera acción</button>
              <Dialog
                title="Confirmación"
                description="Ejemplo anidado"
                trigger="Confirmar"
                closeLabel="Cancelar"
              >
                <button type="button">Guardar</button>
              </Dialog>
            </NotificationPopover>
          </div>
          <div className="v-window-controls">
            <button type="button">Minimizar</button>
            <button type="button">Maximizar</button>
            <button type="button">Cerrar ventana</button>
          </div>
        </header>
        <nav className="v-sidebar">
          <button type="button" onClick={action}>
            Destino
          </button>
        </nav>
        <main className="v-shell-main">
          <button type="button" onClick={action}>
            Lanzar
          </button>
        </main>
      </WindowDialogProvider>
    </CSPProvider>
  );
}
async function open() {
  const user = userEvent.setup();
  const bell = screen.getByRole("button", { name: "Notificaciones" });
  await user.click(bell);
  const popup = await screen.findByRole("dialog", { name: "Notificaciones" });
  return { user, bell, popup };
}
it("cycles focus through the popup and caption, closes with Escape and restores the bell", async () => {
  render(<Harness />);
  const { user, bell, popup } = await open();
  const first = within(popup).getByRole("button", { name: "Primera acción" });
  expect(popup.closest("[inert]")).toBeNull();
  expect(document.querySelector(".v-sidebar")?.hasAttribute("inert")).toBe(
    true,
  );
  first.focus();
  await user.keyboard("{Shift>}{Tab}{/Shift}");
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Cerrar ventana" }),
  );
  expect(screen.getByRole("dialog", { name: "Notificaciones" })).toBeTruthy();
  await user.keyboard("{Tab}");
  expect(document.activeElement).toBe(first);
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Notificaciones" })).toBeNull(),
  );
  await waitFor(() => expect(document.activeElement).toBe(bell));
  expect(document.querySelector(".v-sidebar")?.hasAttribute("inert")).toBe(
    false,
  );
});
it("blocks background shortcuts and clicks, with a positive control after close", async () => {
  const action = vi.fn(),
    shortcut = vi.fn();
  const listener = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.key === "l") shortcut();
  };
  window.addEventListener("keydown", listener);
  try {
    render(<Harness action={action} />);
    const background = screen.getByRole("button", { name: "Destino" });
    const { user, popup } = await open();
    within(popup).getByRole("button", { name: "Primera acción" }).focus();
    await user.keyboard("{Control>}l{/Control}");
    fireEvent.click(background);
    expect(shortcut).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(background.closest("[inert]")).toBeNull());
    fireEvent.click(background);
    expect(action).toHaveBeenCalledOnce();
    fireEvent.keyDown(window, { key: "l", ctrlKey: true });
    expect(shortcut).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener("keydown", listener);
  }
});
it("shares the existing registry with a nested dialog instead of creating competing traps", async () => {
  render(<Harness />);
  const { user, bell, popup } = await open();
  const trigger = within(popup).getByRole("button", { name: "Confirmar" });
  await user.click(trigger);
  await screen.findByRole("dialog", { name: "Confirmación" });
  expect(popup.hasAttribute("inert")).toBe(true);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  expect(popup.hasAttribute("inert")).toBe(false);
  expect(document.querySelector(".v-sidebar")?.hasAttribute("inert")).toBe(
    true,
  );
  await user.keyboard("{Escape}");
  await waitFor(() => expect(document.activeElement).toBe(bell));
});
it("restores inert state and removes listeners when unmounted while open", async () => {
  const { unmount } = render(<Harness />);
  const sidebar = document.querySelector(".v-sidebar");
  await open();
  expect(sidebar?.hasAttribute("inert")).toBe(true);
  unmount();
  expect(sidebar?.hasAttribute("inert")).toBe(false);
  const event = new KeyboardEvent("keydown", {
    key: "l",
    ctrlKey: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
});
