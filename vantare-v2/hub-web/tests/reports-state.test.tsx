// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  reportAutosaveMs,
  reportFieldLimits,
} from "../src/contract/generated/contract";
import { HostProvider } from "../src/renderer/app/Host";
import { Client } from "../src/renderer/bridge/client";
import {
  ReportsProvider,
  useReports,
} from "../src/renderer/screens/testing/ReportsState";

type Guard = Parameters<Client["addCloseGuard"]>[0];
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
  let guard: Guard | undefined;
  const original = Client.prototype.addCloseGuard;
  vi.spyOn(Client.prototype, "addCloseGuard").mockImplementation(function (
    this: Client,
    value,
  ) {
    guard = value;
    return original.call(this, value);
  });
  const hook = renderHook(useReports, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={cache}>
        <HostProvider>
          <ReportsProvider>{children}</ReportsProvider>
        </HostProvider>
      </QueryClientProvider>
    ),
  });
  await waitFor(() => expect(hook.result.current.available).toBe(true));
  await act(async () => {
    await hook.result.current.load();
  });
  return {
    ...hook,
    guard: (reason: Parameters<Guard>[0]) => {
      if (!guard) throw new Error("missing report guard");
      return guard(reason);
    },
  };
}
describe("protected report draft behavior", () => {
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
  it("preserves a failed save, vetoes only window close, and permits Live and restart", async () => {
    const hook = await mount("testing-save-error");
    act(() => hook.result.current.edit({ actionText: "Conservar esta nota" }));
    await act(async () => {
      await expect(hook.result.current.save()).rejects.toBeDefined();
    });
    expect(hook.result.current.fields.actionText).toBe("Conservar esta nota");
    expect(hook.result.current.error).toBe(true);
    expect(await hook.guard("window")).toBe(false);
    expect(await hook.guard("live")).toBe(true);
    expect(await hook.guard("restart")).toBe(true);
  });
  it("flushes an unsaved edit when closing the window", async () => {
    const hook = await mount();
    act(() =>
      hook.result.current.edit({ actionText: "Último cambio antes de cerrar" }),
    );
    let allow = false;
    await act(async () => {
      allow = await hook.guard("window");
    });
    expect(allow).toBe(true);
    expect(hook.result.current.dirty).toBe(false);
  });
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
    expect(hook.result.current.preview?.fields.actionText).toBe("Acción");
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
