import { accountLimits } from "../src/contract/generated/account";
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
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Reply, Request } from "../src/contract/generated/contract";
import { AccountGate } from "../src/renderer/app/AccountGate";
import { AccountProvider, useAccount } from "../src/renderer/app/AccountState";
import { HostProvider, useHost } from "../src/renderer/app/Host";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { accessText as text } from "../src/renderer/i18n/access.es";
import { windowText } from "../src/renderer/i18n/window.es";
import { ToastProvider, TooltipProvider } from "../src/renderer/ui/Layers";

const caches: QueryClient[] = [];
const original = Client.prototype.request;
type Intent = Exclude<Request, { method: "window.close" }>;
function intercept(handle: (request: Intent) => Promise<Reply> | undefined) {
  return vi.spyOn(Client.prototype, "request").mockImplementation(function (
    this: Client,
    request: Intent,
    onSent?: () => void,
  ) {
    const result = handle(request);
    if (result) {
      onSent?.();
      return result;
    }
    return original.call(this, request, onSent);
  });
}
function SessionActions() {
  const state = useAccount();
  return (
    <>
      <button
        type="button"
        onClick={() => void state.act({ method: "account.logout" })}
      >
        {text.retryLogout}
      </button>
      {state.error && <p role="status">{state.error}</p>}
    </>
  );
}
function Content() {
  return useHost().hello ? (
    <AccountProvider>
      <AccountGate>
        <h1>Hub</h1>
        <SessionActions />
      </AccountGate>
    </AccountProvider>
  ) : null;
}
function mount(scene = "acceso-base") {
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
it("requires an explicit intent and keeps Escape from bypassing the signed-out gate", async () => {
  const calls = intercept(() => undefined);
  const user = mount();
  await screen.findByRole("button", { name: text.google });
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("heading", { name: "Hub" })).toBeNull();
  expect(
    calls.mock.calls.filter(([r]) => r.method === "account.begin"),
  ).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: text.google }));
  await screen.findByText(text.waitingBrowser);
  expect(
    calls.mock.calls.filter(([r]) => r.method === "account.begin"),
  ).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: text.cancel }));
  await screen.findByRole("button", { name: text.google });
});
it("never automatically retries Busy and offers a manual retry", async () => {
  let attempts = 0;
  intercept((r) => {
    if (r.method === "account.begin") {
      attempts++;
      return Promise.reject(new HostFailure({ kind: "busy" }));
    }
    return undefined;
  });
  const user = mount();
  await user.click(await screen.findByRole("button", { name: text.google }));
  await screen.findByText(text.busy);
  expect(attempts).toBe(1);
  await user.click(screen.getByRole("button", { name: text.retry }));
  await waitFor(() => expect(screen.queryByText(text.busy)).toBeNull());
});
it("only submits email on explicit submit and clears the password before returning", async () => {
  const calls = intercept(() => undefined);
  const user = mount();
  await user.click(await screen.findByRole("button", { name: text.email }));
  await user.click(
    screen.getByRole("button", { name: text.modes.signInPassword }),
  );
  await user.type(screen.getByLabelText(text.emailLabel), "qa@example.invalid");
  const password = screen.getByLabelText(text.password);
  await user.type(password, "example");
  expect(
    calls.mock.calls.filter(
      ([r]) => r.method === "account.email" && r.action.action === "begin",
    ),
  ).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: text.submit.enter }));
  await screen.findByText(text.consent);
  await user.click(screen.getByRole("button", { name: text.back }));
  await screen.findByRole("button", { name: text.google });
  expect((password as HTMLInputElement).value).toBe("");
});
it("does not submit a complete six-digit code until the user confirms", async () => {
  const snapshots: Intent[] = [];
  const calls = intercept((request) => {
    snapshots.push(structuredClone(request));
    return undefined;
  });
  const user = mount("email-codigo");
  const first = await screen.findByRole("textbox", {
    name: text.codeDigit(1, accountLimits.code),
  });
  await user.type(first, "123456");
  expect(
    calls.mock.calls.filter(
      ([r]) => r.method === "account.email" && r.action.action === "verify",
    ),
  ).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: text.submit.verify }));
  await screen.findByText(text.consent);
  const sent = snapshots.find(
    (r) => r.method === "account.email" && r.action.action === "verify",
  );
  expect(sent).toEqual({
    method: "account.email",
    action: { action: "verify", code: "123456" },
  });
});
it("surfaces a failed initial read without a dead end", async () => {
  intercept((r) =>
    r.method === "account.get"
      ? Promise.reject(new HostFailure({ kind: "coreUnavailable" }))
      : undefined,
  );
  mount();
  await screen.findByText(text.failed);
  expect(screen.getByRole("button", { name: text.retry })).toBeTruthy();
});

