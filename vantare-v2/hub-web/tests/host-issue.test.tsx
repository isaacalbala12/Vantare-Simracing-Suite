// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { HostProvider, useHost } from "../src/renderer/app/Host";
import { HostIssue } from "../src/renderer/app/HostIssue";
import { Client } from "../src/renderer/bridge/client";
import { ToastProvider, TooltipProvider } from "../src/renderer/ui/Layers";

function ErrorContent() {
  const host = useHost();
  return host.issue ? <HostIssue issue={host.issue} /> : null;
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});
it("retains local controls on an incompatible host without loading product state", async () => {
  window.history.replaceState(null, "", "/?escena=componentes-incompatibles");
  const request = vi.spyOn(Client.prototype, "request");
  const close = vi.spyOn(Client.prototype, "closeWindow");
  const cache = new QueryClient();
  render(
    <QueryClientProvider client={cache}>
      <HostProvider>
        <CSPProvider disableStyleElements>
          <TooltipProvider>
            <ToastProvider>
              <ErrorContent />
            </ToastProvider>
          </TooltipProvider>
        </CSPProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole("alert");
  const maximize = screen.getByRole("button", { name: "Maximizar" });
  await waitFor(() => expect(maximize.hasAttribute("disabled")).toBe(false));
  const user = userEvent.setup();
  await user.click(maximize);
  await screen.findByRole("button", { name: "Restaurar" });
  await user.click(screen.getByRole("button", { name: "Minimizar" }));
  await user.click(screen.getByRole("button", { name: "Cerrar ventana" }));
  expect(close).toHaveBeenCalledOnce();
  expect(request.mock.calls.map(([value]) => value.method)).toEqual([
    "window.toggleMaximize",
    "window.minimize",
  ]);
  cache.clear();
});
