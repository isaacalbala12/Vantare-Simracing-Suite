// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Request } from "../src/contract/generated/contract";
import { AccountProvider, useAccount } from "../src/renderer/app/AccountState";
import { HostProvider, useHost } from "../src/renderer/app/Host";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { accountText as text } from "../src/renderer/i18n/account.es";
import { AccountPanel } from "../src/renderer/ui/AccountPanel";
import { AccountRail } from "../src/renderer/ui/AccountRail";
import { ToastProvider, TooltipProvider } from "../src/renderer/ui/Layers";

const caches: QueryClient[] = [];
function Panel() {
  const state = useAccount();
  const { hello } = useHost();
  return state.value ? (
    <>
      <AccountPanel
        value={state.value}
        pending={state.pending}
        demo={!!hello?.demo}
        act={state.act}
        error={state.error}
      />
      <AccountRail
        value={state.value}
        pending={state.pending}
        demo={!!hello?.demo}
        act={state.act}
      />
    </>
  ) : null;
}
function Content() {
  return useHost().hello ? (
    <AccountProvider>
      <Panel />
    </AccountProvider>
  ) : null;
}
function mount(scene = "cuenta-sesion") {
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
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
it("uses closed purchase identifiers and can stop checking a local checkout", async () => {
  const calls = vi.spyOn(Client.prototype, "request");
  const user = mount();
  await user.click(await screen.findByRole("button", { name: text.monthly }));
  expect(calls).toHaveBeenCalledWith({
    method: "account.purchase",
    product: "proMonthly",
  });
  expect(
    await screen.findByText(
      "Compra abierta. Los derechos se comprobarán automáticamente.",
    ),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: text.stopPurchase }));
  await screen.findByText(
    "Espera detenida. Puedes comprobar el acceso manualmente.",
  );
  expect(screen.queryByRole("button", { name: text.stopPurchase })).toBeNull();
});
it("shows the authoritative signed-out state after logout", async () => {
  const calls = vi.spyOn(Client.prototype, "request");
  const user = mount();
  await user.click(await screen.findByRole("button", { name: text.logout }));
  await screen.findByRole("heading", { name: text.signedOut });
  expect(calls).toHaveBeenCalledWith({ method: "account.logout" });
  expect(screen.getByRole("button", { name: text.monthly })).toHaveProperty(
    "disabled",
    true,
  );
  await user.click(screen.getByRole("button", { name: text.login }));
  expect(calls).toHaveBeenCalledWith({ method: "account.choose" });
});
it("keeps a failed action visible without retrying automatically", async () => {
  const original = Client.prototype.request;
  const calls = vi
    .spyOn(Client.prototype, "request")
    .mockImplementation(function (
      this: Client,
      request: Exclude<Request, { method: "window.close" }>,
    ) {
      return request.method === "account.check"
        ? Promise.reject(new HostFailure({ kind: "busy" }))
        : original.call(this, request);
    });
  const user = mount();
  await user.click(await screen.findByRole("button", { name: text.check }));
  await waitFor(() =>
    expect(screen.getAllByRole("status").some((node) => node.textContent)).toBe(
      true,
    ),
  );
  expect(
    calls.mock.calls.filter(([r]) => r.method === "account.check"),
  ).toHaveLength(1);
  expect(screen.getByRole("button", { name: text.check })).toHaveProperty(
    "disabled",
    false,
  );
});
it("does not submit a second intent while an action is pending", async () => {
  const original = Client.prototype.request;
  let reject: ((error: unknown) => void) | undefined;
  const calls = vi
    .spyOn(Client.prototype, "request")
    .mockImplementation(function (
      this: Client,
      request: Exclude<Request, { method: "window.close" }>,
    ) {
      return request.method === "account.deviceReset"
        ? new Promise((_resolve, fail) => {
            reject = fail;
          })
        : original.call(this, request);
    });
  const user = mount();
  await user.click(await screen.findByRole("button", { name: text.reset }));
  expect(screen.getByRole("button", { name: text.logout })).toHaveProperty(
    "disabled",
    true,
  );
  await user.click(screen.getByRole("button", { name: text.monthly }));
  expect(
    calls.mock.calls.filter(([r]) => r.method === "account.purchase"),
  ).toHaveLength(0);
  await act(async () => reject?.(new HostFailure({ kind: "busy" })));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: text.reset })).toHaveProperty(
      "disabled",
      false,
    ),
  );
});
it("keeps the frozen visual demo read-only and lets language change locally", async () => {
  const calls = vi.spyOn(Client.prototype, "request");
  const user = mount("visual-dark:cuenta-base");
  await user.click(await screen.findByRole("button", { name: text.check }));
  expect(screen.queryByRole("button", { name: text.monthly })).toBeNull();
  expect(
    calls.mock.calls.filter(([r]) => r.method === "account.check"),
  ).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "EN" }));
  expect(
    screen.getByText("Founders · €50 · founder price", { exact: true }),
  ).toBeTruthy();
});
