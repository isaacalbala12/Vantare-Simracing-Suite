// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CloseReason,
  type CoreStatus,
  type Reply,
  reportAutosaveMs,
  reportFieldLimits,
} from "../src/contract/generated/contract";
import { AccountProvider, useAccount } from "../src/renderer/app/AccountState";
import { coreKey, HostProvider } from "../src/renderer/app/Host";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { closeUnsavedReportText as closeDialog } from "../src/renderer/i18n/testing-discard";
import { testingText as text } from "../src/renderer/screens/testing/es";
import {
  ReportsProvider,
  useReports,
} from "../src/renderer/screens/testing/ReportsState";
import { ToastProvider, ToastViewport } from "../src/renderer/ui/Layers";

const caches: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const cache of caches) cache.clear();
  caches.length = 0;
  window.history.replaceState(null, "", "/");
});
async function mount(scene = "testing-reports") {
  window.history.replaceState(null, "", `/?escena=${scene}`);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  caches.push(cache);
  let client: Client | undefined;
  let peer: MessagePort | undefined;
  const RealMessageChannel = globalThis.MessageChannel;
  vi.stubGlobal(
    "MessageChannel",
    class extends RealMessageChannel {
      constructor() {
        super();
        peer = this.port2;
      }
    },
  );
  const original = Client.prototype.addCloseGuard;
  vi.spyOn(Client.prototype, "addCloseGuard").mockImplementation(function (
    this: Client,
    value,
  ) {
    client = this;
    return original.call(this, value);
  });
  let account: ReturnType<typeof useAccount> | undefined;
  const hook = renderHook(
    () => {
      account = useAccount();
      return useReports();
    },
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={cache}>
          <HostProvider>
            <ToastProvider>
              <AccountProvider>
                <ReportsProvider>
                  {children}
                  <ToastViewport closeLabel="Cerrar" />
                </ReportsProvider>
              </AccountProvider>
            </ToastProvider>
          </HostProvider>
        </QueryClientProvider>
      ),
    },
  );
  await waitFor(() => expect(hook.result.current.available).toBe(true));
  await act(async () => {
    await hook.result.current.load();
  });
  if (!client || !peer) throw new Error("missing report port");
  return {
    ...hook,
    cache,
    account: () => {
      if (!account) throw new Error("missing account");
      return account;
    },
    host: peer,
    connection: client,
    close: (reason: CloseReason): Promise<boolean> => {
      if (!client || !peer) throw new Error("missing report port");
      const connected = client;
      return new Promise((resolve) => {
        const send = connected.send.bind(connected);
        const capture = vi
          .spyOn(connected, "send")
          .mockImplementation((value) => {
            send(value);
            if (value.kind === "closeAnswer") {
              capture.mockRestore();
              resolve(value.allow);
            }
          });
        peer?.postMessage({ kind: "closeRequested", reason });
      });
    },
  };
}
describe("protected report draft behavior", () => {
  it.each([
    ["testing-legacy-archived", "archived"],
    ["testing-legacy-imported", "imported"],
    ["testing-legacy-trimmed", "importedTrimmed"],
    ["testing-legacy-preserved", "preserved"],
  ] as const)(
    "retains the closed migration notice from %s after saving",
    async (scene, legacy) => {
      const hook = await mount(scene);
      expect(hook.result.current.legacy).toBe(legacy);
      act(() => hook.result.current.edit({ actionText: "Texto nuevo" }));
      await act(async () => {
        await hook.result.current.save();
      });
      expect(hook.result.current.legacy).toBe(legacy);
    },
  );
  it("rejects oversized private text before the bridge and keeps the editor intact", async () => {
    const hook = await mount();
    const calls = vi.spyOn(Client.prototype, "request");
    const actionText = "ñ".repeat(Math.floor(reportFieldLimits[0] / 2) + 1);
    act(() => hook.result.current.edit({ actionText }));
    await act(async () => {
      await expect(hook.result.current.save()).rejects.toMatchObject({
        detail: { kind: "rejected" },
      });
    });
    expect(calls).not.toHaveBeenCalled();
    expect(hook.result.current.fields.actionText).toBe(actionText);
    expect(hook.result.current.dirty).toBe(true);
  });
  it("requires a new review after a rejected send while preserving the protected fields", async () => {
    const hook = await mount("testing-send-error");
    act(() =>
      hook.result.current.edit({
        actionText: "Acción",
        expectedText: "Esperado",
        observedText: "Resultado",
      }),
    );
    await act(async () => {
      await hook.result.current.prepare();
    });
    act(() => hook.result.current.setConsent(true));
    await act(async () => {
      await expect(hook.result.current.send()).rejects.toBeDefined();
    });
    expect(hook.result.current.preview).toBeUndefined();
    expect(hook.result.current.consent).toBe(false);
    expect(hook.result.current.fields.actionText).toBe("Acción");
    expect(hook.result.current.dirty).toBe(false);
    expect(hook.result.current.receipt).toBeUndefined();
  });
  it("debounces two seconds after the latest edit and saves that exact snapshot", async () => {
    const hook = await mount();
    const calls: unknown[] = [];
    const original = Client.prototype.request;
    vi.spyOn(Client.prototype, "request").mockImplementation(async function (
      this: Client,
      request,
    ) {
      if (request.method !== "draft.save") return original.call(this, request);
      calls.push(request.fields);
      return {
        method: "draft.save",
        value: {
          fields: request.fields,
          legacy: "none",
          exists: true,
          screenshots: [],
          message: "",
        },
      };
    });
    vi.useFakeTimers();
    act(() => hook.result.current.edit({ actionText: "Primera nota" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(reportAutosaveMs / 2);
    });
    act(() => hook.result.current.edit({ actionText: "Última nota" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(reportAutosaveMs - 1);
    });
    expect(calls).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(calls).toMatchObject([{ actionText: "Última nota" }]);
    expect(hook.result.current.dirty).toBe(false);
  });
  it("preserves a failed save, explains close vetoes and permits Live", async () => {
    const hook = await mount("testing-save-error");
    act(() => hook.result.current.edit({ actionText: "Conservar esta nota" }));
    await act(async () => {
      await expect(hook.result.current.save()).rejects.toBeDefined();
    });
    expect(hook.result.current.fields.actionText).toBe("Conservar esta nota");
    expect(hook.result.current.error).toBe(true);
    let allow = true;
    await act(async () => {
      allow = await hook.close("window");
    });
    expect(allow).toBe(false);
    expect(hook.result.current.message).toContain("sin guardar");
    await act(async () => {
      allow = await hook.close("restart");
    });
    expect(allow).toBe(false);
    await act(async () => {
      allow = await hook.close("live");
    });
    expect(allow).toBe(true);
  });
  it("receives closeRequested through the real port, never saves in the guard, and flushes on blur", async () => {
    const hook = await mount();
    act(() =>
      hook.result.current.edit({ actionText: "Último cambio antes de cerrar" }),
    );
    const requests = vi.spyOn(Client.prototype, "request");
    let allow = true;
    await act(async () => {
      allow = await hook.close("window");
    });
    expect(allow).toBe(false);
    expect(requests).not.toHaveBeenCalled();
    expect(screen.getByText(text.closeUnsaved)).toBeDefined();
    expect(hook.result.current.message).toContain("sin guardar");
    act(() => window.dispatchEvent(new Event("blur")));
    await waitFor(() => expect(hook.result.current.dirty).toBe(false));
    requests.mockClear();
    await act(async () => {
      allow = await hook.close("restart");
    });
    expect(allow).toBe(true);
    expect(requests).not.toHaveBeenCalled();
  });
  it("keeps local contribution notes out of the protected fields and later structured preview", async () => {
    const hook = await mount();
    act(() =>
      hook.result.current.editLocal({
        title: "LOCAL_PRIVATE_TITLE",
        body: "LOCAL_PRIVATE_BODY",
      }),
    );
    expect(hook.result.current.dirty).toBe(false);
    expect(hook.result.current.fields.actionText).not.toContain(
      "LOCAL_PRIVATE",
    );
    act(() =>
      hook.result.current.edit({
        actionText: "Acción",
        expectedText: "Esperado",
        observedText: "Resultado",
      }),
    );
    await act(async () => {
      await hook.result.current.prepare();
    });
    expect(JSON.stringify(hook.result.current.preview)).not.toContain(
      "LOCAL_PRIVATE",
    );
  });
  it("serializes two immediate send calls into a single submission", async () => {
    const hook = await mount();
    act(() =>
      hook.result.current.edit({
        actionText: "Acción",
        expectedText: "Esperado",
        observedText: "Resultado",
      }),
    );
    await act(async () => {
      await hook.result.current.prepare();
    });
    act(() => hook.result.current.setConsent(true));
    const calls = vi.spyOn(Client.prototype, "request");
    await act(async () => {
      await Promise.all([
        hook.result.current.send(),
        hook.result.current.send(),
      ]);
    });
    expect(
      calls.mock.calls.filter(([request]) => request.method === "report.send"),
    ).toHaveLength(1);
    expect(hook.result.current.receipt).toBeDefined();
  });
  it.each(["testing.refresh", "report.prepare"] as const)(
    "retries the failed %s operation rather than a clean save",
    async (method) => {
      const hook = await mount("testing-tester");
      const original = Client.prototype.request;
      let failed = false;
      const calls = vi
        .spyOn(Client.prototype, "request")
        .mockImplementation(function (this: Client, request) {
          if (request.method === method && !failed) {
            failed = true;
            return Promise.reject(new Error("local failure"));
          }
          return original.call(this, request);
        });
      if (method === "report.prepare")
        act(() =>
          hook.result.current.edit({
            actionText: "Acción",
            expectedText: "Esperado",
            observedText: "Resultado",
          }),
        );
      await act(async () => {
        await expect(
          method === "testing.refresh"
            ? hook.result.current.refresh()
            : hook.result.current.prepare(),
        ).rejects.toBeDefined();
      });
      await act(async () => {
        await hook.result.current.retry();
      });
      expect(
        calls.mock.calls.filter(([request]) => request.method === method),
      ).toHaveLength(2);
      expect(hook.result.current.error).toBe(false);
      if (method === "report.prepare")
        expect(hook.result.current.preview).toBeDefined();
    },
  );
  it("invalidates preview and consent when its fields change", async () => {
    const hook = await mount();
    act(() =>
      hook.result.current.edit({
        actionText: "Acción",
        expectedText: "Esperado",
        observedText: "Resultado",
      }),
    );
    await act(async () => {
      await hook.result.current.prepare();
    });
    expect(hook.result.current.preview?.fields.actionText).toBe(
      "Informe estructurado",
    );
    act(() => hook.result.current.setConsent(true));
    act(() => hook.result.current.edit({ actionText: "Otro contenido" }));
    expect(hook.result.current.preview).toBeUndefined();
    expect(hook.result.current.consent).toBe(false);
    await act(async () => {
      await hook.result.current.send();
    });
    expect(hook.result.current.receipt).toBeUndefined();
  });
});

it("resets busy on account loss and ignores the old in-flight reply", async () => {
  const hook = await mount("testing-tester");
  const original = Client.prototype.request;
  let deliver: ((reply: Reply) => void) | undefined;
  vi.spyOn(Client.prototype, "request").mockImplementation(function (
    this: Client,
    request,
  ) {
    return request.method === "testing.refresh"
      ? new Promise((resolve) => {
          deliver = resolve;
        })
      : original.call(this, request);
  });
  let pending: Promise<unknown>;
  act(() => {
    pending = hook.result.current.refresh().catch((error) => error);
  });
  await waitFor(() => expect(hook.result.current.busy).toBe(true));
  const core = hook.cache.getQueryData<CoreStatus>(coreKey);
  if (!core || !deliver) throw new Error("missing fixture");
  act(() =>
    hook.cache.setQueryData(coreKey, {
      ...core,
      access: { ...core.access, verified: false },
    }),
  );
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  await act(async () => {
    deliver?.({
      method: "testing.refresh",
      value: { reports: [], questionnaires: [] },
    });
    await pending;
  });
  expect(hook.result.current.busy).toBe(false);
  expect(hook.result.current.loaded).toBe(false);
});
it("flushes a draft when the document becomes hidden before a close request", async () => {
  const hook = await mount();
  act(() => hook.result.current.edit({ actionText: "Guardar al ocultarse" }));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await waitFor(() => expect(hook.result.current.dirty).toBe(false));
});

it("waits for an already dispatched save before answering close through the port", async () => {
  const hook = await mount();
  const port = hook.host;
  const receive = port.onmessage;
  if (!receive) throw new Error("missing local host");
  let held: MessageEvent | undefined;
  port.onmessage = (event) => {
    if (
      event.data.kind === "request" &&
      event.data.request.method === "draft.save"
    )
      held = event;
    else receive.call(port, event);
  };
  act(() => hook.result.current.edit({ actionText: "Guardado ya en vuelo" }));
  let saving!: Promise<void>;
  act(() => {
    saving = hook.result.current.save();
  });
  await waitFor(() => expect(held).toBeDefined());
  const requested = new Promise<void>((resolve) =>
    hook.connection.listen((message) => {
      if (message.kind === "closeRequested") resolve();
    }),
  );
  let answered = false;
  const closing = hook.close("window").then((allow) => {
    answered = true;
    return allow;
  });
  await requested;
  expect(answered).toBe(false);
  await act(async () => {
    if (!held) throw new Error("missing held save");
    receive.call(port, held);
    await saving;
    expect(await closing).toBe(true);
  });
  expect(hook.result.current.dirty).toBe(false);
});

async function failedCloseDraft() {
  const hook = await mount();
  act(() =>
    hook.result.current.edit({ actionText: "Borrador protegido anterior" }),
  );
  await act(async () => {
    await hook.result.current.save();
  });
  const original = hook.connection.request.bind(hook.connection);
  const requests = vi
    .spyOn(hook.connection, "request")
    .mockImplementation((request) =>
      request.method === "draft.save"
        ? Promise.reject(new HostFailure({ kind: "coreUnavailable" }))
        : original(request),
    );
  act(() =>
    hook.result.current.edit({
      actionText: "Último texto todavía sin guardar",
    }),
  );
  for (let attempt = 0; attempt < 2; attempt++)
    await act(async () => {
      await expect(hook.result.current.save()).rejects.toMatchObject({
        detail: { kind: "coreUnavailable" },
      });
    });
  const previous = await original({ method: "draft.load" });
  expect(previous).toMatchObject({
    method: "draft.load",
    value: { fields: { actionText: "Borrador protegido anterior" } },
  });
  const core = hook.cache.getQueryData<CoreStatus>(coreKey);
  if (!core) throw new Error("missing core");
  act(() =>
    hook.cache.setQueryData(coreKey, { ...core, services: "unavailable" }),
  );
  let allowed = true;
  await act(async () => {
    allowed = await hook.close("window");
  });
  expect(allowed).toBe(false);
  requests.mockClear();
  return { hook, requests };
}
it("clears the unsaved-close permission even if an earlier guard throws before the report guard runs", async () => {
  const { hook, requests } = await failedCloseDraft();
  hook.connection.setCloseGuard(() => {
    throw new Error("another section veto");
  });
  fireEvent.click(screen.getByRole("button", { name: text.closeWithoutSave }));
  const popup = await screen.findByRole("alertdialog", {
    name: closeDialog.title,
  });
  const vetoed = new Promise<void>((resolve) =>
    hook.connection.onCloseVeto(() => resolve()),
  );
  fireEvent.click(
    within(popup).getByRole("button", { name: closeDialog.confirm }),
  );
  await act(async () => {
    await vetoed;
  });
  hook.connection.setCloseGuard(() => true);
  await act(async () => {
    expect(await hook.close("window")).toBe(false);
  });
  expect(requests).not.toHaveBeenCalled();
});
it("clears a confirmed permission when control EOF bypasses the report close guard", async () => {
  const { hook, requests } = await failedCloseDraft();
  vi.spyOn(hook.connection, "closeWindow").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: text.closeWithoutSave }));
  const popup = await screen.findByRole("alertdialog", {
    name: closeDialog.title,
  });
  fireEvent.click(
    within(popup).getByRole("button", { name: closeDialog.confirm }),
  );
  await act(async () => {
    expect(await hook.close("controlEof")).toBe(true);
  });
  await act(async () => {
    expect(await hook.close("window")).toBe(false);
  });
  expect(requests).not.toHaveBeenCalled();
});
it("offers a confirmed exit after persistent save failure without changing the protected draft", async () => {
  const { hook, requests } = await failedCloseDraft();
  const sent = vi.spyOn(hook.connection, "send");
  fireEvent.click(screen.getByRole("button", { name: text.closeWithoutSave }));
  let popup = await screen.findByRole("alertdialog", {
    name: closeDialog.title,
  });
  fireEvent.click(
    within(popup).getByRole("button", { name: closeDialog.cancel }),
  );
  expect(hook.result.current.fields.actionText).toBe(
    "Último texto todavía sin guardar",
  );
  expect(hook.result.current.dirty).toBe(true);
  expect(sent).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: text.closeWithoutSave }));
  popup = await screen.findByRole("alertdialog", { name: closeDialog.title });
  fireEvent.click(
    within(popup).getByRole("button", { name: closeDialog.confirm }),
  );
  await waitFor(() =>
    expect(
      sent.mock.calls.some(
        ([message]) => message.kind === "closeAnswer" && message.allow,
      ),
    ).toBe(true),
  );
  expect(
    sent.mock.calls.filter(([message]) => message.kind === "request"),
  ).toEqual([
    [{ kind: "request", id: 0, request: { method: "window.close" } }],
  ]);
  expect(requests).not.toHaveBeenCalled();
  expect(hook.result.current.dirty).toBe(true);
});
it("does not override another section's veto or retain permission for a later close", async () => {
  const { hook, requests } = await failedCloseDraft();
  const release = hook.connection.addCloseGuard(() => false);
  const sent = vi.spyOn(hook.connection, "send");
  fireEvent.click(screen.getByRole("button", { name: text.closeWithoutSave }));
  const popup = await screen.findByRole("alertdialog", {
    name: closeDialog.title,
  });
  fireEvent.click(
    within(popup).getByRole("button", { name: closeDialog.confirm }),
  );
  await waitFor(() =>
    expect(
      sent.mock.calls.some(
        ([message]) => message.kind === "closeAnswer" && !message.allow,
      ),
    ).toBe(true),
  );
  release();
  sent.mockRestore();
  let allowed = true;
  await act(async () => {
    allowed = await hook.close("window");
  });
  expect(allowed).toBe(false);
  expect(requests).not.toHaveBeenCalled();
  expect(hook.result.current.fields.actionText).toBe(
    "Último texto todavía sin guardar",
  );
});

