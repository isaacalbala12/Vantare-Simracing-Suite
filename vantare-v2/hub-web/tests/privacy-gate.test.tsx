// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import privacyFixture from "../fixtures/privacy-base.json";
import type { Reply, Request } from "../src/contract/generated/contract";
import { HostProvider, useHost } from "../src/renderer/app/Host";
import { PrivacyGate } from "../src/renderer/app/PrivacyGate";
import { SettingsProvider } from "../src/renderer/app/SettingsState";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { privacyGateText as text } from "../src/renderer/i18n/privacy-gate.es";
import { GateFrame } from "../src/renderer/ui/GateFrame";
import { ToastProvider, TooltipProvider } from "../src/renderer/ui/Layers";

const originalRequest = Client.prototype.request;
type Intent = Exclude<Request, { method: "window.close" }>;
function intercept(
  handle: (request: Intent, client: Client) => Promise<Reply> | undefined,
) {
  return vi.spyOn(Client.prototype, "request").mockImplementation(function (
    this: Client,
    request: Intent,
  ) {
    return handle(request, this) ?? originalRequest.call(this, request);
  });
}
const updates = (request: MockInstance<Client["request"]>) =>
  request.mock.calls
    .map(([value]) => value)
    .filter((value) => value.method === "privacy.update");
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
function Content() {
  return useHost().hello ? (
    <SettingsProvider>
      <PrivacyGate>
        <h1>Hub</h1>
      </PrivacyGate>
    </SettingsProvider>
  ) : null;
}
function mount(scene = "privacidad-pendiente") {
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
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("style");
  window.history.replaceState(null, "", "/");
});
it("asks crashes first, starts on rejection and traps keyboard focus", async () => {
  const user = mount();
  await screen.findByRole("dialog", { name: text.crashesLabel });
  const reject = screen.getByRole("button", { name: text.reject });
  await waitFor(() => expect(document.activeElement).toBe(reject));
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: text.policy }),
  );
  await user.tab();
  expect(document.activeElement).toBe(reject);
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: text.accept }),
  );
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Minimizar" }),
  );
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Maximizar" }),
  );
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Cerrar ventana" }),
  );
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: text.policy }),
  );
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("heading", { name: "Hub" })).toBeNull();
});
it("stores both decisions independently and only then reveals the Hub", async () => {
  const request = vi.spyOn(Client.prototype, "request");
  const user = mount();
  await screen.findByRole("dialog");
  await user.click(screen.getByRole("button", { name: text.reject }));
  await screen.findByRole("dialog", { name: text.usageLabel });
  await user.click(screen.getByRole("checkbox", { name: text.usage }));
  await user.click(screen.getByRole("button", { name: text.continue }));
  await screen.findByRole("heading", { name: "Hub" });
  expect(
    request.mock.calls
      .map(([value]) => value)
      .filter((value) => value.method === "privacy.update")
      .map((value) => value.patch),
  ).toEqual([
    { field: "crashes", value: false },
    { field: "usage", value: true },
  ]);
});
it("retries an accepted decision explicitly after a save failure", async () => {
  let first = true;
  const request = intercept((value) => {
    if (value.method === "privacy.update" && first) {
      first = false;
      return Promise.reject(new HostFailure({ kind: "io" }));
    }
  });
  const user = mount();
  await screen.findByRole("dialog");
  await user.click(screen.getByRole("button", { name: text.accept }));
  expect((await screen.findByRole("alert")).textContent).toBe(text.failed);
  expect(screen.queryByRole("heading", { name: "Hub" })).toBeNull();
  expect(updates(request)).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: text.accept }));
  await screen.findByRole("dialog", { name: text.usageLabel });
  expect(updates(request).map((value) => value.patch)).toEqual([
    { field: "crashes", value: true },
    { field: "crashes", value: true },
  ]);
});