it("cancels an active email request and ignores its later failure", async () => {
  let rejectLate: ((reason: unknown) => void) | undefined;
  const calls = intercept((request) =>
    request.method === "account.email" && request.action.action === "begin"
      ? new Promise<Reply>((_resolve, reject) => {
          rejectLate = reject;
        })
      : undefined,
  );
  const user = mount();
  await user.click(await screen.findByRole("button", { name: text.email }));
  await user.type(screen.getByLabelText(text.emailLabel), "qa@example.invalid");
  await user.click(screen.getByRole("button", { name: text.submit.continue }));
  await screen.findByRole("button", { name: text.submit.waiting });
  await user.click(screen.getByRole("button", { name: text.back }));
  await screen.findByRole("button", { name: text.google });
  await act(async () => {
    rejectLate?.(new HostFailure({ kind: "denied" }));
  });
  expect(screen.queryByText(text.failed)).toBeNull();
  expect(
    calls.mock.calls.filter(
      ([r]) => r.method === "account.email" && r.action.action === "cancel",
    ),
  ).toHaveLength(1);
});
it("clears a rejected code and never starts browser login for an email error", async () => {
  const calls = intercept((request) =>
    request.method === "account.email" && request.action.action === "verify"
      ? Promise.reject(new HostFailure({ kind: "busy" }))
      : undefined,
  );
  const user = mount("email-codigo");
  await user.type(
    await screen.findByRole("textbox", {
      name: text.codeDigit(1, accountLimits.code),
    }),
    "123456",
  );
  await user.click(screen.getByRole("button", { name: text.submit.verify }));
  await screen.findByText(text.reenterCode);
  expect(
    (
      screen.getByRole("textbox", {
        name: text.codeDigit(1, accountLimits.code),
      }) as HTMLInputElement
    ).value,
  ).toBe("");
  await user.click(screen.getByRole("button", { name: text.retry }));
  await waitFor(() => expect(screen.queryByText(text.reenterCode)).toBeNull());
  expect(
    calls.mock.calls.filter(
      ([r]) => r.method === "account.retry" || r.method === "account.begin",
    ),
  ).toHaveLength(0);
});

it("describes a transport failure during logout as unconfirmed rather than not executed", async () => {
  intercept((request) =>
    request.method === "account.logout"
      ? Promise.reject(new HostFailure({ kind: "coreUnavailable" }))
      : undefined,
  );
  const user = mount("ajustes-base");
  await user.click(
    await screen.findByRole("button", { name: text.retryLogout }),
  );
  await screen.findByRole("status");
  expect(screen.getByRole("status").textContent).toBe(text.logoutFailed);
});
it("does not duplicate cancellation on a rapid double click", async () => {
  let rejectBegin: ((reason: unknown) => void) | undefined;
  let rejectCancel: ((reason: unknown) => void) | undefined;
  const calls = intercept((request) => {
    if (request.method !== "account.email") return undefined;
    if (request.action.action === "begin")
      return new Promise<Reply>((_resolve, reject) => {
        rejectBegin = reject;
      });
    if (request.action.action === "cancel")
      return new Promise<Reply>((_resolve, reject) => {
        rejectCancel = reject;
      });
    return undefined;
  });
  const user = mount();
  await user.click(await screen.findByRole("button", { name: text.email }));
  await user.type(screen.getByLabelText(text.emailLabel), "qa@example.invalid");
  await user.click(screen.getByRole("button", { name: text.submit.continue }));
  await screen.findByRole("button", { name: text.submit.waiting });
  await user.dblClick(screen.getByRole("button", { name: text.back }));
  expect(
    calls.mock.calls.filter(
      ([r]) => r.method === "account.email" && r.action.action === "cancel",
    ),
  ).toHaveLength(1);
  await act(async () => {
    rejectCancel?.(new HostFailure({ kind: "coreUnavailable" }));
    rejectBegin?.(new HostFailure({ kind: "denied" }));
  });
});

