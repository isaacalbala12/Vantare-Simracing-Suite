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
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  AccountView,
  HostToUi,
  PrivacyView,
} from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus.json";
import {
  AccountSessionContext,
  createAccountSession,
} from "../src/renderer/app/AccountSession";
import { coreKey, offline } from "../src/renderer/app/Host";
import { privacyText as text } from "../src/renderer/i18n/privacy.es";
import { Privacy } from "../src/renderer/screens/settings/Privacy";

const fake = vi.hoisted(() => ({
  client: { request: vi.fn(), addCloseGuard: () => () => {} },
}));
vi.mock("../src/renderer/app/Host", async (original) => ({
  ...(await original<typeof import("../src/renderer/app/Host")>()),
  useHost: () => ({ client: fake.client }),
}));
let session: ReturnType<typeof createAccountSession>;
let cache: QueryClient;
function confirm() {
  session.confirm({
    session: "signedIn",
    gate: "none",
    blocked: false,
  } as AccountView);
}
beforeEach(() => {
  session = createAccountSession();
  confirm();
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  cache.setQueryData(coreKey, {
    ...offline,
    services: "connected",
    access: { ...offline.access, verified: true },
  });
  const sample = (corpus.host as HostToUi[]).find(
    (m) => m.kind === "response" && m.result.method === "privacy.get",
  );
  if (sample?.kind !== "response" || sample.result.method !== "privacy.get")
    throw Error("missing privacy fixture");
  const privacy: PrivacyView = {
    ...sample.result.value,
    protected: false,
    cleanupPending: false,
  };
  fake.client.request
    .mockReset()
    .mockImplementation(async (r) =>
      r.method === "privacy.get"
        ? { method: r.method, value: privacy }
        : { method: r.method, value: { consent: r.consent ?? false } },
    );
});
afterEach(() => {
  cleanup();
  cache.clear();
});
function mount() {
  return render(
    <QueryClientProvider client={cache}>
      <AccountSessionContext.Provider value={session}>
        <CSPProvider disableStyleElements>
          <Privacy />
        </CSPProvider>
      </AccountSessionContext.Provider>
    </QueryClientProvider>,
  );
}
async function loaded() {
  await screen.findByText(text.optional);
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: text.enable })
        .getAttribute("aria-disabled"),
    ).not.toBe("true"),
  );
}
function nextAccount() {
  act(() => {
    session.invalidate();
    confirm();
  });
}
it("does not retain A's saved consent in B while verified remains true", async () => {
  const original = fake.client.request.getMockImplementation();
  fake.client.request.mockImplementationOnce(async (r) => original?.(r));
  fake.client.request.mockImplementationOnce(async () => ({
    method: "mail.get",
    value: { consent: true },
  }));
  mount();
  await screen.findByRole("button", { name: text.disable });
  nextAccount();
  await loaded();
  expect(screen.queryByRole("button", { name: text.disable })).toBeNull();
  expect(cache.getQueriesData({ queryKey: ["mail", 0] })).toEqual([]);
});
it.each(["mail.get", "mail.set"])(
  "ignores a late %s from A without exposing its choice or retry in B",
  async (method) => {
    let resolve!: (reply: unknown) => void;
    const original = fake.client.request.getMockImplementation();
    if (!original) throw Error("missing host");
    if (method === "mail.get")
      fake.client.request.mockImplementation((r) =>
        r.method === method
          ? new Promise((done) => {
              resolve = done;
            })
          : original(r),
      );
    mount();
    if (method === "mail.set") {
      await loaded();
      fake.client.request.mockImplementation((r) =>
        r.method === method
          ? new Promise((done) => {
              resolve = done;
            })
          : original(r),
      );
      fireEvent.click(screen.getByRole("button", { name: text.enable }));
    }
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    fake.client.request.mockImplementation(original);
    nextAccount();
    await loaded();
    await act(async () => {
      resolve({ method, value: { consent: true } });
    });
    expect(screen.getByRole("button", { name: text.enable })).toBeTruthy();
    expect(screen.queryByRole("button", { name: text.disable })).toBeNull();
    expect(screen.queryByRole("button", { name: text.retry })).toBeNull();
    expect(cache.getQueriesData({ queryKey: ["mail", 0] })).toEqual([]);
  },
);
it("prevents mail reads and writes while account confirmation is absent", async () => {
  session.invalidate();
  mount();
  const enable = await screen.findByRole("button", { name: text.enable });
  expect(enable.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(enable);
  expect(
    fake.client.request.mock.calls.some(([r]) => r.method.startsWith("mail.")),
  ).toBe(false);
  act(confirm);
  await loaded();
});
