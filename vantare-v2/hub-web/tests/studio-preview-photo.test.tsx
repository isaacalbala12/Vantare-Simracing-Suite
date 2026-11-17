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
  WidgetSettings,
} from "../src/contract/generated/contract";
import {
  previewLimits,
  previewTransparentPng,
} from "../src/contract/generated/preview";
import { studioWidgetDefaults } from "../src/contract/generated/studio";
import { coreKey, HostProvider } from "../src/renderer/app/Host";
import { UiProvider } from "../src/renderer/app/UiState";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import {
  StudioProvider,
  useStudio,
} from "../src/renderer/screens/studio/state";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { StudioFocus } from "../src/renderer/ui/studio/StudioFocus";
import { previewFingerprint } from "../src/renderer/ui/studio/usePreviewPhoto";

type PhotoRequest = Extract<Request, { method: "preview.render" }>;
let cache: QueryClient;
let studio: ReturnType<typeof useStudio>;
let requests: Request[];
let intercept: ((request: PhotoRequest) => Promise<Reply>) | undefined;
let readState: StudioView["state"] | undefined;
let readView: ((value: StudioView) => StudioView) | undefined;
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
  readState = undefined;
  readView = undefined;
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
    const result = request.call(this, value, onSent);
    return value.method === "studio.get"
      ? result.then((reply) => {
          if (reply.method !== "studio.get") return reply;
          const value = readView ? readView(reply.value) : reply.value;
          return {
            ...reply,
            value: readState ? { ...value, state: readState } : value,
          };
        })
      : result;
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
function photoElement() {
  const image = document.querySelector<HTMLImageElement>(
    ".v-preview-stage .v-preview-photo",
  );
  if (!image) throw Error("Missing real preview image");
  return image;
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
  const queuedRevision = view().revision;
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
  expect(view().revision).not.toBe(queuedRevision);
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
              : { ...old, rights: "unavailable", services: "unavailable" };
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
  const gate = deferred();
  intercept = () => gate.promise;
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
  expect(
    stage().queryByRole("img", { name: /Vista previa real de/ }),
  ).toBeNull();
  expect(
    stage().getByText("Preparando vista previa real…", { exact: true }),
  ).toBeTruthy();
  expect(photos()[1].target).toEqual({
    kind: "instance",
    id: first.id,
    baseRevision: view().revision,
  });
  await act(async () =>
    gate.resolve({
      method: "preview.render",
      value: { width: 1, height: 1, pngBase64: previewTransparentPng },
    }),
  );
  await photoReady();
  const image = photoElement();
  const src = image.src;
  const stageNode = image.closest(".v-preview-stage");
  if (!stageNode) throw Error("Missing photo Stage");
  const transitions: MutationRecord[] = [];
  const observer = new MutationObserver((records) =>
    transitions.push(...records),
  );
  observer.observe(stageNode, {
    attributes: true,
    attributeFilter: ["data-photo"],
    attributeOldValue: true,
  });
  const beforeOther = view().revision;
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
  expect(view().revision).not.toBe(beforeOther);
  expect(photos()).toHaveLength(2);
  expect(photoElement()).toBe(image);
  expect(image.src).toBe(src);
  expect(stageNode.getAttribute("data-photo")).toBe("true");
  transitions.push(...observer.takeRecords());
  observer.disconnect();
  expect(transitions.every((record) => record.oldValue === "true")).toBe(true);
  expect(
    stage().queryByText("· este widget aún no tiene foto real", {
      exact: true,
    }),
  ).toBeNull();
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
  const example = stage().getByRole("button", { name: "Ejemplo" });
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

it("clears the current photo when Live starts, without another request", async () => {
  await mount();
  await photoReady();
  await act(async () =>
    cache.setQueryData<CoreStatus>(coreKey, (old) => {
      if (!old) throw Error("Missing core");
      return { ...old, live: true };
    }),
  );
  expect(
    stage().queryByRole("img", { name: /Vista previa real de/ }),
  ).toBeNull();
  expect(photos()).toHaveLength(1);
});
it("does not steal focus if the user leaves the regeneration button before success", async () => {
  await mount("preview-timeout");
  const retry = await screen.findByRole("button", {
    name: "Volver a generar la vista previa real",
  });
  const gate = deferred();
  intercept = () => gate.promise;
  await userEvent.setup().click(retry);
  const example = stage().getByRole("button", { name: "Ejemplo" });
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

it("withdraws the photo and sends no preview request when the document becomes protected", async () => {
  await mount();
  await photoReady();
  readState = "protected";
  await act(async () => {
    await studio.execute({ method: "studio.get" });
  });
  expect(
    stage().queryByRole("img", { name: /Vista previa real de/ }),
  ).toBeNull();
  expect(
    stage().getByText("· sin foto mientras el diseño esté protegido", {
      exact: true,
    }),
  ).toBeTruthy();
  expect(
    stage().queryByRole("button", {
      name: "Volver a generar la vista previa real",
    }),
  ).toBeNull();
  expect(photos()).toHaveLength(1);
});

it("keeps photo metadata in the top row, after info and before the data controls", async () => {
  await mount();
  await photoReady();
  const legend = stage()
    .getByText("Transparente", { exact: true })
    .closest(".v-preview-metadata");
  const header = document.querySelector(".v-preview-stage > header");
  const info = stage().getByRole("button", { name: "Qué estoy viendo" });
  const example = stage().getByRole("button", { name: "Ejemplo" });
  expect(legend).not.toBeNull();
  if (!legend) throw Error("Missing photo metadata");
  expect(header?.contains(legend)).toBe(true);
  expect(
    info.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
  expect(
    legend.compareDocumentPosition(example) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
  expect(
    document.querySelector(".v-preview-stage > .v-preview-metadata"),
  ).toBeNull();
});

it("describes a photo reduced to 68 percent without upscaling or another request", async () => {
  const bounds = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("v-preview-fit")
        ? new DOMRect(0, 0, 230, 230)
        : bounds.call(this);
    },
  );
  intercept = async () => ({
    method: "preview.render",
    value: { width: 338, height: 304, pngBase64: previewTransparentPng },
  });
  await mount();
  await photoReady();
  expect(
    await stage().findByText("338 × 304 px · reducida al 68 %", {
      exact: true,
    }),
  ).toBeTruthy();
  expect(photos()).toHaveLength(1);
});

it("keeps the same photo after moving its own instance without rendering again", async () => {
  await mount();
  await photoReady();
  const id = studio.selected;
  if (!id) throw Error("Missing selection");
  const image = photoElement(),
    src = image.src;
  const before = view().revision;
  await act(async () => {
    await studio.execute({
      method: "studio.geometry",
      id,
      baseRevision: before,
      change: { kind: "move", x: 200, y: 100 },
    });
  });
  expect(view().revision).not.toBe(before);
  expect(view().instances.find((item) => item.id === id)?.x).toBe(200);
  expect(photoElement()).toBe(image);
  expect(image.src).toBe(src);
  expect(image.closest(".v-preview-stage")?.getAttribute("data-photo")).toBe(
    "true",
  );
  expect(
    stage().queryByText("· este widget aún no tiene foto real", {
      exact: true,
    }),
  ).toBeNull();
  expect(photos()).toHaveLength(1);
});
it("accepts an in-flight photo after another widget changes the global revision", async () => {
  const gate = deferred();
  intercept = () => gate.promise;
  await mount();
  await waitFor(() => expect(photos()).toHaveLength(1));
  const before = view().revision;
  const other = view().instances.find((item) => item.kind === "delta");
  if (!other) throw Error("Missing Delta");
  await act(async () => {
    await studio.execute({
      method: "studio.instance",
      id: other.id,
      baseRevision: before,
      patch: { field: "settings", value: { kind: "delta", accent: "green" } },
    });
  });
  expect(view().revision).not.toBe(before);
  await act(async () =>
    gate.resolve({
      method: "preview.render",
      value: { width: 1, height: 1, pngBase64: previewTransparentPng },
    }),
  );
  await photoReady();
  expect(photoElement().src).toBe(
    `data:image/png;base64,${previewTransparentPng}`,
  );
  expect(decode).toHaveBeenCalledTimes(1);
  expect(photos()).toHaveLength(1);
});
it("regenerates explicitly with the latest global revision after an unrelated edit", async () => {
  await mount("preview-timeout");
  const retry = await screen.findByRole("button", {
    name: "Volver a generar la vista previa real",
  });
  const other = view().instances.find((item) => item.kind === "delta");
  if (!other) throw Error("Missing Delta");
  const before = view().revision;
  await act(async () => {
    await studio.execute({
      method: "studio.instance",
      id: other.id,
      baseRevision: before,
      patch: { field: "settings", value: { kind: "delta", accent: "green" } },
    });
  });
  expect(view().revision).not.toBe(before);
  expect(
    stage().getByRole("button", {
      name: "Volver a generar la vista previa real",
    }),
  ).toBe(retry);
  intercept = undefined;
  await userEvent.setup().click(retry);
  await waitFor(() => expect(photos()).toHaveLength(2));
  expect(photos()[1].target).toEqual({
    kind: "instance",
    id: studio.selected,
    baseRevision: view().revision,
  });
});

it("fingerprints exactly kind and complete settings with stable nested key order", () => {
  const item = {
    kind: "standings" as const,
    settings: structuredClone(studioWidgetDefaults.standings) as Extract<
      WidgetSettings,
      { kind: "standings" }
    >,
  };
  const before = structuredClone(item);
  const fingerprint = previewFingerprint(item);
  const reordered = JSON.parse(
    JSON.stringify(item.settings, (_key, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse())
        : value,
    ),
  ) as typeof item.settings;
  expect(Object.keys(reordered)).not.toEqual(Object.keys(item.settings));
  expect(Object.keys(reordered.columns?.[0].format ?? {})).not.toEqual(
    Object.keys(item.settings.columns?.[0].format ?? {}),
  );
  expect(previewFingerprint({ ...item, settings: reordered })).toBe(
    fingerprint,
  );
  expect(previewFingerprint(item)).toBe(fingerprint);
  expect(item).toEqual(before);
  expect(previewFingerprint({ ...item, kind: "delta" })).not.toBe(fingerprint);
  expect(
    previewFingerprint({
      ...item,
      settings: { ...item.settings, accent: "green" },
    }),
  ).not.toBe(fingerprint);
  const nested = structuredClone(item.settings);
  if (!nested.columns?.length) throw Error("Missing column fixture");
  nested.columns[0].format.decimals = 1;
  expect(previewFingerprint({ ...item, settings: nested })).not.toBe(
    fingerprint,
  );
  expect(
    previewFingerprint({
      ...item,
      settings: { ...item.settings, columns: [...nested.columns].reverse() },
    }),
  ).not.toBe(previewFingerprint({ ...item, settings: nested }));
  const placed = {
    ...item,
    id: "another-id",
    x: -200,
    y: 400,
    size: { width: 800, height: 900 },
    visible: false,
    opacity: 20,
    showIn: { practice: false, qualifying: false, race: false },
    offTrack: "hide",
    sizeMode: "explicit",
    aspectLocked: false,
    canvasPlacement: "outside",
  };
  expect(previewFingerprint(placed)).toBe(fingerprint);
});

it("does not rerender automatically when conflict reconciliation returns changed settings", async () => {
  intercept = async () => {
    readView = (current) => ({
      ...current,
      revision: "c".repeat(64),
      instances: current.instances.map((item) =>
        item.kind === "standings"
          ? {
              ...item,
              settings: {
                ...item.settings,
                kind: "standings",
                accent: "green",
              } as Extract<WidgetSettings, { kind: "standings" }>,
            }
          : item,
      ),
    });
    throw new HostFailure({
      kind: "studioConflict",
      current: readView(view()),
    });
  };
  await mount();
  await waitFor(() => expect(view().revision).toBe("c".repeat(64)));
  expect(photos()).toHaveLength(1);
  expect(
    requests.filter((request) => request.method === "studio.get"),
  ).toHaveLength(2);
  expect(
    stage().getByText("· foto retirada porque el diseño cambió", {
      exact: true,
    }),
  ).toBeTruthy();
  expect(
    stage().getByRole("button", {
      name: "Volver a generar la vista previa real",
    }),
  ).toBeTruthy();
  expect(
    stage().queryByText("Preparando vista previa real…", { exact: true }),
  ).toBeNull();
});
it("discards an in-flight photo when the selected settings change and sends one latest replacement", async () => {
  const old = deferred(),
    latest = deferred();
  intercept = () => old.promise;
  await mount();
  await waitFor(() => expect(photos()).toHaveLength(1));
  const id = studio.selected;
  if (!id) throw Error("Missing selection");
  intercept = () => latest.promise;
  await act(async () => {
    await studio.execute({
      method: "studio.instance",
      id,
      baseRevision: view().revision,
      patch: {
        field: "settings",
        value: { kind: "standings", accent: "green" },
      },
    });
  });
  expect(photos()).toHaveLength(1);
  await act(async () =>
    old.resolve({
      method: "preview.render",
      value: { width: 1, height: 1, pngBase64: previewTransparentPng },
    }),
  );
  await waitFor(() => expect(photos()).toHaveLength(2));
  expect(decode).not.toHaveBeenCalled();
  expect(photos()[1].target).toEqual({
    kind: "instance",
    id,
    baseRevision: view().revision,
  });
  await act(async () =>
    latest.resolve({
      method: "preview.render",
      value: { width: 1, height: 1, pngBase64: previewTransparentPng },
    }),
  );
  await photoReady();
  expect(decode).toHaveBeenCalledTimes(1);
  expect(photos()).toHaveLength(2);
});
