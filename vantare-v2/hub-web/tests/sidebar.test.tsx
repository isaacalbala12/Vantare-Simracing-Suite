// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Sidebar } from "../src/renderer/ui/Frame";
import { TooltipProvider } from "../src/renderer/ui/Layers";

afterEach(cleanup);
it("keeps keyboard navigation and collapse available with expanded groups", () => {
  const collapse = vi.fn(),
    select = vi.fn();
  render(
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <Sidebar
          label="Navegación"
          active="launcher"
          collapsed={false}
          toggle={{ label: "Contraer barra", run: collapse }}
          groups={[
            {
              label: "",
              items: [
                { id: "home", label: "Inicio", icon: "v-home" },
                {
                  id: "launcher",
                  label: "Launcher",
                  icon: "v-launch",
                  badge: <span>2</span>,
                },
              ],
            },
            {
              label: "Para testers",
              badge: "TESTER",
              items: [
                { id: "calendar", label: "Calendario", icon: "v-calendar" },
              ],
            },
          ]}
          onSelect={select}
          footer={null}
          profiles={
            <section aria-label="Perfiles">
              <button type="button">Creador de Contenido</button>
            </section>
          }
        />
      </TooltipProvider>
    </CSPProvider>,
  );
  const launcher = screen.getByRole("button", { name: "Launcher" });
  expect(launcher.getAttribute("aria-current")).toBe("page");
  fireEvent.keyDown(launcher, { key: "ArrowDown" });
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Calendario" }),
  );
  fireEvent.click(document.activeElement!);
  expect(select).toHaveBeenCalledWith("calendar");
  fireEvent.click(screen.getByRole("button", { name: "Contraer barra" }));
  expect(collapse).toHaveBeenCalledOnce();
  expect(screen.getByText("TESTER")).toBeTruthy();
  expect(screen.getByRole("region", { name: "Perfiles" })).toBeTruthy();
});
it("leaves expanded headings, profiles and wordmark out of the collapsed rail", () => {
  render(
    <Sidebar
      label="Navegación"
      active="home"
      collapsed
      groups={[
        {
          label: "Para testers",
          badge: "TESTER",
          items: [
            {
              id: "home",
              label: "Inicio",
              icon: "v-home",
              badge: <span>2</span>,
            },
          ],
        },
      ]}
      onSelect={vi.fn()}
      footer={null}
      profiles={<section aria-label="Perfiles">Perfil</section>}
    />,
  );
  expect(screen.queryByText("TESTER")).toBeNull();
  expect(screen.queryByRole("region", { name: "Perfiles" })).toBeNull();
  expect(screen.queryByRole("img", { name: "VANTARE" })).toBeNull();
  expect(screen.getByRole("button", { name: "Inicio" })).toBeTruthy();
});