it("closes normally if a veto notice is clicked after the draft was saved", async () => {
  const hook = await mount();
  act(() =>
    hook.result.current.edit({ actionText: "Guardado después del aviso" }),
  );
  await act(async () => {
    expect(await hook.close("window")).toBe(false);
  });
  await act(async () => {
    await hook.result.current.save();
  });
  const sent = vi.spyOn(hook.connection, "send");
  fireEvent.click(screen.getByRole("button", { name: text.closeWithoutSave }));
  await waitFor(() =>
    expect(
      sent.mock.calls.some(
        ([message]) => message.kind === "closeAnswer" && message.allow,
      ),
    ).toBe(true),
  );
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
it("keeps deduplicated session receipts across edits without retaining private prose", async () => {
  const hook = await mount();
  for (const title of ["Primer título", "Otro intento"]) {
    act(() =>
      hook.result.current.edit({
        actionText: title,
        module: "hub",
        expectedText: "EXPECT_PRIVATE",
        observedText: "OBSERVED_PRIVATE",
        contextText: "CONTEXT_PRIVATE",
      }),
    );
    await act(async () => {
      await hook.result.current.prepare();
    });
    act(() => hook.result.current.setConsent(true));
    await act(async () => {
      await hook.result.current.send();
    });
  }
  expect(hook.result.current.sessionReceipts).toHaveLength(1);
  expect(hook.result.current.sessionReceipts[0].title).toBe("Primer título");
  act(() => hook.result.current.edit({ actionText: "Borrador siguiente" }));
  expect(hook.result.current.receipt).toBeUndefined();
  expect(hook.result.current.sessionReceipts).toHaveLength(1);
  expect(JSON.stringify(hook.result.current.sessionReceipts)).not.toMatch(
    /EXPECT_PRIVATE|OBSERVED_PRIVATE|CONTEXT_PRIVATE/,
  );
});

async function seedSessionA(hook: Awaited<ReturnType<typeof mount>>) {
  act(() =>
    hook.result.current.edit({
      actionText: "PRIVATE_A",
      expectedText: "Esperado",
      observedText: "Resultado",
      contextText: "LOCAL_CONTEXT_A",
    }),
  );
  await act(async () => {
    await hook.result.current.prepare();
  });
  act(() => hook.result.current.setConsent(true));
  await act(async () => {
    await hook.result.current.send();
    await hook.result.current.refresh();
  });
  act(() => {
    hook.result.current.edit({
      actionText: "PRIVATE_DRAFT_A",
      expectedText: "Esperado",
      observedText: "Resultado",
    });
    hook.result.current.editLocal({
      title: "LOCAL_NOTE_A",
      body: "LOCAL_BODY_A",
    });
    hook.result.current.triage.editTitle("TRIAGE_A");
    hook.result.current.triage.editBody("TRIAGE_BODY_A");
    hook.result.current.triage.accept(true);
  });
  await act(async () => {
    await hook.result.current.prepare();
    await hook.result.current.triage.prepareReport();
  });
  const draftFields = structuredClone(hook.result.current.fields);
  const originalLoad = Client.prototype.request;
  const draft = vi
    .spyOn(Client.prototype, "request")
    .mockImplementation(function (this: Client, request) {
      return request.method === "draft.load"
        ? Promise.resolve({
            method: "draft.load",
            value: {
              fields: draftFields,
              legacy: "none",
              exists: true,
              screenshots: [
                {
                  id: "c".repeat(64),
                  jpeg: "/9j/",
                  width: 1,
                  height: 1,
                  byteSize: 3,
                },
              ],
              message: "",
            },
          } as Reply)
        : originalLoad.call(this, request);
    });
  await act(async () => {
    await hook.result.current.load();
  });
  draft.mockRestore();
  await act(async () => {
    await hook.result.current.prepare();
  });
  expect(hook.result.current.screenshots).toHaveLength(1);
  act(() => {
    hook.result.current.setConsent(true);
    hook.result.current.triage.accept(true);
    hook.result.current.setAnswerDraft({
      id: "question_A",
      score: 4,
      note: "QUESTION_NOTE_A",
    });
  });
  expect(hook.result.current.sessionReceipts.length).toBeGreaterThan(0);
  expect(hook.result.current.preview).toBeDefined();
}
function expectSessionEmpty(hook: Awaited<ReturnType<typeof mount>>) {
  expect(hook.result.current.fields.actionText).toBe("");
  expect(hook.result.current.localNotes).toEqual({ title: "", body: "" });
  expect(hook.result.current.loaded).toBe(false);
  expect(hook.result.current.screenshots).toEqual([]);
  expect(hook.result.current.preview).toBeUndefined();
  expect(hook.result.current.consent).toBe(false);
  expect(hook.result.current.receipt).toBeUndefined();
  expect(hook.result.current.sessionReceipts).toEqual([]);
  expect(hook.result.current.participation).toEqual({
    reports: [],
    questionnaires: [],
  });
  expect(hook.result.current.participationLoaded).toBe(false);
  expect(hook.result.current.answerDraft).toEqual({ score: 3, note: "" });
  expect(hook.result.current.triage.title).toBe("");
  expect(hook.result.current.triage.body).toBe("");
  expect(hook.result.current.triage.preview).toBeUndefined();
  expect(hook.result.current.triage.consent).toBe(false);
}
it.each([
  "account.begin",
  "account.logout",
  "account.cancel",
  "account.email",
] as const)(
  "%s synchronously clears A before dispatch without verified=false",
  async (method) => {
    const hook = await mount("testing-tester-reports");
    await seedSessionA(hook);
    const before = hook.cache.getQueryData<CoreStatus>(coreKey);
    if (!before) throw new Error("missing core");
    let deliver: ((value: Reply) => void) | undefined;
    const aborted = vi.spyOn(AbortController.prototype, "abort");
    const original = Client.prototype.request;
    vi.spyOn(Client.prototype, "request").mockImplementation(function (
      this: Client,
      request,
    ) {
      if (request.method === method) {
        // Abort is synchronous, before the access request reaches the transport.
        expect(aborted).toHaveBeenCalled();
        return new Promise((resolve) => {
          deliver = resolve;
        });
      }
      return original.call(this, request);
    });
    let transition: Promise<void> | undefined;
    act(() => {
      transition = hook
        .account()
        .act(
          method === "account.email"
            ? { method, action: { action: "open", mode: "signInCode" } }
            : { method },
        );
    });
    expectSessionEmpty(hook);
    expect(hook.result.current.available).toBe(false);
    expect(hook.cache.getQueryData<CoreStatus>(coreKey)?.access.verified).toBe(
      true,
    );
    const value = hook.account().value;
    if (!deliver || !value) throw new Error("missing transition");
    await act(async () => {
      deliver?.({
        method,
        value: {
          ...value,
          session: "signedIn",
          gate: "none",
          name: "Account B",
        },
      });
      await transition;
    });
    expectSessionEmpty(hook);
    expect(hook.result.current.available).toBe(true);
  },
);
it("a new account topic clears A even when the core rights never change", async () => {
  const hook = await mount("testing-tester-reports");
  await seedSessionA(hook);
  const account = hook.account().value;
  if (!account) throw new Error("missing account");
  await act(async () => {
    hook.host.postMessage({
      kind: "event",
      event: {
        topic: "account",
        value: {
          ...account,
          name: "Account B",
          gate: "none",
          session: "signedIn",
        },
      },
    });
  });
  await waitFor(() => expect(hook.result.current.preview).toBeUndefined());
  expectSessionEmpty(hook);
  expect(hook.result.current.available).toBe(true);
  expect(hook.cache.getQueryData<CoreStatus>(coreKey)?.access.verified).toBe(
    true,
  );
});
it.each([
  "report.prepare",
  "report.send",
  "testing.refresh",
  "triage.prepare",
] as const)(
  "discards delayed %s from A after a confirmed B topic",
  async (method) => {
    const hook = await mount("testing-tester-reports");
    await seedSessionA(hook);
    let deliver: (() => void) | undefined;
    const original = Client.prototype.request;
    vi.spyOn(Client.prototype, "request").mockImplementation(async function (
      this: Client,
      request,
    ) {
      const reply = await original.call(this, request);
      if (request.method === method)
        await new Promise<void>((resolve) => {
          deliver = resolve;
        });
      return reply;
    });
    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = (
        method === "report.prepare"
          ? hook.result.current.prepare()
          : method === "report.send"
            ? hook.result.current.send()
            : method === "triage.prepare"
              ? hook.result.current.triage.prepareReport()
              : hook.result.current.refresh()
      ).catch((error) => error);
    });
    await waitFor(() => expect(deliver).toBeDefined());
    const account = hook.account().value;
    if (!account) throw new Error("missing account");
    await act(async () => {
      hook.host.postMessage({
        kind: "event",
        event: {
          topic: "account",
          value: { ...account, name: "B", session: "signedIn", gate: "none" },
        },
      });
    });
    await waitFor(() => expect(hook.result.current.preview).toBeUndefined());
    await act(async () => {
      deliver?.();
      await pending;
    });
    expectSessionEmpty(hook);
    expect(hook.result.current.busy).toBe(false);
    expect(hook.result.current.triage.pending).toBe(false);
  },
);

