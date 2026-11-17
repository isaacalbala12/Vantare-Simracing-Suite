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
import type {
  CoreStatus,
  Reply,
  Request,
  StudioView,
} from "../src/contract/generated/contract";
import {
  previewLimits,
  previewTransparentPng,
} from "../src/contract/generated/preview";
import { coreKey, HostProvider } from "../src/renderer/app/Host";
import { UiProvider } from "../src/renderer/app/UiState";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import {
  StudioProvider,
  useStudio,
} from "../src/renderer/screens/studio/state";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { StudioFocus } from "../src/renderer/ui/studio/StudioFocus";

type PhotoRequest = Extract<Request, { method: "preview.render" }>;
let cache: QueryClient;
let studio: ReturnType<typeof useStudio>;
let requests: Request[];
let intercept: ((request: PhotoRequest) => Promise<Reply>) | undefined;
const clients = new Set<Client>();
const decode = vi.fn<() => Promise<void>>();
const decodeDescriptor = Object.getOwnPropertyDescriptor(
  HTMLImageElement.prototype,
  "decode",
);
function Probe() {
  studio = useStudio();
  return null;
}
function view() {
  if (!studio.view) throw Error("Studio not loaded");
  return studio.view;
}
function photos() {
  return requests.filter(
    (r): r is PhotoRequest => r.method === "preview.render",
  );
}
function stage() {
  const node = document.querySelector<HTMLElement>(".v-focus-stage");
  if (!node) throw Error("Stage not mounted");
  return within(node);
}
function select(id: string) {
  const row = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-widget]"),
  ).find((n) => n.dataset.widget === id);
  if (!row) throw Error("Missing widget row");
  fireEvent.click(row);
}
function deferred() {
  let resolve!: (reply: Reply) => void;
  const promise = new Promise<Reply>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  requests = [];
  intercept = undefined;
  decode.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: decode,
  });
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(
    1,
  );
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(
    1,
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("devicePixelRatio", 1.5);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const request = Client.prototype.request;
  vi.spyOn(Client.prototype, "request").mockImplementation(function (
    this: Client,
    value,
    onSent,
  ) {
    requests.push(value);
    if (value.method === "preview.render" && intercept) return intercept(value);
    return request.call(this, value, onSent);
  });
  const connect = Client.connect;
  vi.spyOn(Client, "connect").mockImplementation(async () => {
    const client = await connect.call(Client);
    clients.add(client);
    return client;
  });
});
afterEach(() => {
  cleanup();
  for (const client of clients) client.close();
  clients.clear();
  cache.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (decodeDescriptor)
    Object.defineProperty(
      HTMLImageElement.prototype,
      "decode",
      decodeDescriptor,
    );
  else Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
  document.documentElement.removeAttribute("style");
  window.history.replaceState(null, "", "/");
});
async function mount(scene = "preview-image") {
  window.history.replaceState(null, "", `/?escena=${scene}`);
  const result = render(<StudioFocus />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={cache}>
        <HostProvider>
          <CSPProvider disableStyleElements>
            <TooltipProvider>
              <UiProvider>
                <StudioProvider>
                  <Probe />
                  {children}
                </StudioProvider>
              </UiProvider>
            </TooltipProvider>
          </CSPProvider>
        </HostProvider>
      </QueryClientProvider>
    ),
  });
  await waitFor(() => expect(studio.view?.state).toBe("ready"));
  return result;
}
async function photoReady() {
  await waitFor(() =>
    expect(
      stage().getByRole("img", { name: /Vista previa real de/ }),
    ).toBeTruthy(),
  );
}

