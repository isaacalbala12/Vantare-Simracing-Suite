// @vitest-environment jsdom
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
import {
  type CoreStatus,
  type Reply,
  reportFieldLimits,
} from "../src/contract/generated/contract";
import { coreKey, HostProvider } from "../src/renderer/app/Host";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { reportText as text } from "../src/renderer/i18n/testing-report";
import {
  ReportsProvider,
  useReports,
} from "../src/renderer/screens/testing/ReportsState";
import { Reports } from "../src/renderer/screens/testing/Testing";
import { ToastProvider } from "../src/renderer/ui/Layers";

let cache: QueryClient;
let reports: ReturnType<typeof useReports>;
function DraftReady() {
  reports = useReports();
  return (
    <output data-testid="draft-state">
      {useReports().loaded ? "loaded" : "pending"}
    </output>
  );
}

beforeEach(async () => {
  await import("../src/mock/host");
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  window.history.replaceState(null, "", "/?escena=testing-tester-reports");
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  cache.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
function renderReport() {
  render(
    <QueryClientProvider client={cache}>
      <HostProvider>
        <ToastProvider>
          <ReportsProvider>
            <DraftReady />
            <Reports view="compose" />
          </ReportsProvider>
        </ToastProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
}
async function mount() {
  renderReport();
  await waitFor(() =>
    expect(screen.getByTestId("draft-state").textContent).toBe("loaded"),
  );
}

function edit() {
  for (const [label, value] of [
    [text.action, "Nota privada del piloto"],
    [text.observed, "Se quedó vacío"],
    [text.expected, "Ver el panel"],
  ])
    fireEvent.change(screen.getByRole("textbox", { name: label }), {
      target: { value },
    });
}
async function save() {
  fireEvent.click(screen.getByRole("button", { name: text.save }));
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: text.prepare })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
}
it("shows the GPUI controls and keeps local edits available when the service disconnects", async () => {
  await mount();
  expect(screen.getByText(text.notes)).toBeTruthy();
  expect(screen.getByText("Capturas · 0/3")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: text.logs }).hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: text.send }).hasAttribute("disabled"),
  ).toBe(true);
  const calls = vi.spyOn(Client.prototype, "request");
  act(() =>
    cache.setQueryData(coreKey, {
      ...cache.getQueryData<CoreStatus>(coreKey),
      services: "unavailable",
    }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: text.context }), {
    target: { value: "Nota conservada" },
  });
  fireEvent.click(screen.getByRole("button", { name: text.suggestion }));
  expect(
    (screen.getByRole("textbox", { name: text.context }) as HTMLTextAreaElement)
      .value,
  ).toBe("Tipo: Sugerencia\nNota conservada");
  expect(
    screen.getByRole("button", { name: text.save }).hasAttribute("disabled"),
  ).toBe(true);
  expect(calls).not.toHaveBeenCalled();
});
it("reviews the host preview, revokes consent on edits and sends only its id once", async () => {
  const original = Client.prototype.request;
  const calls = vi
    .spyOn(Client.prototype, "request")
    .mockImplementation(async function (
      this: Client,
      request: Parameters<Client["request"]>[0],
    ): Promise<Reply> {
      const reply = await original.call(this, request);
      if (reply.method === "report.prepare")
        return {
          ...reply,
          value: {
            ...reply.value,
            fields: {
              module: "hub",
              actionText: "Informe estructurado",
              expectedText: "Revisión humana pendiente",
              observedText: "Revisión humana pendiente",
              contextText: "",
            },
          },
        };
      return reply;
    });
  await mount();
  edit();
  await save();
  fireEvent.click(screen.getByRole("button", { name: text.prepare }));
  expect(await screen.findByText("Informe estructurado")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: text.consent }));
  fireEvent.change(screen.getByRole("textbox", { name: text.context }), {
    target: { value: "Cambio posterior" },
  });
  expect(screen.queryByRole("checkbox", { name: text.consent })).toBeNull();
  expect(
    screen.getByRole("button", { name: text.send }).hasAttribute("disabled"),
  ).toBe(true);
  await save();
  fireEvent.click(screen.getByRole("button", { name: text.prepare }));
  fireEvent.click(await screen.findByRole("checkbox", { name: text.consent }));
  // Invoke the same closure twice before React can remove consent or disable the button.
  const send = reports.send;
  await act(async () => {
    await Promise.all([send(), send()]);
  });
  expect(await screen.findByText(text.received, { exact: true })).toBeTruthy();
  const sends = calls.mock.calls.filter(
    ([request]) => request.method === "report.send",
  );
  expect(sends).toHaveLength(1);
  expect(sends[0][0]).toEqual({
    method: "report.send",
    previewId: expect.any(String),
    consent: true,
  });
});
it("loads a draft explicitly and reviews a pending attempt without sending", async () => {
  await mount();
  const calls = vi.spyOn(Client.prototype, "request");
  fireEvent.click(screen.getByRole("button", { name: text.loadDraft }));
  await waitFor(() =>
    expect(
      calls.mock.calls.some(([request]) => request.method === "draft.load"),
    ).toBe(true),
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: text.pending })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: text.pending }));
  await waitFor(() =>
    expect(
      calls.mock.calls.some(
        ([request]) => request.method === "report.retryPrepare",
      ),
    ).toBe(true),
  );
  expect(
    calls.mock.calls.some(([request]) => request.method === "report.send"),
  ).toBe(false);
  expect(
    screen.getByRole("button", { name: text.send }).hasAttribute("disabled"),
  ).toBe(true);
});
it("keeps the final action disabled after a failed preparation", async () => {
  await mount();
  edit();
  await save();
  vi.spyOn(Client.prototype, "request").mockRejectedValueOnce(
    new HostFailure({ kind: "rejected" }),
  );
  fireEvent.click(screen.getByRole("button", { name: text.prepare }));
  expect(await screen.findByText(text.failed, { exact: true })).toBeTruthy();
  expect(screen.queryByRole("checkbox", { name: text.consent })).toBeNull();
  expect(
    screen.getByRole("button", { name: text.send }).hasAttribute("disabled"),
  ).toBe(true);
});

