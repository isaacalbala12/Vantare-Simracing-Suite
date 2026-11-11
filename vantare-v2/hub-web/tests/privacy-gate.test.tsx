// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { HostProvider, useHost } from "../src/renderer/app/Host";
import { PrivacyGate } from "../src/renderer/app/PrivacyGate";
import { Client } from "../src/renderer/bridge/client";
import { privacyGateText as text } from "../src/renderer/i18n/privacy-gate.es";
import { ToastProvider, TooltipProvider } from "../src/renderer/ui/Layers";

const caches: QueryClient[] = [];
function Content() {
  return useHost().hello ? (
    <PrivacyGate>
      <h1>Hub</h1>
    </PrivacyGate>
  ) : null;
}
function mount(scene = "privacidad-pendiente") {
  window.history.replaceState(null, "", `/?escena=${scene}`);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  render(
    <QueryClientProvider client={cache}>
      <HostProvider>
        <CSPProvider disableStyleElements>
          <TooltipProvider>
            <ToastProvider>
              <Content />
            </ToastProvider>
          </TooltipProvider>
        </CSPProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});
it("asks crashes first, starts on rejection and traps keyboard focus", async () => {
  const user = mount();
  await screen.findByRole("dialog", { name: text.crashesLabel });
  const reject = screen.getByRole("button", { name: text.reject });
  await waitFor(() => expect(document.activeElement).toBe(reject));
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: text.policy }),
  );
  await user.tab();
  expect(document.activeElement).toBe(reject);
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: text.accept }),
  );
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: text.policy }),
  );
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("heading", { name: "Hub" })).toBeNull();
});
it("stores both decisions independently and only then reveals the Hub", async () => {
  const request = vi.spyOn(Client.prototype, "request");
  const user = mount();
  await screen.findByRole("dialog");
  await user.click(screen.getByRole("button", { name: text.reject }));
  await screen.findByRole("dialog", { name: text.usageLabel });
  await user.click(screen.getByRole("checkbox", { name: text.usage }));
  await user.click(screen.getByRole("button", { name: text.continue }));
  await screen.findByRole("heading", { name: "Hub" });
  expect(
    request.mock.calls
      .map(([value]) => value)
      .filter((value) => value.method === "privacy.update")
      .map((value) => value.patch),
  ).toEqual([
    { field: "crashes", value: false },
    { field: "usage", value: true },
  ]);
});
it("keeps a failed decision visible and supports retry without granting consent", async () => {
  const user = mount("privacidad-error");
  await screen.findByRole("dialog");
  await user.click(screen.getByRole("button", { name: text.reject }));
  expect((await screen.findByRole("alert")).textContent).toBe(text.failed);
  expect(screen.queryByRole("heading", { name: "Hub" })).toBeNull();
  expect(
    screen.getByRole("button", { name: text.reject }).hasAttribute("disabled"),
  ).toBe(false);
});
it("uses the conflict's current revision for the next explicit decision", async () => {
  const request = vi.spyOn(Client.prototype, "request");
  const user = mount("privacidad-puerta-conflicto");
  await screen.findByRole("dialog");
  await user.click(screen.getByRole("button", { name: text.reject }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: text.reject }));
  await screen.findByRole("heading", { name: "Hub" });
  const updates = request.mock.calls
    .map(([value]) => value)
    .filter((value) => value.method === "privacy.update");
  expect(updates).toHaveLength(2);
  expect(updates[0].baseRevision).not.toBe(updates[1].baseRevision);
});
it("does not ask again for decided or protected documents", async () => {
  mount("privacidad-puerta-protegida");
  await screen.findByRole("heading", { name: "Hub" });
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("starts the usage choice unchecked and allows refusal with window controls present", async () => {
  const user = mount("privacidad-uso");
  await screen.findByRole("dialog", { name: text.usageLabel });
  expect(
    screen
      .getByRole("checkbox", { name: text.usage })
      .getAttribute("aria-checked"),
  ).toBe("false");
  expect(screen.getByRole("button", { name: "Cerrar ventana" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: text.reject }));
  await screen.findByRole("heading", { name: "Hub" });
});
it("keeps the close action accessible while the consent question is open", async () => {
  const close = vi.spyOn(Client.prototype, "closeWindow");
  const user = mount();
  await screen.findByRole("dialog", { name: text.crashesLabel });
  await user.click(screen.getByRole("button", { name: "Cerrar ventana" }));
  expect(close).toHaveBeenCalledOnce();
});

it("keeps existing-user QA scenes accessible without changing permission values", async () => {
  const request = vi.spyOn(Client.prototype, "request");
  mount("ajustes-base");
  await screen.findByRole("heading", { name: "Hub" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(request.mock.calls.some(([value]) => value.method === "privacy.update")).toBe(false);
});