it("requests one fixed-scale instance photo with the current revision and no Studio writes", async () => {
  await mount();
  await waitFor(() => expect(photos()).toHaveLength(1));
  expect(photos()[0]).toEqual({
    method: "preview.render",
    target: {
      kind: "instance",
      id: studio.selected,
      baseRevision: view().revision,
    },
    scene: "demo",
    scale: "1",
  });
  await photoReady();
  expect(
    requests
      .filter((r) => r.method.startsWith("studio."))
      .every((r) => r.method === "studio.get"),
  ).toBe(true);
});
it.each([
  ["noDemo", "Dibujo orientativo", "este widget aún no tiene foto real", false],
  [
    "graphicsDisabled",
    "Dibujo orientativo",
    "la foto real no está disponible en este equipo",
    false,
  ],
  [
    "unavailable",
    "Dibujo orientativo",
    "la foto real no está disponible en este equipo",
    false,
  ],
  [
    "gpuUnavailable",
    "No se pudo generar la foto",
    "se muestra el dibujo",
    true,
  ],
  ["captureFailed", "No se pudo generar la foto", "se muestra el dibujo", true],
  ["timeout", "La foto ha tardado demasiado", "se muestra el dibujo", true],
  ["tooLarge", "La foto es demasiado grande", "se muestra el dibujo", false],
  ["invalidInput", "No se pudo generar la foto", "se muestra el dibujo", false],
  ["busy", "Hay otra vista previa en curso", "se muestra el dibujo", true],
] as const)(
  "shows the approved %s fallback without automatic retries",
  async (reason, title, detail, retry) => {
    await mount(`preview-${reason}`);
    await waitFor(() =>
      expect(stage().getByText(title, { exact: true })).toBeTruthy(),
    );
    expect(stage().getByText(`· ${detail}`, { exact: true })).toBeTruthy();
    expect(
      stage().queryByRole("button", {
        name: "Volver a generar la vista previa real",
      }) !== null,
    ).toBe(retry);
    expect(
      stage().getByRole("img", { name: /Dibujo orientativo de/ }),
    ).toBeTruthy();
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(previewLimits.timeoutMs * 4);
    });
    expect(photos()).toHaveLength(1);
  },
);
it("keeps only the last selection while a photo is pending and discards the old result", async () => {
  const gate = deferred();
  intercept = () => gate.promise;
  await mount();
  await waitFor(() => expect(photos()).toHaveLength(1));
  const [first, second, last] = view().instances;
  expect(first.id).not.toBe(last.id);
  select(second.id);
  select(last.id);
  expect(photos()).toHaveLength(1);
  intercept = undefined;
  await act(async () =>
    gate.resolve({
      method: "preview.render",
      value: { width: 1, height: 1, pngBase64: previewTransparentPng },
    }),
  );
  await waitFor(() => expect(photos()).toHaveLength(2));
  expect(photos()[1].target).toEqual({
    kind: "instance",
    id: last.id,
    baseRevision: view().revision,
  });
  expect(
    photos().some(
      (r) => r.target.kind === "instance" && r.target.id === second.id,
    ),
  ).toBe(false);
  await photoReady();
  expect(decode).toHaveBeenCalledTimes(1);
});
it.each(["unmount", "account", "live", "disconnect"] as const)(
  "discards a late photo on %s without announcing or decoding it",
  async (reason) => {
    const gate = deferred();
    intercept = () => gate.promise;
    const rendered = await mount();
    await waitFor(() => expect(photos()).toHaveLength(1));
    if (reason === "unmount") rendered.unmount();
    else
      await act(async () =>
        cache.setQueryData<CoreStatus>(coreKey, (old) => {
          if (!old) throw Error("Missing core");
          return reason === "account"
            ? { ...old, accountGeneration: "b".repeat(64) }
            : reason === "live"
              ? { ...old, live: true }
              : { ...old, rights: "disconnected", services: "disconnected" };
        }),
      );
    await act(async () =>
      gate.resolve({
        method: "preview.render",
        value: { width: 1, height: 1, pngBase64: previewTransparentPng },
      }),
    );
    expect(decode).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Vista previa real lista.", { exact: true }),
    ).toBeNull();
    expect(photos()).toHaveLength(1);
  },
);
it("does not request again on repaint, theme or zoom", async () => {
  const rendered = await mount();
  await photoReady();
  document.documentElement.dataset.scheme = "light";
  document.documentElement.style.zoom = "1.25";
  rendered.rerender(<StudioFocus />);
  expect(photos()).toHaveLength(1);
});
it("regenerates once for confirmed settings of the selected widget, not for another widget", async () => {
  await mount();
  await photoReady();
  const first = view().instances.find((i) => i.id === studio.selected);
  if (!first) throw Error("Missing selected widget");
  expect(first.kind).toBe("standings");
  await act(async () => {
    await studio.execute({
      method: "studio.instance",
      id: first.id,
      baseRevision: view().revision,
      patch: {
        field: "settings",
        value: { kind: "standings", accent: "green" },
      },
    });
  });
  await waitFor(() => expect(photos()).toHaveLength(2));
  await photoReady();
  expect(photos()[1].target).toEqual({
    kind: "instance",
    id: first.id,
    baseRevision: view().revision,
  });
  const other = view().instances.find((i) => i.kind === "delta");
  if (!other) throw Error("Missing Delta fixture");
  await act(async () => {
    await studio.execute({
      method: "studio.instance",
      id: other.id,
      baseRevision: view().revision,
      patch: { field: "settings", value: { kind: "delta", accent: "green" } },
    });
  });
  expect(photos()).toHaveLength(2);
});
it("keeps a transparent PNG as a real photo with one accessible image and one announcement", async () => {
  await mount();
  await photoReady();
  expect(stage().getByText("Transparente", { exact: true })).toBeTruthy();
  expect(stage().getAllByRole("img")).toHaveLength(1);
  expect(
    stage().getAllByText("Vista previa real lista.", { exact: true }),
  ).toHaveLength(1);
});
it("falls back without retry when Chromium cannot decode the PNG", async () => {
  decode.mockRejectedValue(new Error("Invalid PNG pixels"));
  await mount();
  await waitFor(() =>
    expect(
      stage().getByText("No se pudo generar la foto", { exact: true }),
    ).toBeTruthy(),
  );
  expect(
    stage().queryByRole("button", {
      name: "Volver a generar la vista previa real",
    }),
  ).toBeNull();
  expect(photos()).toHaveLength(1);
});
it("does not offer regeneration after Denied", async () => {
  intercept = async () => {
    throw new HostFailure({ kind: "denied" });
  };
  await mount();
  await waitFor(() =>
    expect(
      stage().getByText("· sin foto mientras el diseño esté protegido", {
        exact: true,
      }),
    ).toBeTruthy(),
  );
  expect(
    stage().queryByRole("button", {
      name: "Volver a generar la vista previa real",
    }),
  ).toBeNull();
});
it("refreshes Studio on conflict without reissuing preview.render", async () => {
  intercept = async () => {
    const current: StudioView = structuredClone(view());
    current.revision = "c".repeat(64);
    throw new HostFailure({ kind: "studioConflict", current });
  };
  await mount();
  await waitFor(() =>
    expect(
      screen.getByText("El diseño ha cambiado en otro proceso.", {
        exact: true,
      }),
    ).toBeTruthy(),
  );
  await waitFor(() =>
    expect(requests.filter((r) => r.method === "studio.get")).toHaveLength(2),
  );
  expect(photos()).toHaveLength(1);
  expect(
    stage().getByRole("button", {
      name: "Volver a generar la vista previa real",
    }),
  ).toBeTruthy();
});
it("keeps the regeneration button while pending and focuses info only when that button disappears on success", async () => {
  intercept = async () => {
    throw new HostFailure({ kind: "previewFailed", reason: "captureFailed" });
  };
  await mount();
  const retry = await screen.findByRole("button", {
    name: "Volver a generar la vista previa real",
  });
  const gate = deferred();
  intercept = () => gate.promise;
  const user = userEvent.setup();
  await user.click(retry);
  expect(
    stage().getByRole("button", { name: "Generando la vista previa real" }),
  ).toBe(retry);
  expect(retry.getAttribute("aria-disabled")).toBe("true");
  expect(retry.textContent).toContain("Generando…");
  await user.click(retry);
  expect(photos()).toHaveLength(2);
  await act(async () =>
    gate.resolve({
      method: "preview.render",
      value: { width: 1, height: 1, pngBase64: previewTransparentPng },
    }),
  );
  await photoReady();
  expect(document.activeElement).toBe(
    stage().getByRole("button", { name: "Qué estoy viendo" }),
  );
  expect(
    stage().queryByRole("button", {
      name: "Volver a generar la vista previa real",
    }),
  ).toBeNull();
});
it("opens info on click, closes on Escape and leaves focus on its trigger", async () => {
  await mount();
  await photoReady();
  const info = stage().getByRole("button", { name: "Qué estoy viendo" });
  const user = userEvent.setup();
  await user.click(info);
  expect(info.getAttribute("aria-expanded")).toBe("true");
  expect(stage().getByRole("note").textContent).toContain(
    "No es el juego ni tus datos.",
  );
  await user.keyboard("{Escape}");
  expect(info.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(info);
});

it.each(["width", "height", "bytes"] as const)(
  "rejects an image exceeding previewLimits.%s before decoding",
  async (field) => {
    intercept = async () => ({
      method: "preview.render",
      value: {
        width: field === "width" ? previewLimits.axis + 1 : 1,
        height: field === "height" ? previewLimits.axis + 1 : 1,
        pngBase64:
          field === "bytes"
            ? "iVBORw0KGgo" +
              "A".repeat(Math.ceil((previewLimits.pngBytes + 3) / 3) * 4 - 11)
            : previewTransparentPng,
      },
    });
    await mount();
    await waitFor(() =>
      expect(
        stage().getByText("No se pudo generar la foto", { exact: true }),
      ).toBeTruthy(),
    );
    expect(decode).not.toHaveBeenCalled();
    expect(
      stage().queryByRole("button", {
        name: "Volver a generar la vista previa real",
      }),
    ).toBeNull();
    expect(photos()).toHaveLength(1);
  },
);
it("does not steal focus when an initial photo arrives", async () => {
  const gate = deferred();
  intercept = () => gate.promise;
  await mount();
  await waitFor(() => expect(photos()).toHaveLength(1));
  const example = stage().getByRole("button", { name: "Ejemplo", exact: true });
  example.focus();
  await act(async () =>
    gate.resolve({
      method: "preview.render",
      value: { width: 1, height: 1, pngBase64: previewTransparentPng },
    }),
  );
  await photoReady();
  expect(document.activeElement).toBe(example);
});
it("reactivates regeneration after another failure without retrying by itself", async () => {
  await mount("preview-timeout");
  const retry = await screen.findByRole("button", {
    name: "Volver a generar la vista previa real",
  });
  await userEvent.setup().click(retry);
  await waitFor(() =>
    expect(retry.getAttribute("aria-disabled")).not.toBe("true"),
  );
  expect(photos()).toHaveLength(2);
  expect(
    stage().getByText("La foto ha tardado demasiado", { exact: true }),
  ).toBeTruthy();
});