it("keeps an incomplete code and disables verification without sending", async () => {
  const calls = intercept(() => undefined);
  const user = mount("email-codigo");
  const first = await screen.findByRole("textbox", {
    name: text.codeDigit(1, accountLimits.code),
  });
  await user.type(first, "123");
  const button = screen.getByRole("button", { name: text.submit.verify });
  expect(button).toHaveProperty("disabled", true);
  fireEvent.submit(first.closest("form")!);
  expect(
    calls.mock.calls.filter(
      ([r]) => r.method === "account.email" && r.action.action === "verify",
    ),
  ).toHaveLength(0);
  const group = screen.getByRole("group", { name: text.code });
  expect(
    within(group)
      .getAllByRole("textbox")
      .map((node) => (node as HTMLInputElement).value)
      .join(""),
  ).toBe("123");
});
it("keeps window controls reachable by keyboard from the access gate", async () => {
  const user = mount();
  const first = await screen.findByRole("button", { name: text.google });
  await waitFor(() => expect(document.activeElement).toBe(first));
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: windowText.close }),
  );
});
it("does not interpret Escape in the email form as cancel or submit", async () => {
  const calls = intercept(() => undefined);
  const user = mount();
  await user.click(await screen.findByRole("button", { name: text.email }));
  const field = screen.getByLabelText(text.emailLabel);
  await user.type(field, "qa@example.invalid");
  await user.keyboard("{Escape}");
  expect(screen.getByLabelText(text.emailLabel)).toBe(field);
  expect(
    calls.mock.calls.filter(
      ([r]) => r.method === "account.email" && r.action.action !== "open",
    ),
  ).toHaveLength(0);
});

it("clears the submitted code even in the object retained by the request observer", async () => {
  const calls = intercept(() => undefined);
  const user = mount("email-codigo");
  await user.type(
    await screen.findByRole("textbox", {
      name: text.codeDigit(1, accountLimits.code),
    }),
    "123456",
  );
  await user.click(screen.getByRole("button", { name: text.submit.verify }));
  await screen.findByText(text.consent);
  const sent = calls.mock.calls
    .map(([request]) => request)
    .find(
      (request) =>
        request.method === "account.email" &&
        request.action.action === "verify",
    );
  expect(sent).toEqual({
    method: "account.email",
    action: { action: "verify", code: "" },
  });
});
it("wipes detached password inputs when the form is unmounted", async () => {
  const user = mount();
  await user.click(await screen.findByRole("button", { name: text.email }));
  await user.click(
    screen.getByRole("button", { name: text.modes.signInPassword }),
  );
  const input = screen.getByLabelText(text.password) as HTMLInputElement;
  await user.type(input, "example");
  expect(input.value).toBe("example");
  cleanup();
  expect(input.value).toBe("");
});

it("discards a password before the pending RPC replies and never caches it", async () => {
  let rejectPending: ((reason: unknown) => void) | undefined;
  const calls = intercept((request) =>
    request.method === "account.email" && request.action.action === "begin"
      ? new Promise<Reply>((_resolve, reject) => {
          rejectPending = reject;
        })
      : undefined,
  );
  const user = mount();
  await user.click(await screen.findByRole("button", { name: text.email }));
  await user.click(
    screen.getByRole("button", { name: text.modes.signInPassword }),
  );
  await user.type(screen.getByLabelText(text.emailLabel), "qa@example.invalid");
  const marker = `qa-form-only-${crypto.randomUUID()}`;
  const input = screen.getByLabelText(text.password) as HTMLInputElement;
  await user.type(input, marker);
  await user.click(screen.getByRole("button", { name: text.submit.enter }));
  await screen.findByRole("button", { name: text.submit.waiting });
  expect(input.value).toBe("");
  const request = calls.mock.calls
    .map(([request]) => request)
    .find(
      (request) =>
        request.method === "account.email" && request.action.action === "begin",
    );
  expect(
    request?.method === "account.email" && request.action.action === "begin"
      ? request.action.password
      : undefined,
  ).toBe("");
  const data = caches.flatMap((cache) =>
    cache
      .getQueryCache()
      .getAll()
      .map((query) => query.state.data),
  );
  const variables = caches.flatMap((cache) =>
    cache
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.state.variables),
  );
  expect(JSON.stringify({ data, variables })).not.toContain(marker);
  await act(async () => {
    rejectPending?.(new HostFailure({ kind: "busy" }));
  });
});