it("keeps actions blocked while the initial host draft is pending", async () => {
  const original = Client.prototype.request;
  let resolveDraft!: (reply: Reply) => void;
  const pending = new Promise<Reply>((resolve) => {
    resolveDraft = resolve;
  });
  const calls = vi
    .spyOn(Client.prototype, "request")
    .mockImplementation(function (this: Client, request) {
      return request.method === "draft.load"
        ? pending
        : original.call(this, request);
    });
  renderReport();
  await waitFor(() =>
    expect(
      calls.mock.calls.some(([request]) => request.method === "draft.load"),
    ).toBe(true),
  );
  expect(
    screen
      .getByRole("button", { name: text.loadDraft })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: text.send }).hasAttribute("disabled"),
  ).toBe(true);
  await act(async () =>
    resolveDraft({
      method: "draft.load",
      value: {
        legacy: "none",
        fields: {
          module: "unknown",
          actionText: "",
          expectedText: "",
          observedText: "",
          contextText: "",
        },
        exists: false,
        screenshots: [],
        message: "",
      },
    }),
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: text.loadDraft })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
});
it("keeps a legacy image on failure, then removes it once with the current local fields", async () => {
  const original = Client.prototype.request;
  const fields = {
    module: "hub",
    actionText: "Nota privada",
    expectedText: "Ver panel",
    observedText: "Panel vacío",
    contextText: "Contexto local",
  };
  // The same bounded JPEG header metadata used by the Rust contract tests.
  const image = {
    id: "c".repeat(64),
    jpeg: "/9j/",
    width: 1,
    height: 1,
    byteSize: 3,
  };
  let attempts = 0;
  const calls = vi
    .spyOn(Client.prototype, "request")
    .mockImplementation(async function (this: Client, request): Promise<Reply> {
      if (request.method === "draft.load")
        return {
          method: "draft.load",
          value: {
            legacy: "none",
            fields,
            exists: true,
            screenshots: [image],
            message: "",
          },
        };
      if (request.method === "report.removeScreenshot") {
        attempts++;
        if (attempts === 1) throw new HostFailure({ kind: "rejected" });
        expect(request.id).toBe(image.id);
        return {
          method: "report.removeScreenshot",
          value: {
            legacy: "none",
            fields: request.fields,
            exists: true,
            screenshots: [],
            message: "",
          },
        };
      }
      return original.call(this, request);
    });
  await mount();
  expect(screen.getByText("Capturas · 1/3")).toBeTruthy();
  expect(
    screen.getByRole("img", { name: "Captura 1" }).getAttribute("src"),
  ).toBe("data:image/jpeg;base64,/9j/");
  screen.getByRole("button", { name: text.removeScreenshot }).focus();
  fireEvent.click(screen.getByRole("button", { name: text.removeScreenshot }));
  expect(await screen.findByText(text.failed, { exact: true })).toBeTruthy();
  expect(screen.getByText("Capturas · 1/3")).toBeTruthy();
  const remove = screen.getByRole("button", { name: text.retry });
  remove.focus();
  fireEvent.click(remove);
  fireEvent.click(remove);
  expect(await screen.findByText("Capturas · 0/3")).toBeTruthy();
  const removals = calls.mock.calls.filter(
    ([request]) => request.method === "report.removeScreenshot",
  );
  expect(removals).toHaveLength(2);
  expect(removals[1][0]).toEqual({
    method: "report.removeScreenshot",
    id: image.id,
    fields,
  });
  expect(document.activeElement).not.toBe(document.body);
  expect(
    calls.mock.calls.some(
      ([request]) =>
        request.method === "report.capture" || request.method === "report.send",
    ),
  ).toBe(false);
});

