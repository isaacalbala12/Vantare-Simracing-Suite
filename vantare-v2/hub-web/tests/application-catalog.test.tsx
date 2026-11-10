// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostProvider } from "../src/renderer/app/Host";
import { appText as text } from "../src/renderer/i18n/launcher-apps";
import { Applications } from "../src/renderer/screens/launcher/Applications";
import { ProfileEditorProvider } from "../src/renderer/screens/launcher/editor-state";
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
  caches.forEach((cache) => {
    cache.clear();
  });
  caches.length = 0;
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
function mount(scene = "launcher-aplicaciones") {
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
                <Applications />
              </ProfileEditorProvider>
              <ToastViewport closeLabel={text.cancel} />
            </TooltipProvider>
          </ToastProvider>
        </CSPProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
}

describe("application catalog", () => {
  it("filters names and categories without exposing executable paths", async () => {
    mount();
    await screen.findByRole("button", { name: "Editar Vantare Overlay" });
    expect(screen.getAllByText(text.installed)).toHaveLength(8);
    fireEvent.change(screen.getByRole("searchbox", { name: text.search }), {
      target: { value: " TELE METRÍA " },
    });
    expect(screen.getByRole("button", { name: "Editar SimHub" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Editar MoTeC" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar Spotify" })).toBeNull();
    expect(document.body.textContent).not.toContain(".exe");
  });
  it("requires a selection, preserves a draft on conflict and retries its latest fields explicitly", async () => {
    mount("launcher-aplicaciones-conflicto");
    const add = await screen.findByRole("button", {
      name: /Añadir aplicación/,
    });
    fireEvent.click(add);
    const form = await screen.findByRole("region", { name: text.editor });
    fireEvent.change(within(form).getByRole("textbox", { name: text.name }), {
      target: { value: "Nueva app QA" },
    });
    fireEvent.click(within(form).getByRole("button", { name: text.save }));
    await screen.findByText(text.missing);
    fireEvent.click(within(form).getByRole("button", { name: text.pick }));
    await screen.findByText("Aplicación QA");
    expect(screen.getByText(text.defaultArguments)).toBeTruthy();
    expect(
      within(form).queryByRole("textbox", { name: /Argumentos/ }),
    ).toBeNull();
    fireEvent.click(within(form).getByRole("button", { name: text.save }));
    await screen.findByText(text.conflict);
    fireEvent.change(within(form).getByRole("textbox", { name: text.name }), {
      target: { value: "Último cambio QA" },
    });
    fireEvent.click(within(form).getByRole("button", { name: text.retry }));
    await screen.findByRole("button", { name: "Editar Último cambio QA" });
    expect(screen.queryByRole("region", { name: text.editor })).toBeNull();
  });
  it("asks before removing a custom app and leaves official apps without a delete action", async () => {
    mount();
    await screen.findByRole("button", { name: "Editar Vantare Overlay" });
    expect(
      screen.queryByRole("button", { name: "Eliminar Le Mans Ultimate" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Eliminar Vantare Overlay" }),
    );
    const drawer = await screen.findByRole("dialog");
    expect(
      within(drawer).getByText(text.removeMessage("Vantare Overlay")),
    ).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: text.cancel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      screen.getByRole("button", { name: "Editar Vantare Overlay" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Eliminar Vantare Overlay" }),
    );
    const confirm = await screen.findByRole("dialog");
    fireEvent.click(within(confirm).getByRole("button", { name: text.remove }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Editar Vantare Overlay" }),
      ).toBeNull(),
    );
  });
});
