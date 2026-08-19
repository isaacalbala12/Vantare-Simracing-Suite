import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { Drawer } from "./Drawer";

afterEach(cleanup);

function Host({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button data-testid="opener" type="button">
        abrir
      </button>
      <Drawer
        closeLabel="Cerrar"
        data-testid="drawer"
        footer={<Button data-testid="drawer-primary">Guardar</Button>}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        open={open}
        title="Editar perfil"
      >
        <input data-testid="drawer-input" />
      </Drawer>
    </>
  );
}

describe("Drawer", () => {
  it("renders a labelled modal dialog with head, body and footer", () => {
    render(<Host onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Editar perfil" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByTestId("drawer-input")).toBeTruthy();
    expect(screen.getByTestId("drawer-primary")).toBeTruthy();
  });

  it("closes with Esc, with the close button and by clicking outside", () => {
    const onClose = vi.fn();

    render(<Host onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();

    render(<Host onClose={onClose} />);
    fireEvent.click(screen.getByTestId("orbit-drawer-close"));
    expect(onClose).toHaveBeenCalledTimes(2);
    cleanup();

    render(<Host onClose={onClose} />);
    fireEvent.click(screen.getByTestId("orbit-drawer-scrim"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("moves focus into the panel and traps Tab inside it", () => {
    render(<Host onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Tab desde el último foco vuelve al primero, no se escapa a la página.
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>("button, input"),
    );
    focusables[focusables.length - 1].focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(focusables[0]);
  });

  it("renders nothing while closed", () => {
    render(
      <Drawer closeLabel="Cerrar" onClose={() => {}} open={false} title="Editar perfil">
        <input data-testid="drawer-input" />
      </Drawer>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
