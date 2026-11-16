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
import { useState } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { profileLimits } from "../src/contract/generated/contract";
import { HostProvider } from "../src/renderer/app/Host";
import {
  SectionChromeProvider,
  SectionRailSlot,
  SectionTabsSlot,
} from "../src/renderer/app/SectionChrome";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { launcherText } from "../src/renderer/i18n/launcher";
import { actionText } from "../src/renderer/i18n/launcher-actions";
import { removalText } from "../src/renderer/i18n/launcher-removal";
import { residentText } from "../src/renderer/i18n/launcher-resident";
import { profileText as text } from "../src/renderer/i18n/profile-editor";
import LauncherEntry from "../src/renderer/screens/launcher/entry";
import {
  ToastProvider,
  ToastViewport,
  TooltipProvider,
} from "../src/renderer/ui/Layers";

const caches: QueryClient[] = [];
// Module loading on the cold HDD is fixture setup, not part of editor behavior.
beforeAll(async () => {
  await import("../src/mock/host");
});
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
function ScreenNavigation() {
  const [visible, setVisible] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setVisible(!visible)}>
        Otra sección
      </button>
      <SectionChromeProvider>
        <SectionTabsSlot />
        <SectionRailSlot fallback={null} />
        {visible && <LauncherEntry />}
      </SectionChromeProvider>
    </>
  );
}
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
              <ScreenNavigation />
              <ToastViewport closeLabel={text.cancel} />
            </TooltipProvider>
          </ToastProvider>
        </CSPProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
}
describe("profile editor", () => {
  it("uses only the resident registration matching the current profile and hotkey", async () => {
    mount("launcher-shortcuts");
    await screen.findByRole("heading", { name: "Creador de Contenido" });
    fireEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
    await screen.findByText(residentText.registration.registered);
    const hotkey = screen.getByRole("textbox", { name: text.hotkey });
    fireEvent.change(hotkey, { target: { value: "ctrl+shift+3" } });
    expect(screen.queryByText(residentText.registration.registered)).toBeNull();
    expect(
      screen.getByText(residentText.registration.unconfirmed),
    ).toBeTruthy();
    fireEvent.change(hotkey, { target: { value: "ctrl+shift+1" } });
    expect(screen.getByText(residentText.registration.registered)).toBeTruthy();
  });
  it("retains freshly read custom arguments when only the profile name was edited", async () => {
    mount("launcher-editor-custom-conflicto");
    await screen.findByRole("heading", { name: "Creador de Contenido" });
    fireEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
    const name = await screen.findByRole("textbox", { name: text.name });
    fireEvent.change(name, { target: { value: "Solo cambia el nombre" } });
    fireEvent.click(screen.getByRole("button", { name: text.save }));
    await screen.findByText(text.conflict);
    fireEvent.click(screen.getByRole("button", { name: text.retry }));
    await screen.findByRole("button", { name: "Solo cambia el nombre" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
    await screen.findByRole("textbox", { name: text.name });
    fireEvent.click(screen.getByRole("button", { name: text.mode }));
    expect(screen.getAllByText(text.customArguments).length).toBeGreaterThan(0);
  });
  it("confirms tab changes including arrow activation, keeps on cancel and restores edit focus on discard", async () => {
    mount();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Creador de Contenido" });
    expect(screen.getByRole("tab", { name: "Aplicaciones" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
    const name = await screen.findByRole("textbox", { name: text.name });
    fireEvent.change(name, { target: { value: "Cambio con flechas" } });
    act(() => screen.getByRole("tab", { name: /^Perfil$/ }).focus());
    await user.keyboard("{ArrowLeft}");
    await screen.findByRole("alertdialog", { name: text.discardTitle });
    fireEvent.click(screen.getByRole("button", { name: text.keepEditing }));
    expect(
      (screen.getByRole("textbox", { name: text.name }) as HTMLInputElement)
        .value,
    ).toBe("Cambio con flechas");
    fireEvent.click(screen.getByRole("tab", { name: /^Perfiles$/ }));
    await screen.findByRole("alertdialog", { name: text.discardTitle });
    fireEvent.click(screen.getByRole("button", { name: text.confirmDiscard }));
    await screen.findByRole("heading", { name: "Creador de Contenido" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Editar perfil" }),
    );
  });
  it("vetoes window close and restart without discarding, and permits Live", async () => {
    const registrations = vi.spyOn(Client.prototype, "addCloseGuard");
    mount();
    await screen.findByRole("heading", { name: "Creador de Contenido" });
    fireEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
    const name = await screen.findByRole("textbox", { name: text.name });
    fireEvent.change(name, { target: { value: "No descartar al vetar" } });
    const guard = registrations.mock.calls.at(-1)?.[0];
    if (!guard) throw new Error("missing close guard");
    await act(async () => {
      expect(await guard("window")).toBe(false);
      expect(await guard("restart")).toBe(false);
      expect(await guard("live")).toBe(true);
    });
    expect(
      (screen.getByRole("textbox", { name: text.name }) as HTMLInputElement)
        .value,
    ).toBe("No descartar al vetar");
    fireEvent.click(screen.getByRole("button", { name: "Otra sección" }));
    await act(async () => {
      expect(await guard("restart")).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: "Otra sección" }));
    expect(
      (
        (await screen.findByRole("textbox", {
          name: text.name,
        })) as HTMLInputElement
      ).value,
    ).toBe("No descartar al vetar");
  });
  it("does not save again after conflict when there are no local edits to apply", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount("launcher-conflicto");
    await screen.findByRole("heading", { name: "Creador de Contenido" });
    fireEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
    await screen.findByRole("textbox", { name: text.name });
    fireEvent.click(screen.getByRole("button", { name: text.save }));
    await screen.findByText(text.conflict);
    fireEvent.click(screen.getByRole("button", { name: text.retry }));
    await screen.findByText(text.refreshed);
    expect(
      requests.mock.calls.filter(
        ([request]) => request.method === "launcher.profile.save",
      ),
    ).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: text.name })).toBeTruthy();
  });
  it("preserves a dirty draft while its screen is unmounted", async () => {
    mount();
    await screen.findByRole("heading", { name: "Creador de Contenido" });
    fireEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
    const name = await screen.findByRole("textbox", { name: text.name });
    fireEvent.change(name, { target: { value: "Borrador entre secciones" } });
    fireEvent.click(screen.getByRole("button", { name: "Otra sección" }));
    expect(screen.queryByRole("textbox", { name: text.name })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Otra sección" }));
    expect(
      (
        (await screen.findByRole("textbox", {
          name: text.name,
        })) as HTMLInputElement
      ).value,
    ).toBe("Borrador entre secciones");
    fireEvent.click(screen.getByRole("button", { name: text.save }));
    await screen.findByRole("button", { name: "Borrador entre secciones" });
  });
  it("expires an acknowledgment when no running transition is observed", async () => {
    mount();
    await screen.findByRole("heading", { name: "Creador de Contenido" });
    const request = Client.prototype.request;
    let response: ReturnType<Client["request"]> | undefined;
    let notifySent!: () => void;
    const sent = new Promise<void>((resolve) => {
      notifySent = resolve;
    });
    vi.spyOn(Client.prototype, "request").mockImplementation(function (
      this: Client,
      value,
    ) {
      const result = request.call(this, value);
      if (value.method === "launcher.launchChecked") {
        response = result;
        notifySent();
      }
      return result;
    });
    vi.useFakeTimers();
    try {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Lanzar/ }));
        await sent;
        expect(response).toBeDefined();
        await response;
      });
      expect(screen.getByText(launcherText.queued)).toBeTruthy();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1499);
      });
      expect(screen.getByText(launcherText.queued)).toBeTruthy();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screen.queryByText(launcherText.queued)).toBeNull();
      expect(
        screen.getByRole("button", { name: /Lanzar/ }).hasAttribute("disabled"),
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
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
  it("shows argument status and asks before Escape discards changes", async () => {
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
    await screen.findByRole("alertdialog", { name: text.discardTitle });
    fireEvent.click(screen.getByRole("button", { name: text.keepEditing }));
    expect(
      (screen.getByRole("textbox", { name: text.name }) as HTMLInputElement)
        .value,
    ).toBe("Cambio sin guardar");
    await user.keyboard("{Escape}");
    await screen.findByRole("alertdialog", { name: text.discardTitle });
    fireEvent.click(screen.getByRole("button", { name: text.confirmDiscard }));
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
  it("rereads after conflict and warns instead of rebinding custom arguments across revisions", async () => {
    mount("launcher-editor-custom-conflicto");
    await screen.findByRole("heading", { name: "Creador de Contenido" });
    fireEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
    const name = await screen.findByRole("textbox", { name: text.name });
    fireEvent.change(name, { target: { value: "Borrador tras conflicto" } });
    fireEvent.change(
      screen.getAllByRole("spinbutton", { name: text.stepDelay })[0],
      { target: { value: "3" } },
    );
    fireEvent.click(screen.getByRole("button", { name: text.save }));
    await screen.findByText(text.conflict);
    // The ordinary Save action must also reread, not reuse the expired key.
    fireEvent.click(screen.getByRole("button", { name: text.save }));
    await screen.findByRole("alertdialog", { name: text.argumentLossTitle });
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: text.cancel,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(
      (screen.getByRole("textbox", { name: text.name }) as HTMLInputElement)
        .value,
    ).toBe("Borrador tras conflicto");
    fireEvent.click(screen.getByRole("button", { name: text.save }));
    await screen.findByRole("alertdialog", { name: text.argumentLossTitle });
    fireEvent.click(
      screen.getByRole("button", { name: text.confirmArgumentLoss }),
    );
    await screen.findByRole("button", { name: "Borrador tras conflicto" });
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
    mount("launcher-removal-finished");
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
      within(dialog).getByText(removalText.message("Creador de Contenido")),
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
    await waitFor(
      () =>
        expect(
          screen.queryByRole("button", {
            name: "Creador de Contenido",
          }),
        ).toBeNull(),
      { timeout: 3000 },
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
  it("opens a duplicate as an editable draft and saves only on confirmation", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount();
    const user = userEvent.setup();
    const creator = await screen.findByRole("button", {
      name: "Creador de Contenido",
    });
    fireEvent.contextMenu(creator);
    await user.click(
      await screen.findByRole("menuitem", { name: actionText.duplicate }),
    );
    const name = await screen.findByRole("textbox", { name: text.name });
    expect(name).toHaveProperty("value", "Creador de Contenido (copia)");
    expect(document.activeElement).toBe(name);
    expect(
      requests.mock.calls.filter(([r]) => r.method === "launcher.profile.save"),
    ).toHaveLength(0);
    const preparedCall = requests.mock.calls.findIndex(
      ([r]) => r.method === "launcher.profile.prepareDuplicate",
    );
    const prepared = await requests.mock.results[preparedCall].value;
    expect(prepared.method).toBe("launcher.profile.prepareDuplicate");
    if (prepared.method !== "launcher.profile.prepareDuplicate")
      throw new Error("missing prepared draft");
    const down = screen.getAllByRole("button", { name: text.down })[0];
    await user.click(down);
    await user.clear(name);
    await user.type(name, "Copia revisada");
    await user.click(screen.getByRole("button", { name: text.save }));
    await screen.findByRole("button", { name: "Copia revisada" });
    const saved = requests.mock.calls.find(
      ([r]) => r.method === "launcher.profile.save",
    )?.[0];
    expect(saved).toMatchObject({
      method: "launcher.profile.save",
      baseRevision: prepared.value.baseRevision,
      draft: {
        id: prepared.value.draft.id,
        name: "Copia revisada",
        steps: [
          prepared.value.draft.steps[1],
          prepared.value.draft.steps[0],
          ...prepared.value.draft.steps.slice(2),
        ],
      },
    });
    expect(
      requests.mock.calls.some(([r]) => r.method === "launcher.profile.get"),
    ).toBe(false);
    expect(
      requests.mock.calls.some(
        ([r]) => r.method === "launcher.profile.duplicate",
      ),
    ).toBe(false);
  });
  it.each(["busy", "rejected", "coreUnavailable"] as const)(
    "does not create a fallback copy when preparation is %s",
    async (kind) => {
      const native = Client.prototype.request;
      const requests = vi
        .spyOn(Client.prototype, "request")
        .mockImplementation(function (this: Client, request) {
          if (request.method === "launcher.profile.prepareDuplicate")
            return Promise.reject(new HostFailure({ kind }));
          return native.call(this, request);
        });
      mount();
      fireEvent.contextMenu(
        await screen.findByRole("button", { name: "Creador de Contenido" }),
      );
      fireEvent.click(
        await screen.findByRole("menuitem", { name: actionText.duplicate }),
      );
      await screen.findByText(
        kind === "busy"
          ? text.duplicatePrepareBusy
          : kind === "coreUnavailable"
            ? text.coreUnavailable
            : text.openFailed,
      );
      expect(screen.queryByRole("textbox", { name: text.name })).toBeNull();
      expect(
        requests.mock.calls.some(([r]) =>
          [
            "launcher.profile.save",
            "launcher.profile.get",
            "launcher.profile.duplicate",
          ].includes(r.method),
        ),
      ).toBe(false);
    },
  );
  it("cancels a prepared duplicate without creating a profile or reading its new id", async () => {
    const requests = vi.spyOn(Client.prototype, "request");
    mount();
    fireEvent.contextMenu(
      await screen.findByRole("button", { name: "Creador de Contenido" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: actionText.duplicate }),
    );
    await screen.findByRole("textbox", { name: text.name });
    fireEvent.click(screen.getByRole("button", { name: text.cancel }));
    await screen.findByRole("button", { name: "Creador de Contenido" });
    expect(
      screen.queryByRole("button", { name: "Creador de Contenido (copia)" }),
    ).toBeNull();
    expect(
      requests.mock.calls.some(([r]) =>
        [
          "launcher.profile.save",
          "launcher.profile.get",
          "launcher.profile.duplicate",
        ].includes(r.method),
      ),
    ).toBe(false);
  });
  it("saves rail preferences and retains a custom first-step delay", async () => {
    mount("launcher-options-custom");
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Creador de Contenido" });
    const delay = screen.getByRole("combobox", {
      name: launcherText.firstDelay,
    });
    expect(delay.textContent).toContain("17 s");
    await user.click(
      screen.getByRole("combobox", { name: launcherText.retries }),
    );
    await user.click(await screen.findByRole("option", { name: "3" }));
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: launcherText.retries })
          .textContent,
      ).toContain("3"),
    );
    expect(delay.textContent).toContain("17 s");
    await user.click(delay);
    await screen.findByRole("option", { name: "17 s" });
    await user.click(screen.getByRole("option", { name: "20 s" }));
    await waitFor(() => expect(delay.textContent).toContain("20 s"));
  });
  it.each(["unknown", "busy", "rejected", "denied"] as const)(
    "retains a %s duplicate draft and never rereads or replays the consumed save",
    async (kind) => {
      const native = Client.prototype.request;
      const requests = vi
        .spyOn(Client.prototype, "request")
        .mockImplementation(function (this: Client, request) {
          if (request.method === "launcher.profile.save")
            return Promise.reject(
              kind === "unknown"
                ? new Error("transport lost")
                : new HostFailure({ kind }),
            );
          return native.call(this, request);
        });
      mount();
      fireEvent.contextMenu(
        await screen.findByRole("button", { name: "Creador de Contenido" }),
      );
      fireEvent.click(
        await screen.findByRole("menuitem", { name: actionText.duplicate }),
      );
      const name = await screen.findByRole("textbox", { name: text.name });
      fireEvent.change(name, { target: { value: "Conservar mi texto" } });
      fireEvent.click(screen.getByRole("button", { name: text.save }));
      await screen.findByText(
        kind === "denied" ? text.duplicateDenied : text.duplicateUnconfirmed,
      );
      expect(name).toHaveProperty("value", "Conservar mi texto");
      expect(screen.queryByText(text.saved)).toBeNull();
      expect(screen.queryByRole("button", { name: text.retry })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: text.save }));
      expect(
        requests.mock.calls.filter(
          ([r]) => r.method === "launcher.profile.save",
        ),
      ).toHaveLength(1);
      expect(
        requests.mock.calls.some(([r]) => r.method === "launcher.profile.get"),
      ).toBe(false);
    },
  );
  it.each(["launcher-actions-limit", "launcher-actions-long-name"])(
    "disables duplicate when its native bounds cannot be met (%s)",
    async (scene) => {
      mount(scene);
      const name = scene.endsWith("long-name")
        ? "a".repeat(profileLimits.name)
        : "Creador de Contenido";
      fireEvent.contextMenu(await screen.findByRole("button", { name }));
      const item = await screen.findByRole("menuitem", {
        name: actionText.duplicate,
      });
      expect(item.getAttribute("aria-disabled")).toBe("true");
    },
  );
  it("shares the rail's in-flight action lock with profile-card actions", async () => {
    const request = Client.prototype.request;
    let release = () => {};
    const calls = vi
      .spyOn(Client.prototype, "request")
      .mockImplementation(function (this: Client, value) {
        const result = request.call(this, value);
        if (value.method !== "launcher.profile.option") return result;
        return new Promise<import("../src/contract/generated/contract").Reply>(
          (resolve) => {
            release = () => void result.then(resolve);
          },
        );
      });
    mount();
    const user = userEvent.setup();
    const creator = await screen.findByRole("button", {
      name: "Creador de Contenido",
    });
    await user.click(
      screen.getByRole("combobox", { name: launcherText.retries }),
    );
    await user.click(await screen.findByRole("option", { name: "3" }));
    await waitFor(() =>
      expect(
        screen
          .getByRole("combobox", { name: launcherText.retries })
          .getAttribute("aria-disabled"),
      ).toBe("true"),
    );
    fireEvent.contextMenu(creator);
    const favorite = await screen.findByRole("menuitem", {
      name: actionText.unfavorite,
    });
    expect(favorite.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(favorite);
    expect(
      calls.mock.calls.filter(([v]) => v.method === "launcher.profile.option"),
    ).toHaveLength(1);
    expect(
      calls.mock.calls.filter(
        ([v]) => v.method === "launcher.profile.favorite",
      ),
    ).toHaveLength(0);
    await user.keyboard("{Escape}");
    release();
    await waitFor(() =>
      expect(
        screen
          .getByRole("combobox", { name: launcherText.retries })
          .getAttribute("aria-disabled"),
      ).not.toBe("true"),
    );
  });
});
