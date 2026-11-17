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
import type {
  CoreStatus,
  Reply,
  Request,
  WidgetInfo,
} from "../src/contract/generated/contract";
import {
  previewLimits,
  previewTransparentPng,
} from "../src/contract/generated/preview";
import { createMockHost } from "../src/mock/host";
import { coreKey, offline } from "../src/renderer/app/Host";
import { HostFailure } from "../src/renderer/bridge/client";
import { useCatalogPhotos } from "../src/renderer/ui/studio/useCatalogPhotos";

const host = vi.hoisted(() => ({
  client: { request: vi.fn<(request: Request) => Promise<Reply>>() },
  issue: undefined as string | undefined,
}));
vi.mock("../src/renderer/app/Host", async (original) => ({
  ...(await original<object>()),
  useHost: () => host,
}));
let cache: QueryClient;
let core: CoreStatus;
let cards: WidgetInfo[];
let observer: IntersectionObserverCallback;
let observed: Element[];
let disconnect: ReturnType<typeof vi.fn>;
const decode = vi.fn<() => Promise<void>>();
const png: Reply = {
  method: "preview.render",
  value: { width: 1, height: 1, pngBase64: previewTransparentPng },
};

function deferred() {
  let resolve!: (value: Reply) => void;
  const promise = new Promise<Reply>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function Harness({
  open = true,
  widgets = cards,
}: {
  open?: boolean;
  widgets?: WidgetInfo[];
}) {
  const photos = useCatalogPhotos(open, widgets);
  return (
    <div ref={photos.bodyRef} data-testid="body">
      {widgets.map((widget) => (
        <button
          key={widget.kind}
          type="button"
          data-kind={widget.kind}
          aria-label={`Añadir ${widget.name}`}
        >
          <span>{widget.name}</span>
          {photos.photos.get(widget.kind) && (
            <img alt="" src={photos.photos.get(widget.kind)?.src} />
          )}
          {photos.pending === widget.kind && <i aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}
function mount(open = true) {
  return render(<Harness open={open} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    ),
  });
}
async function visible(...indices: number[]) {
  await act(async () =>
    observer(
      observed.map(
        (target) =>
          ({
            target,
            isIntersecting: indices.some(
              (index) =>
                document.querySelectorAll("[data-kind]")[index] === target,
            ),
            intersectionRatio: indices.some(
              (index) =>
                document.querySelectorAll("[data-kind]")[index] === target,
            )
              ? 1
              : 0,
          }) as IntersectionObserverEntry,
      ),
      {} as IntersectionObserver,
    ),
  );
}
function kinds() {
  return host.client.request.mock.calls.map(([r]) =>
    r.method === "preview.render" && r.target.kind === "catalog"
      ? r.target.widget
      : r.method,
  );
}
async function count(value: number) {
  await waitFor(() => expect(host.client.request).toHaveBeenCalledTimes(value));
}
beforeEach(() => {
  host.issue = undefined;
  const mock = createMockHost("preview-image");
  const response = mock({
    kind: "request",
    id: 1,
    request: { method: "studio.get" },
  });
  if (response?.kind !== "response" || response.result.method !== "studio.get")
    throw Error("missing mock Studio");
  cards = response.result.value.catalog
    .slice(0, 6)
    .map((widget) => ({ ...widget, allowed: true }));
  core = {
    ...structuredClone(offline),
    rights: "connected",
    accountGeneration: "a".repeat(64),
    live: false,
    access: { ...offline.access, verified: true, blocked: false },
  };
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cache.setQueryData(coreKey, core);
  host.client.request
    .mockReset()
    .mockImplementation(async (request: Request) => {
      const reply = mock({ kind: "request", id: 2, request });
      if (reply?.kind === "failure") throw new HostFailure(reply.error);
      if (reply?.kind !== "response") throw Error("missing mock response");
      return reply.result;
    });
  decode.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: decode,
  });
  observed = [];
  disconnect = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observer = callback;
        observed = [];
      }
      observe(target: Element) {
        observed.push(target);
      }
      disconnect = disconnect;
    },
  );
});
afterEach(() => {
  cleanup();
  cache.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("requests only allowed visible cards plus one, sequentially in DOM reading order", async () => {
  cards[1].allowed = false;
  const first = deferred();
  host.client.request.mockReturnValueOnce(first.promise);
  mount();
  await visible(0, 1, 2);
  await count(1);
  expect(kinds()).toEqual([cards[0].kind]);
  await act(async () => first.resolve(png));
  await count(3);
  expect(kinds()).toEqual([cards[0].kind, cards[2].kind, cards[3].kind]);
  await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(3));
});
it("releases photos outside visible+1 and never requests an evicted photo twice per opening", async () => {
  cards = cards.slice(0, 4);
  mount();
  await visible(0);
  await count(2);
  await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(2));
  await visible(2);
  await count(4);
  await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(2));
  expect(
    document.querySelector(`[data-kind="${cards[0].kind}"] img`),
  ).toBeNull();
  await visible(0);
  expect(kinds()).toHaveLength(4);
  expect(document.querySelectorAll("img")).toHaveLength(0);
});
it.each([
  "preview-noDemo",
  "preview-busy",
  "preview-tooLarge",
  "preview-captureFailed",
])("does not retry %s until reopened", async (scene) => {
  cards = cards.slice(0, 2);
  const mock = createMockHost(scene);
  host.client.request.mockImplementation(async (request: Request) => {
    const reply = mock({ kind: "request", id: 2, request });
    if (reply?.kind === "failure") throw new HostFailure(reply.error);
    throw Error("expected mock failure");
  });
  const ui = mount();
  await visible(0);
  await count(2);
  await visible(0);
  expect(kinds()).toHaveLength(2);
  ui.rerender(<Harness open={false} />);
  expect(document.querySelectorAll("img")).toHaveLength(0);
  ui.rerender(<Harness />);
  await visible(0);
  await count(4);
});
it("keeps the visible+1 photo when a settle repeats without new cards", async () => {
  cards = cards.slice(0, 4);
  mount();
  await visible(0);
  await count(2);
  await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(2));
  // A second delivery and a scrollend without new cards must not walk past +1.
  await visible(0);
  fireEvent(screen.getByTestId("body"), new Event("scrollend"));
  expect(kinds()).toEqual([cards[0].kind, cards[1].kind]);
  expect(
    document.querySelector(`[data-kind="${cards[1].kind}"] img`),
  ).not.toBeNull();
  // Reaching +1 paints its retained photo instead of asking again.
  await visible(1);
  await count(3);
  expect(kinds()).toEqual([cards[0].kind, cards[1].kind, cards[2].kind]);
  expect(
    document.querySelector(`[data-kind="${cards[1].kind}"] img`),
  ).not.toBeNull();
});
it("does not request passing cards during scroll, then settles on scrollend", async () => {
  mount();
  const body = screen.getByTestId("body");
  fireEvent.scroll(body);
  await visible(1, 2);
  expect(host.client.request).not.toHaveBeenCalled();
  fireEvent(body, new Event("scrollend"));
  await count(3);
  expect(kinds()).toEqual([cards[1].kind, cards[2].kind, cards[3].kind]);
});
it.each(["close", "account", "live", "disconnect", "unmount"])(
  "discards pending pixels on %s without advancing the queue",
  async (mode) => {
    const pending = deferred();
    host.client.request.mockReturnValueOnce(pending.promise);
    const ui = mount();
    await visible(0);
    await count(1);
    if (mode === "close") ui.rerender(<Harness open={false} />);
    else if (mode === "unmount") ui.unmount();
    else {
      if (mode === "account")
        core = { ...core, accountGeneration: "b".repeat(64) };
      if (mode === "live") core = { ...core, live: true };
      if (mode === "disconnect") {
        core = { ...core, rights: "unavailable" };
        host.issue = "offline";
      }
      act(() => cache.setQueryData(coreKey, core));
    }
    await act(async () => pending.resolve(png));
    expect(document.querySelectorAll("img")).toHaveLength(0);
    expect(kinds()).toHaveLength(1);
  },
);
it("filters release hidden photos and preserve the attempted set", async () => {
  cards = cards.slice(0, 4);
  const ui = mount();
  await visible(0);
  await count(2);
  await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(2));
  ui.rerender(<Harness widgets={cards.slice(2)} />);
  await visible(0);
  await count(4);
  expect(document.querySelector(`[data-kind="${cards[0].kind}"]`)).toBeNull();
  ui.rerender(<Harness />);
  await visible(0);
  expect(kinds()).toHaveLength(4);
});
it("discards an in-flight card that left the bounded set", async () => {
  const pending = deferred();
  host.client.request.mockReturnValueOnce(pending.promise);
  mount();
  await visible(0);
  await count(1);
  await visible(3);
  expect(kinds()).toHaveLength(1);
  await act(async () => pending.resolve(png));
  await count(3);
  expect(
    document.querySelector(`[data-kind="${cards[0].kind}"] img`),
  ).toBeNull();
});
it("decodes transparent PNGs, never announces or moves focus, and only sends preview.render", async () => {
  mount();
  const button = screen.getByRole("button", {
    name: `Añadir ${cards[0].name}`,
  });
  button.focus();
  await visible(0);
  await count(2);
  await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(2));
  expect(document.activeElement).toBe(button);
  expect(screen.queryByRole("status")).toBeNull();
  expect(decode).toHaveBeenCalledTimes(2);
  expect(host.client.request.mock.calls.map(([request]) => request)).toEqual(
    cards.slice(0, 2).map((widget) => ({
      method: "preview.render",
      target: { kind: "catalog", widget: widget.kind },
      scene: "demo",
      scale: "1",
    })),
  );
});
it("retains the illustration for corrupt PNG or reply beyond generated limits", async () => {
  cards = cards.slice(0, 2);
  decode.mockRejectedValue(new Error("corrupt PNG"));
  host.client.request.mockResolvedValueOnce({
    method: "preview.render",
    value: {
      width: previewLimits.axis + 1,
      height: 1,
      pngBase64: previewTransparentPng,
    },
  });
  mount();
  await visible(0);
  await count(2);
  await waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
  expect(document.querySelectorAll("img")).toHaveLength(0);
  await visible(0);
  expect(kinds()).toHaveLength(2);
});
