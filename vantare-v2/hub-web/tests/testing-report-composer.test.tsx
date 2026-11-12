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
import type { CoreStatus, Reply } from "../src/contract/generated/contract";
import { coreKey, HostProvider } from "../src/renderer/app/Host";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { reportText as text } from "../src/renderer/i18n/testing-report";
import { ReportsProvider } from "../src/renderer/screens/testing/ReportsState";
import { Reports } from "../src/renderer/screens/testing/Testing";
import { ToastProvider } from "../src/renderer/ui/Layers";

let cache: QueryClient;
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
    expect(
      screen
        .getByRole("button", { name: text.loadDraft })
        .hasAttribute("disabled"),
    ).toBe(false),
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
  const send = screen.getByRole("button", { name: text.send });
  fireEvent.click(send);
  fireEvent.click(send);
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
  fireEvent.click(screen.getByRole("button", { name: text.removeScreenshot }));
  expect(await screen.findByText(text.failed, { exact: true })).toBeTruthy();
  expect(screen.getByText("Capturas · 1/3")).toBeTruthy();
  const remove = screen.getByRole("button", { name: text.retry });
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
  expect(
    calls.mock.calls.some(
      ([request]) =>
        request.method === "report.capture" || request.method === "report.send",
    ),
  ).toBe(false);
});