it("can review a pending host attempt after draft loading failed and still recover the editor", async () => {
  const original = Client.prototype.request;
  vi.spyOn(Client.prototype, "request").mockImplementation(async function (
    this: Client,
    request,
  ): Promise<Reply> {
    if (request.method === "draft.load")
      throw new HostFailure({ kind: "rejected" });
    if (request.method === "report.retryPrepare")
      return {
        method: "report.retryPrepare",
        value: {
          id: "a".repeat(64),
          digest: "b".repeat(64),
          fields: {
            module: "hub",
            actionText: "Informe estructurado",
            expectedText: "Revisión humana pendiente",
            observedText: "Revisión humana pendiente",
            contextText: "",
          },
          appVersion: "QA",
          osVersion: "Windows",
          channel: "nightly",
          retry: true,
          screenshots: [],
        },
      };
    return original.call(this, request);
  });
  renderReport();
  expect(await screen.findByText(text.failed, { exact: true })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: text.pending }));
  expect(await screen.findByText(text.retryOriginal)).toBeTruthy();
  fireEvent.click(await screen.findByRole("checkbox", { name: text.consent }));
  expect(
    screen.getByRole("button", { name: text.send }).hasAttribute("disabled"),
  ).toBe(false);
  fireEvent.change(screen.getByRole("textbox", { name: text.context }), {
    target: { value: "Nota nueva" },
  });
  await act(async () => reports.load());
  expect(reports.fields.contextText).toBe("Nota nueva");
  expect(screen.queryByRole("checkbox", { name: text.consent })).toBeNull();
  expect(
    screen
      .getByRole("button", { name: text.loadDraft })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: text.send }).hasAttribute("disabled"),
  ).toBe(true);
});

