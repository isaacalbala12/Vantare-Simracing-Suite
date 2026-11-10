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
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostProvider } from "../src/renderer/app/Host";
import { launcherText } from "../src/renderer/i18n/launcher";
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
  it("creates a profile using the native default and exposes advanced notes and arguments", async () => {
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
    expect(screen.getByRole("textbox", { name: text.args })).toBeTruthy();
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
  it("rejects malformed argument JSON and Escape discards without saving", async () => {
    mount();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Creador de Contenido" });
    fireEvent.click(screen.getByRole("button", { name: "Editar perfil" }));
    await screen.findByRole("textbox", { name: text.name });
    fireEvent.click(screen.getByRole("button", { name: text.mode }));
    fireEvent.change(screen.getAllByRole("textbox", { name: text.args })[0], {
      target: { value: "[invalid]" },
    });
    fireEvent.click(screen.getByRole("button", { name: text.save }));
    await screen.findByText(text.invalidArgs);
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: text.name })).toBeNull(),
    );
    expect(
      screen.getByRole("heading", { name: "Creador de Contenido" }),
    ).toBeTruthy();
  });
});
