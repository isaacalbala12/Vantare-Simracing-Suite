// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Reply, Request } from "../src/contract/generated/contract";
import { AccountProvider, useAccount } from "../src/renderer/app/AccountState";
import { HostProvider, useHost } from "../src/renderer/app/Host";
import { SectionChromeProvider } from "../src/renderer/app/SectionChrome";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { accessText } from "../src/renderer/i18n/access.es";
import {
  foundersCopy,
  accountText as text,
} from "../src/renderer/i18n/account.es";
import { AccountScreen } from "../src/renderer/screens/account/AccountScreen";
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
        pendingMethod={state.pendingMethod}
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
function Content({ fullScreen = false }: { fullScreen?: boolean }) {
  return useHost().hello ? (
    <AccountProvider>
      {fullScreen ? (
        <SectionChromeProvider>
          <AccountScreen />
        </SectionChromeProvider>
      ) : (
        <Panel />
      )}
    </AccountProvider>
  ) : null;
}
function mount(scene = "cuenta-sesion", fullScreen = false) {
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
              <Content fullScreen={fullScreen} />
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
  expect(calls.mock.calls.map(([request]) => request)).toContainEqual({
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
  expect(calls.mock.calls.map(([request]) => request)).toContainEqual({
    method: "account.logout",
  });
  expect(screen.getByRole("button", { name: text.monthly })).toHaveProperty(
    "disabled",
    true,
  );
  await user.click(screen.getByRole("button", { name: text.login }));
  expect(calls.mock.calls.map(([request]) => request)).toContainEqual({
    method: "account.choose",
  });
});
it("keeps a failed action visible without retrying automatically", async () => {
  const original = Client.prototype.request;
  const calls = vi
    .spyOn(Client.prototype, "request")
    .mockImplementation(function (
      this: Client,
      request: Exclude<Request, { method: "window.close" }>,
      onSent?: () => void,
    ) {
      return request.method === "account.check"
        ? Promise.reject(new HostFailure({ kind: "busy" }))
        : original.call(this, request, onSent);
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
      onSent?: () => void,
    ) {
      return request.method === "account.deviceReset"
        ? new Promise((_resolve, fail) => {
            reject = fail;
          })
        : original.call(this, request, onSent);
    });
  const user = mount();
  await user.click(await screen.findByRole("button", { name: text.reset }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: text.resetConfirm,
    }),
  );
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

const purchaseButtons = {
  proMonthly: text.monthly,
  proAnnual: text.annual,
  founders: foundersCopy.ES.button,
} as const;
it.each(Object.entries(purchaseButtons))(
  "blocks all purchases while %s is waiting",
  async (product, label) => {
    const calls = vi.spyOn(Client.prototype, "request");
    const user = mount();
    await user.click(await screen.findByRole("button", { name: label }));
    await screen.findByText(text.purchaseWaiting);
    expect(screen.getByText(text.checkoutNotice)).toBeTruthy();
    for (const name of Object.values(purchaseButtons)) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveProperty("disabled", true);
      expect(button.getAttribute("aria-describedby")).toBeTruthy();
      await user.click(button);
    }
    expect(
      calls.mock.calls
        .filter(([r]) => r.method === "account.purchase")
        .map(([r]) => r),
    ).toEqual([{ method: "account.purchase", product }]);
    await user.click(screen.getByRole("button", { name: text.stopPurchase }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: label })).toHaveProperty(
        "disabled",
        false,
      ),
    );
  },
);
it("does not offer another purchase to a Founders owner", async () => {
  const calls = vi.spyOn(Client.prototype, "request");
  const user = mount("cuenta-founders");
  await screen.findByText(text.foundersOwned);
  for (const name of Object.values(purchaseButtons)) {
    const button = screen.getByRole("button", { name });
    expect(button).toHaveProperty("disabled", true);
    await user.click(button);
  }
  expect(
    calls.mock.calls.filter(([r]) => r.method === "account.purchase"),
  ).toHaveLength(0);
});
it("requires confirmation for device reset and cancel sends nothing", async () => {
  const calls = vi.spyOn(Client.prototype, "request");
  const user = mount();
  const reset = await screen.findByRole("button", {
    name: text.reset,
  });
  await user.click(reset);
  let dialog = await screen.findByRole("alertdialog", { name: text.reset });
  expect(within(dialog).getByText(text.resetDescription)).toBeTruthy();
  await user.click(within(dialog).getByRole("button", { name: text.cancel }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(
    calls.mock.calls.filter(([r]) => r.method === "account.deviceReset"),
  ).toHaveLength(0);
  await user.click(reset);
  dialog = await screen.findByRole("alertdialog", { name: text.reset });
  await user.click(
    within(dialog).getByRole("button", {
      name: text.resetConfirm,
    }),
  );
  await waitFor(() =>
    expect(
      calls.mock.calls.filter(([r]) => r.method === "account.deviceReset"),
    ).toHaveLength(1),
  );
});
it("requires a signed-in session before device reset", async () => {
  const calls = vi.spyOn(Client.prototype, "request");
  const user = mount();
  await user.click(await screen.findByRole("button", { name: text.logout }));
  await screen.findByRole("heading", { name: text.signedOut });
  const reset = screen.getByRole("button", { name: text.reset });
  expect(reset).toHaveProperty("disabled", true);
  const description = reset.getAttribute("aria-describedby");
  expect(description && document.getElementById(description)?.textContent).toBe(
    text.resetSignIn,
  );
  await user.click(reset);
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(
    calls.mock.calls.filter(([r]) => r.method === "account.deviceReset"),
  ).toHaveLength(0);
});
it("announces the selected Founders language and marks its copy", async () => {
  const user = mount("visual-dark:cuenta-base");
  for (const [label, lang] of [
    ["ES", "es"],
    ["EN", "en"],
    ["IT", "it"],
    ["PT-BR", "pt-BR"],
  ]) {
    const button = await screen.findByRole("button", {
      name: label,
    });
    await user.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("lang")).toBe(lang);
    expect(button.closest(".v-account-founders")?.getAttribute("lang")).toBe(
      lang,
    );
  }
});
it.each(["busy", "coreUnavailable"] as const)(
  "keeps logout %s visible, labels its ACK wait and clears error on new account data",
  async (kind) => {
    const original = Client.prototype.request;
    let rejectLogout: ((failure: unknown) => void) | undefined;
    let client: Client | undefined;
    const calls = vi
      .spyOn(Client.prototype, "request")
      .mockImplementation(function (this: Client, request, onSent) {
        client = this;
        if (request.method === "account.logout")
          return new Promise<Reply>((_resolve, reject) => {
            rejectLogout = reject;
          });
        return original.call(this, request, onSent);
      });
    const user = mount();
    await user.click(await screen.findByRole("button", { name: text.logout }));
    expect(
      await screen.findByRole("button", { name: text.loggingOut }),
    ).toHaveProperty("disabled", true);
    await act(async () => rejectLogout?.(new HostFailure({ kind })));
    const notice = kind === "busy" ? accessText.busy : accessText.logoutFailed;
    await screen.findByText(notice);
    expect(screen.queryByRole("heading", { name: text.signedOut })).toBeNull();
    expect(
      calls.mock.calls.filter(([r]) => r.method === "account.logout"),
    ).toHaveLength(1);
    await act(async () => {
      await client?.request({ method: "account.check" });
    });
    await waitFor(() => expect(screen.queryByText(notice)).toBeNull());
  },
);
it("ignores account replies received after the screen unmounts", async () => {
  const original = Client.prototype.request;
  let client: Client | undefined;
  let finish: ((reply: Reply) => void) | undefined;
  vi.spyOn(Client.prototype, "request").mockImplementation(function (
    this: Client,
    request,
    onSent,
  ) {
    client = this;
    if (request.method === "account.check")
      return new Promise<Reply>((resolve) => {
        finish = resolve;
      });
    return original.call(this, request, onSent);
  });
  const user = mount();
  await user.click(await screen.findByRole("button", { name: text.check }));
  const snapshot = await client?.request({ method: "account.get" });
  if (snapshot?.method !== "account.get") throw new Error("QA account missing");
  cleanup();
  await act(async () =>
    finish?.({ method: "account.check", value: snapshot.value }),
  );
  expect(screen.queryByRole("heading", { name: "Isaac Albalá" })).toBeNull();
  expect(document.querySelector(".v-account-page")).toBeNull();
  for (const cache of caches)
    expect(cache.getMutationCache().getAll()).toHaveLength(0);
});
it("shows a news read failure instead of reporting an empty feed and retries explicitly", async () => {
  const original = Client.prototype.request;
  let fail = true;
  const calls = vi
    .spyOn(Client.prototype, "request")
    .mockImplementation(function (this: Client, request, onSent) {
      if (request.method === "updates.get" && fail)
        return Promise.reject(new HostFailure({ kind: "coreUnavailable" }));
      return original.call(this, request, onSent);
    });
  const user = mount("cuenta-sesion", true);
  await screen.findByText(text.newsFailed);
  expect(screen.queryByText(text.noNews)).toBeNull();
  expect(
    calls.mock.calls.filter(([r]) => r.method === "updates.get"),
  ).toHaveLength(1);
  fail = false;
  await user.click(screen.getByRole("button", { name: text.reload }));
  await waitFor(() =>
    expect(caches[0].getQueryState(["account", "news"])?.status).toBe(
      "success",
    ),
  );
  expect(screen.queryByText(text.newsFailed)).toBeNull();
  expect(
    calls.mock.calls.filter(([r]) => r.method === "updates.get"),
  ).toHaveLength(2);
});

it("drops the reset confirmation when the account changes before confirmation", async () => {
  const original = Client.prototype.request;
  let client: Client | undefined;
  const calls = vi
    .spyOn(Client.prototype, "request")
    .mockImplementation(function (this: Client, request, onSent) {
      client = this;
      return original.call(this, request, onSent);
    });
  const user = mount();
  await user.click(await screen.findByRole("button", { name: text.reset }));
  await screen.findByRole("alertdialog");
  await act(async () => {
    await client?.request({ method: "account.logout" });
  });
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(screen.getByRole("button", { name: text.reset })).toHaveProperty(
    "disabled",
    true,
  );
  expect(
    calls.mock.calls.filter(([r]) => r.method === "account.deviceReset"),
  ).toHaveLength(0);
});