it("keeps draft images separate from an original pending preview and revokes it before removal", async () => {
  const original = Client.prototype.request;
  const fields = {
    module: "hub" as const,
    actionText: "Nota local",
    expectedText: "Panel",
    observedText: "Vacío",
    contextText: "",
  };
  const image = {
    id: "c".repeat(64),
    jpeg: "/9j/",
    width: 1,
    height: 1,
    byteSize: 3,
  };
  let completeRemoval!: (reply: Reply) => void;
  const calls = vi
    .spyOn(Client.prototype, "request")
    .mockImplementation(async function (this: Client, request): Promise<Reply> {
      if (request.method === "draft.load" || request.method === "draft.save")
        return {
          method: request.method,
          value: {
            legacy: "none",
            fields,
            exists: true,
            screenshots: [image],
            message: "",
          },
        };
      if (request.method === "report.retryPrepare")
        return {
          method: "report.retryPrepare",
          value: {
            id: "a".repeat(64),
            digest: "b".repeat(64),
            fields,
            appVersion: "QA",
            osVersion: "Windows",
            channel: "nightly",
            retry: true,
            screenshots: [],
          },
        };
      if (request.method === "report.removeScreenshot")
        return new Promise((resolve) => {
          completeRemoval = resolve;
        });
      return original.call(this, request);
    });
  await mount();
  fireEvent.click(screen.getByRole("button", { name: text.pending }));
  expect(await screen.findByText(text.retryOriginal)).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Capturas · 1/3" })).toBeTruthy();
  expect(screen.getByText("Capturas · 0/3")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: text.consent }));
  fireEvent.click(screen.getByRole("button", { name: text.removeScreenshot }));
  await waitFor(() => expect(completeRemoval).toBeTypeOf("function"));
  expect(screen.queryByRole("region", { name: text.preview })).toBeNull();
  expect(screen.queryByRole("checkbox", { name: text.consent })).toBeNull();
  expect(screen.getByRole("heading", { name: "Capturas · 1/3" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: text.send }));
  expect(
    calls.mock.calls.some(([request]) => request.method === "report.send"),
  ).toBe(false);
  await act(async () =>
    completeRemoval({
      method: "report.removeScreenshot",
      value: {
        legacy: "none",
        fields,
        exists: true,
        screenshots: [],
        message: "",
      },
    }),
  );
  expect(
    await screen.findByRole("heading", { name: "Capturas · 0/3" }),
  ).toBeTruthy();
});

it("loading replaces every field and revokes the previous host review and consent", async () => {
  await mount();
  edit();
  await save();
  fireEvent.click(screen.getByRole("button", { name: text.prepare }));
  fireEvent.click(await screen.findByRole("checkbox", { name: text.consent }));
  const fields = {
    module: "launcher",
    actionText: "Otro título",
    expectedText: "Otro resultado",
    observedText: "Otra nota",
    contextText: "Tipo: Sugerencia\nOtro contexto",
  };
  vi.spyOn(Client.prototype, "request").mockResolvedValueOnce({
    method: "draft.load",
    value: {
      fields,
      screenshots: [],
      exists: true,
      legacy: "none",
      message: "",
    },
  } as Reply);
  fireEvent.click(screen.getByRole("button", { name: text.loadDraft }));
  await waitFor(() => expect(reports.fields).toEqual(fields));
  expect(reports.preview).toBeUndefined();
  expect(reports.consent).toBe(false);
  expect(screen.queryByRole("checkbox", { name: text.consent })).toBeNull();
  expect(reports.dirty).toBe(false);
});

it("explains why loading is blocked with unsaved changes and never creates a hybrid draft", async () => {
  await mount();
  edit();
  const calls = vi.spyOn(Client.prototype, "request");
  const load = screen.getByRole("button", { name: text.loadDraft });
  expect(load.hasAttribute("disabled")).toBe(true);
  expect(
    document.getElementById(load.getAttribute("aria-describedby") ?? "")
      ?.textContent,
  ).toBe(text.loadDirty);
  fireEvent.click(load);
  await act(async () => reports.load());
  expect(calls).not.toHaveBeenCalled();
  expect(reports.fields.actionText).toBe("Nota privada del piloto");
});