it("uses the conflict's current revision for the next explicit decision", async () => {
  const request = vi.spyOn(Client.prototype, "request");
  const user = mount("privacidad-puerta-conflicto");
  await screen.findByRole("dialog");
  await user.click(screen.getByRole("button", { name: text.reject }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: text.reject }));
  await screen.findByRole("heading", { name: "Hub" });
  const updates = request.mock.calls
    .map(([value]) => value)
    .filter((value) => value.method === "privacy.update");
  expect(updates).toHaveLength(2);
  expect(updates[0].baseRevision).not.toBe(updates[1].baseRevision);
});
it("does not ask again for decided or protected documents", async () => {
  mount("privacidad-puerta-protegida");
  await screen.findByRole("heading", { name: "Hub" });
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("starts the usage choice unchecked and allows refusal with window controls present", async () => {
  const user = mount("privacidad-uso");
  await screen.findByRole("dialog", { name: text.usageLabel });
  expect(
    screen
      .getByRole("checkbox", { name: text.usage })
      .getAttribute("aria-checked"),
  ).toBe("false");
  expect(screen.getByRole("button", { name: "Cerrar ventana" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: text.reject }));
  await screen.findByRole("heading", { name: "Hub" });
});
it("keeps the close action accessible while the consent question is open", async () => {
  const close = vi.spyOn(Client.prototype, "closeWindow");
  const user = mount();
  await screen.findByRole("dialog", { name: text.crashesLabel });
  await user.click(screen.getByRole("button", { name: "Cerrar ventana" }));
  expect(close).toHaveBeenCalledOnce();
});

it("keeps existing-user QA scenes accessible without changing permission values", async () => {
  const request = vi.spyOn(Client.prototype, "request");
  mount("ajustes-base");
  await screen.findByRole("heading", { name: "Hub" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    request.mock.calls.some(([value]) => value.method === "privacy.update"),
  ).toBe(false);
});

it("applies the saved appearance before showing a first-run gate", async () => {
  mount("visual-light:privacidad-pendiente");
  await screen.findByRole("dialog", { name: text.crashesLabel });
  await waitFor(() =>
    expect(document.documentElement.dataset.scheme).toBe("light"),
  );
});

it("Escape and closing never write a decision", async () => {
  const request = vi.spyOn(Client.prototype, "request");
  const user = mount();
  await screen.findByRole("dialog");
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Cerrar ventana" }));
  expect(updates(request)).toEqual([]);
});
it("allows a failed initial read to continue without writes for this session only", async () => {
  let first = true;
  const request = intercept((value) => {
    if (value.method === "privacy.get" && first) {
      first = false;
      return Promise.reject(new HostFailure({ kind: "io" }));
    }
  });
  const user = mount();
  await user.click(await screen.findByRole("button", { name: text.skip }));
  const hub = await screen.findByRole("heading", { name: "Hub" });
  await act(async () => {
    await caches[0].invalidateQueries({ queryKey: ["privacy"] });
  });
  expect(screen.getByRole("heading", { name: "Hub" })).toBe(hub);
  expect(updates(request)).toHaveLength(0);
  cleanup();
  mount();
  await screen.findByRole("dialog", { name: text.crashesLabel });
  expect(screen.queryByRole("heading", { name: "Hub" })).toBeNull();
});
it("can retry the initial privacy read without writing consent", async () => {
  let first = true;
  const request = intercept((value) => {
    if (value.method === "privacy.get" && first) {
      first = false;
      return Promise.reject(new HostFailure({ kind: "io" }));
    }
  });
  const user = mount();
  await user.click(await screen.findByRole("button", { name: text.retry }));
  await screen.findByRole("dialog", { name: text.crashesLabel });
  expect(updates(request)).toHaveLength(0);
});
it("passes a store that becomes protected while saving without impossible retries", async () => {
  const request = intercept((value) => {
    if (value.method === "privacy.update")
      return Promise.reject(new HostFailure({ kind: "protected" }));
  });
  const user = mount();
  await screen.findByRole("dialog");
  await user.click(screen.getByRole("button", { name: text.accept }));
  await screen.findByRole("heading", { name: "Hub" });
  expect(updates(request)).toHaveLength(1);
});
it("honors saved decisions in privacyCleanup without sending again", async () => {
  const current = {
    ...privacyFixture,
    crashesDecided: true,
    usageDecided: true,
    cleanupPending: true,
    revision: "1".repeat(64),
  };
  const request = intercept((value) => {
    if (value.method === "privacy.update")
      return Promise.reject(
        new HostFailure({ kind: "privacyCleanup", current }),
      );
  });
  const user = mount();
  await screen.findByRole("dialog");
  await user.click(screen.getByRole("button", { name: text.reject }));
  await screen.findByRole("heading", { name: "Hub" });
  expect(updates(request)).toHaveLength(1);
});
it("rejecting a checked usage choice always saves false", async () => {
  const request = vi.spyOn(Client.prototype, "request");
  const user = mount("privacidad-uso");
  await user.click(await screen.findByRole("checkbox", { name: text.usage }));
  expect(
    screen
      .getByRole("checkbox", { name: text.usage })
      .getAttribute("aria-checked"),
  ).toBe("true");
  await user.click(screen.getByRole("button", { name: text.reject }));
  await screen.findByRole("heading", { name: "Hub" });
  expect(updates(request).map((value) => value.patch)).toEqual([
    { field: "usage", value: false },
  ]);
});
it("a new installation asks both questions using the absent document revision", async () => {
  const request = vi.spyOn(Client.prototype, "request");
  const user = mount();
  await screen.findByRole("dialog", { name: text.crashesLabel });
  await user.click(screen.getByRole("button", { name: text.reject }));
  await screen.findByRole("dialog", { name: text.usageLabel });
  await user.click(screen.getByRole("button", { name: text.reject }));
  await screen.findByRole("heading", { name: "Hub" });
  expect(updates(request)[0].baseRevision).toBe(privacyFixture.revision);
  expect(updates(request).map((value) => value.patch)).toEqual([
    { field: "crashes", value: false },
    { field: "usage", value: false },
  ]);
});
it("a cache invalidation cannot remount an already opened Hub", async () => {
  const request = vi.spyOn(Client.prototype, "request");
  mount("ajustes-base");
  const hub = await screen.findByRole("heading", { name: "Hub" });
  await act(async () => {
    caches[0].setQueryData(["privacy"], privacyFixture);
  });
  expect(screen.getByRole("heading", { name: "Hub" })).toBe(hub);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(updates(request)).toHaveLength(0);
});
it("clears an old save error when a conflict advances to the usage question", async () => {
  let attempt = 0;
  intercept((value) => {
    if (value.method === "privacy.update") {
      attempt++;
      if (attempt === 1) return Promise.reject(new HostFailure({ kind: "io" }));
      return Promise.reject(
        new HostFailure({
          kind: "privacyConflict",
          current: {
            ...privacyFixture,
            crashesDecided: true,
            revision: "1".repeat(64),
          },
        }),
      );
    }
  });
  const user = mount();
  await screen.findByRole("dialog");
  await user.click(screen.getByRole("button", { name: text.accept }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: text.accept }));
  await screen.findByRole("dialog", { name: text.usageLabel });
  expect(screen.queryByRole("alert")).toBeNull();
});
it("coalesces a double click and waits for an in-flight decision before closing", async () => {
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let active: Client | undefined;
  const request = intercept((value, client) => {
    if (value.method === "privacy.update") {
      active = client;
      const response = originalRequest.call(client, value);
      return response.then(async (reply) => {
        await barrier;
        return reply;
      });
    }
  });
  const user = mount();
  await screen.findByRole("dialog");
  await user.dblClick(screen.getByRole("button", { name: text.accept }));
  expect(updates(request)).toHaveLength(1);
  if (!active) throw new Error("No pending request");
  const settled = vi.fn();
  const closeRequested = vi.fn();
  active.onCloseSettled(settled);
  active.listen((message) => {
    if (message.kind === "closeRequested") closeRequested();
  });
  try {
    await user.click(screen.getByRole("button", { name: "Cerrar ventana" }));
    await waitFor(() => expect(closeRequested).toHaveBeenCalledOnce());
    expect(settled).not.toHaveBeenCalled();
    expect(updates(request)).toHaveLength(1);
  } finally {
    release();
  }
  await waitFor(() => expect(settled).toHaveBeenCalledWith("window", true));
  expect(updates(request)).toHaveLength(1);
});

it("follows the visual usage order before reaching the window controls", async () => {
  const user = mount("privacidad-uso");
  await screen.findByRole("dialog", { name: text.usageLabel });
  const policy = screen.getByRole("button", { name: text.policy });
  const checkbox = screen.getByRole("checkbox", { name: text.usage });
  policy.focus();
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(checkbox);
  await user.tab();
  expect(document.activeElement).toBe(policy);
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: text.reject }),
  );
  await user.tab({ shift: true });
  await user.tab({ shift: true });
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Cerrar ventana" }),
  );
});
it("does not swallow Tab when a gate has no enabled focus targets", () => {
  render(
    <GateFrame controls={null}>
      <div className="v-privacy-question" data-testid="empty-question" />
    </GateFrame>,
  );
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    bubbles: true,
    cancelable: true,
  });
  screen.getByTestId("empty-question").dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
});
