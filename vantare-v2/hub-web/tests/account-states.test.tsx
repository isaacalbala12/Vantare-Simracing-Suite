// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { accountLimits } from "../src/contract/generated/account";
import type { Reply, Request } from "../src/contract/generated/contract";
import { AccountGate } from "../src/renderer/app/AccountGate";
import { AccountProvider } from "../src/renderer/app/AccountState";
import { HostProvider, useHost } from "../src/renderer/app/Host";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { accessText as text } from "../src/renderer/i18n/access.es";
import { windowText } from "../src/renderer/i18n/window.es";
import { ToastProvider, TooltipProvider } from "../src/renderer/ui/Layers";

const caches: QueryClient[] = [];
function Content() {
  return useHost().hello ? (
    <AccountProvider>
      <AccountGate>
        <h1>Hub local</h1>
      </AccountGate>
    </AccountProvider>
  ) : null;
}
function mount(scene: string) {
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
const nativeDialogMethods = ["showModal", "close"] as const;
const nativeDialogDescriptors = nativeDialogMethods.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name),
);
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    writable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    writable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
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
  nativeDialogMethods.forEach((name, index) => {
    const original = nativeDialogDescriptors[index];
    if (original)
      Object.defineProperty(HTMLDialogElement.prototype, name, original);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  });
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
it("finishes code login against the local host and unmounts all credential fields", async () => {
  const calls = vi.spyOn(Client.prototype, "request");
  const user = mount("acceso-correo-completo");
  await user.click(await screen.findByRole("button", { name: text.email }));
  await user.type(
    await screen.findByRole("textbox", { name: text.emailLabel }),
    "qa@example.invalid",
  );
  await user.click(screen.getByRole("button", { name: text.submit.continue }));
  await user.type(
    await screen.findByRole("textbox", {
      name: text.codeDigit(1, accountLimits.code),
    }),
    "123456",
  );
  await user.click(screen.getByRole("button", { name: text.submit.verify }));
  await user.click(
    await screen.findByRole("button", { name: text.submit.authorize }),
  );
  await screen.findByRole("heading", { name: "Hub local" });
  expect(screen.queryByRole("dialog", { name: text.title })).toBeNull();
  expect(document.querySelector("[data-access-secret]")).toBeNull();
  const verify = calls.mock.calls.find(
    ([r]) => r.method === "account.email" && r.action.action === "verify",
  )?.[0];
  expect(verify).toMatchObject({
    method: "account.email",
    action: { action: "verify", code: "" },
  });
});
it("clears a recovery password on reset and carries only the explicit sign-out choice", async () => {
  const calls = vi.spyOn(Client.prototype, "request");
  const user = mount("acceso-correo-completo");
  await user.click(await screen.findByRole("link", { name: text.recover }));
  await user.type(
    await screen.findByRole("textbox", { name: text.emailLabel }),
    "qa@example.invalid",
  );
  await user.click(screen.getByRole("button", { name: text.submit.continue }));
  await user.type(
    await screen.findByRole("textbox", {
      name: text.codeDigit(1, accountLimits.code),
    }),
    "123456",
  );
  await user.click(screen.getByRole("button", { name: text.submit.verify }));
  const input = await screen.findByLabelText(text.newPassword);
  await user.type(input, crypto.randomUUID());
  await user.click(screen.getByRole("button", { name: text.signOutOthers }));
  await user.click(screen.getByRole("button", { name: text.submit.password }));
  await screen.findByRole("button", { name: text.submit.authorize });
  expect(input).toHaveProperty("value", "");
  expect(
    calls.mock.calls.find(
      ([r]) => r.method === "account.email" && r.action.action === "reset",
    )?.[0],
  ).toMatchObject({
    method: "account.email",
    action: { action: "reset", password: "", signOutOthers: true },
  });
});
it("copies a browser link entirely in the mock host and can cancel the wait", async () => {
  const calls = vi.spyOn(Client.prototype, "request");
  const user = mount("acceso-navegador");
  await user.click(await screen.findByRole("button", { name: text.copy }));
  await screen.findByText(text.copied);
  expect(calls.mock.calls.map(([request]) => request)).toContainEqual({
    method: "account.copyLink",
  });
  await user.click(screen.getByRole("button", { name: text.cancel }));
  await screen.findByRole("button", { name: text.email });
  expect(screen.queryByText(text.copied)).toBeNull();
});
it("allows explicit return after an unconfirmed logout without Escape bypass", async () => {
  const calls = vi.spyOn(Client.prototype, "request");
  const user = mount("acceso-cierre-incierto");
  await screen.findByText(text.logoutFailed);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("heading", { name: "Hub local" })).toBeNull();
  await user.click(screen.getByRole("button", { name: text.back }));
  await screen.findByRole("heading", { name: "Hub local" });
  expect(calls.mock.calls.map(([request]) => request)).toContainEqual({
    method: "account.back",
  });
});
it("leaves a service failure visible until manual retry", async () => {
  const calls = vi.spyOn(Client.prototype, "request");
  const user = mount("acceso-error");
  await screen.findByText(
    "No se pudo completar el acceso: vuelve a intentarlo.",
  );
  expect(
    calls.mock.calls.filter(([r]) => r.method === "account.retry"),
  ).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: text.retry }));
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  expect(
    calls.mock.calls.filter(([r]) => r.method === "account.retry"),
  ).toHaveLength(1);
});
it("keeps close controls available while canceling and logging out", async () => {
  mount("acceso-cancelando");
  await screen.findByText(text.canceling);
  expect(screen.getByRole("button", { name: windowText.close })).toBeTruthy();
  expect(screen.queryByRole("button", { name: text.google })).toBeNull();
});
it("does not let a late initial-read failure mask a newer login intention", async () => {
  const original = Client.prototype.request;
  let reject: ((error: unknown) => void) | undefined;
  vi.spyOn(Client.prototype, "request").mockImplementation(function (
    this: Client,
    request: Exclude<Request, { method: "window.close" }>,
    onSent?: () => void,
  ): Promise<Reply> {
    return request.method === "account.get"
      ? new Promise((_resolve, fail) => {
          reject = fail;
        })
      : original.call(this, request, onSent);
  });
  const user = mount("acceso-base");
  await user.click(await screen.findByRole("button", { name: text.google }));
  await screen.findByText(text.waitingBrowser);
  await act(async () => reject?.(new HostFailure({ kind: "coreUnavailable" })));
  expect(screen.queryByText(text.failed)).toBeNull();
  expect(screen.getByText(text.waitingBrowser)).toBeTruthy();
});
