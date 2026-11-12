// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  CommandPalette,
  type PaletteCommand,
} from "../src/renderer/ui/CommandPalette";
import { WindowDialogProvider } from "../src/renderer/ui/WindowDialog";

afterEach(cleanup);
function Harness({ commands }: { commands: PaletteCommand[] }) {
  const [open, setOpen] = useState(true);
  return (
    <CSPProvider disableStyleElements>
      <WindowDialogProvider>
        <CommandPalette
          title="Paleta de comandos"
          description="Busca una sección o una acción"
          trigger="Comandos"
          closeLabel="Cerrar"
          empty="Sin resultados"
          commands={commands}
          open={open}
          onOpenChange={setOpen}
        />
      </WindowDialogProvider>
    </CSPProvider>
  );
}
function mount(commands: PaletteCommand[]) {
  render(<Harness commands={commands} />);
}
it("groups icons, metadata and shortcuts, filters by metadata and executes only once with Enter", async () => {
  const run = vi.fn();
  const user = userEvent.setup();
  mount([
    {
      id: "home",
      label: "Inicio",
      group: "navigation",
      icon: "v-home",
      meta: "Tu resumen",
      run: vi.fn(),
    },
    {
      id: "launch",
      label: "Lanzar Carrera",
      group: "actions",
      icon: "v-launch",
      meta: "Perfil de Launcher",
      shortcut: "Ctrl L",
      run,
    },
  ]);
  expect(screen.getByText("IR A")).toBeTruthy();
  expect(screen.getByText("ACCIONES")).toBeTruthy();
  expect(screen.getByText("Ctrl L").tagName).toBe("KBD");
  expect(
    screen.getByRole("option", { name: /Inicio/ }).querySelector("svg"),
  ).toBeTruthy();
  await user.type(screen.getByRole("combobox"), "Perfil de Launcher");
  expect(screen.queryByText("IR A")).toBeNull();
  await user.keyboard("{ArrowDown}{Enter}");
  expect(run).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("shows locked reasons, cannot execute a locked destination and clears its search on reopening", async () => {
  const run = vi.fn();
  const user = userEvent.setup();
  mount([
    {
      id: "locked",
      label: "Lanzar Carrera",
      meta: "Acceso sin verificar",
      disabled: true,
      run,
    },
  ]);
  await user.type(screen.getByRole("combobox"), "sin verificar");
  const option = screen.getByRole("option");
  expect(option.getAttribute("aria-disabled")).toBe("true");
  await user.click(option);
  await user.keyboard("{Enter}");
  expect(run).not.toHaveBeenCalled();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Comandos" }));
  expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("");
});