it("persists the default kind without clicking it and restores it on a round trip", async () => {
  await mount();
  edit();
  const calls = vi.spyOn(Client.prototype, "request");
  const saveButton = screen.getByRole("button", { name: text.save });
  saveButton.focus();
  await save();
  expect(reports.fields.contextText).toBe("Tipo: Algo falla\n");
  expect(
    calls.mock.calls.find(([r]) => r.method === "draft.save")?.[0],
  ).toMatchObject({ fields: { contextText: "Tipo: Algo falla\n" } });
  expect(document.activeElement).not.toBe(document.body);
  await act(async () => reports.load());
  expect(reports.fields.contextText).toBe("Tipo: Algo falla\n");
  expect(reports.dirty).toBe(false);
});

it("changing kind revokes consent and gives the new preview focus", async () => {
  await mount();
  edit();
  await save();
  const prepare = screen.getByRole("button", { name: text.prepare });
  prepare.focus();
  fireEvent.click(prepare);
  const consent = await screen.findByRole("checkbox", { name: text.consent });
  expect(document.activeElement).toBe(
    screen.getByRole("region", { name: text.preview }),
  );
  fireEvent.click(consent);
  fireEvent.click(screen.getByRole("button", { name: text.suggestion }));
  expect(reports.consent).toBe(false);
  expect(reports.preview).toBeUndefined();
  expect(screen.queryByRole("checkbox", { name: text.consent })).toBeNull();
});

it("ignores a delayed send response after the session loses access", async () => {
  await mount();
  edit();
  await save();
  fireEvent.click(screen.getByRole("button", { name: text.prepare }));
  fireEvent.click(await screen.findByRole("checkbox", { name: text.consent }));
  const original = Client.prototype.request;
  let finish!: () => Promise<void>;
  vi.spyOn(Client.prototype, "request").mockImplementation(function (
    this: Client,
    request,
  ): Promise<Reply> {
    if (request.method !== "report.send") return original.call(this, request);
    return new Promise((resolve) => {
      finish = async () => resolve(await original.call(this, request));
    });
  });
  let pending!: Promise<void>;
  act(() => {
    pending = reports.send();
  });
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  const core = cache.getQueryData<CoreStatus>(coreKey);
  if (!core) throw new Error("missing session");
  act(() =>
    cache.setQueryData(coreKey, {
      ...core,
      access: {
        ...core.access,
        verified: false,
      },
    }),
  );
  await waitFor(() => expect(reports.access.verified).toBe(false));
  await act(async () => {
    await finish();
    await expect(pending).rejects.toBeDefined();
  });
  expect(reports.receipt).toBeUndefined();
  expect(reports.sessionReceipts).toEqual([]);
  expect(reports.consent).toBe(false);
  expect(reports.preview).toBeUndefined();
});

it("describes invalid fields and kind limits outside button titles", async () => {
  await mount();
  fireEvent.change(screen.getByRole("textbox", { name: text.action }), {
    target: { value: "ab" },
  });
  const input = screen.getByRole("textbox", { name: text.action });
  expect(
    (input.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .some((id) => document.getElementById(id)?.textContent === text.tooShort),
  ).toBe(true);
  // GPUI allows saving an incomplete draft; its review still requires complete fields.
  expect(
    screen.getByRole("button", { name: text.save }).hasAttribute("disabled"),
  ).toBe(false);
  fireEvent.change(screen.getByRole("textbox", { name: text.context }), {
    target: { value: "a".repeat(reportFieldLimits[3]) },
  });
  const kind = screen.getByRole("button", { name: text.suggestion });
  expect(
    document.getElementById(kind.getAttribute("aria-describedby") ?? "")
      ?.textContent,
  ).toBe(text.kindLimit);
  fireEvent.change(input, {
    target: { value: "a".repeat(reportFieldLimits[0] + 1) },
  });
  expect(screen.getByText(text.tooLong)).toBeTruthy();
});

it("does not create an untouched draft when the window blurs", async () => {
  await mount();
  const calls = vi.spyOn(Client.prototype, "request");
  await act(async () => {
    window.dispatchEvent(new Event("blur"));
  });
  expect(
    calls.mock.calls.some(([request]) => request.method === "draft.save"),
  ).toBe(false);
  expect(reports.fields.contextText).toBe("");
});