it("normal logout clears reports and keeps remote actions disabled until a confirmed session", async () => {
  const hook = await mount("testing-tester-reports");
  await seedSessionA(hook);
  await act(async () => {
    await hook.account().act({ method: "account.logout" });
  });
  expectSessionEmpty(hook);
  expect(hook.result.current.available).toBe(false);
});

it("a failed autosave from A cannot publish an error into confirmed B", async () => {
  const hook = await mount("testing-tester-reports");
  const original = Client.prototype.request;
  let fail: ((error: unknown) => void) | undefined;
  vi.spyOn(Client.prototype, "request").mockImplementation(function (
    this: Client,
    request,
  ) {
    return request.method === "draft.save"
      ? new Promise((_resolve, reject) => {
          fail = reject;
        })
      : original.call(this, request);
  });
  act(() => {
    hook.result.current.edit({ actionText: "PRIVATE_AUTOSAVE_A" });
  });
  act(() => {
    window.dispatchEvent(new Event("blur"));
  });
  await waitFor(() => expect(fail).toBeDefined());
  const account = hook.account().value;
  if (!account) throw new Error("missing account");
  await act(async () => {
    hook.host.postMessage({
      kind: "event",
      event: {
        topic: "account",
        value: { ...account, name: "B", session: "signedIn", gate: "none" },
      },
    });
  });
  await waitFor(() => expect(hook.result.current.fields.actionText).toBe(""));
  await act(async () => {
    fail?.(new HostFailure({ kind: "io" }));
  });
  expect(hook.result.current.message).toBe("");
  expect(hook.result.current.error).toBe(false);
  expectSessionEmpty(hook);
});
