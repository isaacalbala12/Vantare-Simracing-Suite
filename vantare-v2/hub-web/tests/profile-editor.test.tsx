// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostProvider } from "../src/renderer/app/Host";
import { launcherText } from "../src/renderer/i18n/launcher";
import { actionText } from "../src/renderer/i18n/launcher-actions";
import { profileText as text } from "../src/renderer/i18n/profile-editor";
import { ProfileEditorProvider } from "../src/renderer/screens/launcher/editor-state";
import { Launcher } from "../src/renderer/screens/launcher/Launcher";
import { LauncherRail } from "../src/renderer/screens/launcher/LauncherRail";
import {
  ToastProvider,
  ToastViewport,
  TooltipProvider,
} from "../src/renderer/ui/Layers";

const caches: QueryClient[] = [];
beforeEach(() =>
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })),
);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  caches.forEach((cache) => {
    cache.clear();
  });
  caches.length = 0;
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
function mount(scene = "launcher-editor-ready") {
  window.history.replaceState(null, "", `/?escena=${scene}`);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  render(
    <QueryClientProvider client={cache}>
      <HostProvider>
        <CSPProvider disableStyleElements>
          <ToastProvider>
            <TooltipProvider>
              <ProfileEditorProvider>
                <Launcher />
                <LauncherRail />
              </ProfileEditorProvider>
              <ToastViewport closeLabel={text.cancel} />
            </TooltipProvider>
          </ToastProvider>
        </CSPProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
}
describe("profile editor", () => {
  it("expires an acknowledgment when no running transition is observed", async () => {
    mount();
    await screen.findByRole("heading", { name: "Creador de Contenido" });
    const nativeTimeout = globalThis.setTimeout.bind(globalThis);
    let expire: (() => void) | undefined;
    vi.spyOn(window, "setTimeout").mockImplementation(
      (handler, delay, ...args) => {
        if (delay === 1500 && typeof handler === "function") {
          expire = handler as () => void;
          return nativeTimeout(handler, delay, ...args);
        }
        return nativeTimeout(handler, delay, ...args);
      },
    );
    fireEvent.click(screen.getByRole("button", { name: /Lanzar/ }));
    await screen.findByText(launcherText.queued);
    expect(expire).toBeTypeOf("function");
    act(() => expire?.());
    expect(screen.queryByText(launcherText.queued)).toBeNull();
    expect(
      screen.getByRole("button", { name: /Lanzar/ }).hasAttribute("disabled"),
    ).toBe(false);
    vi.restoreAllMocks();
  });
  it("creates a profile using the native default and exposes advanced notes without editable arguments", async () => {
    mount();
    await screen.findByRole("heading", { name: "Creador de Contenido" });
    fireEvent.click(
      screen.getAllByRole("button", { name: "+ Nuevo perfil" })[0],
    );
    const name = await screen.findByRole("textbox", { name: text.name });
    expect((name as HTMLInputElement).value).toBe("Nuevo perfil");
    fireEvent.click(screen.getByRole("button", { name: text.mode }));
    expect(screen.getByRole("textbox", { name: text.notes })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: text.addStep }));
    expect(screen.getByText(text.defaultArguments)).toBeTruthy();
    fireEvent.change(name, { target: { value: "Perfil guardado QA" } });
    fireEvent.click(screen.getByRole("button", { name: text.save }));
    await screen.findByRole("button", {
      name: "Perfil guardado QA",
    });
  });
  it("keeps a draft after CAS conflict and saves only on explicit retry", async () => {
    mount("launcher-conflicto");
    await screen.findByRole("heading", { name: "Creador de Contenido" });
    fireEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
    const name = await screen.findByRole("textbox", { name: text.name });
    fireEvent.change(name, { target: { value: "Cambio conservado" } });
    fireEvent.click(screen.getByRole("button", { name: text.save }));
    await screen.findByText(text.conflict);
    expect(
      (screen.getByRole("textbox", { name: text.name }) as HTMLInputElement)
        .value,
    ).toBe("Cambio conservado");
    fireEvent.click(screen.getByRole("button", { name: text.retry }));
    await screen.findByRole("button", {
      name: "Cambio conservado",
    });
  });
  it("shows argument status without an editor and Escape discards other changes", async () => {
    mount();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Creador de Contenido" });
    fireEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
    const name = await screen.findByRole("textbox", { name: text.name });
    fireEvent.click(screen.getByRole("button", { name: text.mode }));
    expect(screen.getAllByText(text.defaultArguments).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole("textbox", { name: /Argumentos/ })).toBeNull();
    fireEvent.change(name, { target: { value: "Cambio sin guardar" } });
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: text.name })).toBeNull(),
    );
    expect(
      screen.getByRole("heading", { name: "Creador de Contenido" }),
    ).toBeTruthy();
  });
  it("requires confirmation before removing a step with private arguments", async () => {
    mount("launcher-editor-custom");
    await screen.findByRole("heading", { name: "Creador de Contenido" });
    fireEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
    await screen.findByRole("textbox", { name: text.name });
    fireEvent.click(screen.getAllByRole("button", { name: text.remove })[0]);
    fireEvent.click(screen.getByRole("button", { name: text.save }));
    await screen.findByRole("alertdialog", { name: text.argumentLossTitle });
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: text.cancel,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByRole("textbox", { name: text.name })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: text.save }));
    await screen.findByRole("alertdialog", { name: text.argumentLossTitle });
    fireEvent.click(
      screen.getByRole("button", { name: text.confirmArgumentLoss }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: text.name })).toBeNull(),
    );
  });
  it("reorders a step without discarding its custom arguments", async () => {
    mount("launcher-editor-custom");
    await screen.findByRole("heading", { name: "Creador de Contenido" });
    fireEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
    await screen.findByRole("textbox", { name: text.name });
    fireEvent.click(screen.getAllByRole("button", { name: text.down })[0]);
    fireEvent.click(screen.getByRole("button", { name: text.save }));
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: text.name })).toBeNull(),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
    await screen.findByRole("textbox", { name: text.name });
    fireEvent.click(screen.getByRole("button", { name: text.mode }));
    expect(screen.getAllByText(text.customArguments)).toHaveLength(1);
  });
  it("warns before saving an app change that discards private arguments", async () => {
    mount("launcher-editor-custom");
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Creador de Contenido" });
    fireEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
    await screen.findByRole("textbox", { name: text.name });
    await user.click(
      screen.getAllByRole("combobox", { name: text.stepApp })[0],
    );
    const options = await screen.findAllByRole("option");
    await user.click(
      options.find(
        (option) => option.getAttribute("aria-selected") !== "true",
      ) ?? options[0],
    );
    fireEvent.click(screen.getByRole("button", { name: text.save }));
    await screen.findByRole("alertdialog", { name: text.argumentLossTitle });
  });
  it("marks another favorite from the list without clearing the existing favorite", async () => {
    mount();
    const creator = await screen.findByRole("button", {
      name: "Creador de Contenido",
    });
    const pro = screen.getByRole("button", { name: "Pro" });
    fireEvent.contextMenu(pro);
    fireEvent.click(
      await screen.findByRole("menuitem", { name: actionText.favorite }),
    );
    await waitFor(() =>
      expect(within(pro).getByText(launcherText.favorite)).toBeTruthy(),
    );
    expect(within(creator).getByText(launcherText.favorite)).toBeTruthy();
  });
  it("confirms profile deletion and cancellation has no effect", async () => {
    mount();
    const creator = await screen.findByRole("button", {
      name: "Creador de Contenido",
    });
    fireEvent.contextMenu(creator);
    fireEvent.click(
      await screen.findByRole("menuitem", { name: actionText.remove }),
    );
    let dialog = await screen.findByRole("dialog", {
      name: actionText.removeTitle,
    });
    expect(
      within(dialog).getByText(actionText.removeMessage("creator")),
    ).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: actionText.cancel }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(creator).toBeTruthy();
    fireEvent.contextMenu(creator);
    fireEvent.click(
      await screen.findByRole("menuitem", { name: actionText.remove }),
    );
    dialog = await screen.findByRole("dialog", {
      name: actionText.removeTitle,
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: actionText.remove }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: "Creador de Contenido",
        }),
      ).toBeNull(),
    );
  });
  it("keeps an action after conflict and only saves on explicit retry", async () => {
    mount("launcher-actions-conflicto");
    const pro = await screen.findByRole("button", { name: "Pro" });
    fireEvent.contextMenu(pro);
    fireEvent.click(
      await screen.findByRole("menuitem", { name: actionText.favorite }),
    );
    await screen.findByText(actionText.conflict);
    expect(within(pro).queryByText(launcherText.favorite)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: actionText.retry }));
    await waitFor(() =>
      expect(within(pro).getByText(launcherText.favorite)).toBeTruthy(),
    );
  });
  it("duplicates from a saved profile and toggles its LMU trigger", async () => {
    mount();
    const creator = await screen.findByRole("button", {
      name: "Creador de Contenido",
    });
    fireEvent.contextMenu(creator);
    fireEvent.click(
      await screen.findByRole("menuitem", { name: actionText.duplicate }),
    );
    await screen.findByRole("button", { name: "Creador de Contenido (copia)" });
    fireEvent.contextMenu(creator);
    fireEvent.click(
      await screen.findByRole("menuitem", { name: actionText.trigger }),
    );
    fireEvent.contextMenu(creator);
    fireEvent.click(
      await screen.findByRole("menuitem", { name: actionText.triggered }),
    );
    fireEvent.contextMenu(creator);
    await screen.findByRole("menuitem", { name: actionText.trigger });
  });
});
