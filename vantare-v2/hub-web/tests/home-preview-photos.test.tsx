// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  CoreStatus,
  HomeLayoutView,
  HomeView,
  HostToUi,
  Reply,
  Request,
  StudioView,
} from "../src/contract/generated/contract";
import { previewTransparentPng } from "../src/contract/generated/preview";
import { createMockHost, hello } from "../src/mock/host";
import { HostProvider, offline } from "../src/renderer/app/Host";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { HomeLayout, type HomeProps } from "../src/renderer/ui/home/HomeLayout";
import { useHomePhotos } from "../src/renderer/ui/home/useHomePhotos";
import type { PreviewPhoto } from "../src/renderer/ui/studio/previewPhoto";

let cache: QueryClient;
let core: CoreStatus;
let snapshot: StudioView;
let layout: HomeLayoutView;
let home: HomeView;
let listen: (message: HostToUi) => void;
const request = vi.fn<(value: Request) => Promise<Reply>>();
const decode = vi.fn<() => Promise<void>>();
const descriptor = Object.getOwnPropertyDescriptor(
  HTMLImageElement.prototype,
  "decode",
);
const image: Reply = {
  method: "preview.render",
  value: { width: 1, height: 1, pngBase64: previewTransparentPng },
};
function held() {
  let resolve!: (reply: Reply) => void;
  const promise = new Promise<Reply>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function photos() {
  return request.mock.calls
    .map(([r]) => r)
    .filter(
      (r): r is Extract<Request, { method: "preview.render" }> =>
        r.method === "preview.render",
    );
}
function reads() {
  return request.mock.calls.filter(([r]) => r.method === "studio.get");
}
function readLayout(): HomeLayoutView {
  return {
    state: "ready",
    width: 1920,
    height: 1080,
    widgets: snapshot.instances.map((item) => ({
      kind: item.kind as HomeLayoutView["widgets"][number]["kind"],
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      opacity: 100,
    })),
  };
}
function Probe({ value = layout }: { value?: HomeLayoutView }) {
  const composition:
    | { snapshot: StudioView; photos: Map<string, PreviewPhoto> }
    | undefined = useHomePhotos(value);
  return (
    <div data-testid="composition">
      {composition?.snapshot.instances.map((item) => (
        <img
          key={item.id}
          alt={item.id}
          data-x={item.x}
          data-y={item.y}
          data-w={item.size.width}
          data-h={item.size.height}
          src={composition.photos.get(item.id)?.src}
        />
      ))}
    </div>
  );
}
function mount() {
  return render(<Probe />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={cache}>
        <HostProvider>{children}</HostProvider>
      </QueryClientProvider>
    ),
  });
}
async function ready() {
  await waitFor(() =>
    expect(screen.getAllByRole("img")).toHaveLength(snapshot.instances.length),
  );
}
async function publish(next: CoreStatus) {
  core = next;
  await act(async () =>
    listen({ kind: "event", event: { topic: "core", value: next } }),
  );
}
beforeEach(() => {
  const host = createMockHost("preview-image");
  const reply = host({
    kind: "request",
    id: 1,
    request: { method: "studio.get" },
  });
  if (reply?.kind !== "response" || reply.result.method !== "studio.get")
    throw Error("missing Studio snapshot");
  snapshot = structuredClone(reply.result.value);
  layout = readLayout();
  const homeReply = host({
    kind: "request",
    id: 2,
    request: { method: "home.get" },
  });
  if (homeReply?.kind !== "response" || homeReply.result.method !== "home.get")
    throw Error("missing Home snapshot");
  home = structuredClone(homeReply.result.value);
  home.layout = layout;
  core = {
    ...structuredClone(offline),
    rights: "connected",
    accountGeneration: "a".repeat(64),
    live: false,
    access: { ...offline.access, verified: true, blocked: false },
  };
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  request.mockReset().mockImplementation(async (value) => {
    if (value.method === "studio.get")
      return { method: "studio.get", value: structuredClone(snapshot) };
    if (value.method === "preview.render") return image;
    throw Error(`Unexpected write/read: ${value.method}`);
  });
  decode.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: decode,
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const connection = {
    request,
    listen: (fn: typeof listen) => {
      listen = fn;
      return () => {};
    },
    subscribe: () => () => {},
    start: () => {
      listen(hello);
      listen({ kind: "event", event: { topic: "core", value: core } });
    },
    close: vi.fn(),
  };
  vi.spyOn(Client, "connect").mockResolvedValue(
    connection as unknown as Client,
  );
});
afterEach(() => {
  cleanup();
  cache.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (descriptor)
    Object.defineProperty(HTMLImageElement.prototype, "decode", descriptor);
  else Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
});

it("reads Studio once and uses every id and revision from that same snapshot without Studio writes", async () => {
  const ui = mount();
  await ready();
  expect(reads()).toHaveLength(1);
  expect(photos()).toEqual(
    snapshot.instances.map((item) => ({
      method: "preview.render",
      target: {
        kind: "instance",
        id: item.id,
        baseRevision: snapshot.revision,
      },
      scene: "demo",
      scale: "1",
    })),
  );
  ui.rerender(<Probe value={{ ...layout }} />);
  expect(reads()).toHaveLength(1);
  expect(photos()).toHaveLength(snapshot.instances.length);
  expect(
    request.mock.calls.every(
      ([r]) => r.method === "studio.get" || r.method === "preview.render",
    ),
  ).toBe(true);
});
it.each(["live", "blocked", "unverified", "account", "disconnected"])(
  "does not read or render photos without authority: %s",
  async (mode) => {
    if (mode === "live") core.live = true;
    if (mode === "blocked") core.access.blocked = true;
    if (mode === "unverified") core.access.verified = false;
    if (mode === "account") core.accountGeneration = null;
    if (mode === "disconnected") core.rights = "unavailable";
    mount();
    await waitFor(() => expect(Client.connect).toHaveBeenCalledOnce());
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  },
);
it("keeps at most one request pending and exposes no partial composition", async () => {
  const pending = held();
  request.mockImplementation(async (value) =>
    value.method === "studio.get"
      ? { method: "studio.get", value: structuredClone(snapshot) }
      : pending.promise,
  );
  mount();
  await waitFor(() => expect(photos()).toHaveLength(1));
  expect(screen.queryAllByRole("img")).toHaveLength(0);
  request.mockImplementation(async () => image);
  await act(async () => pending.resolve(image));
  await ready();
});
it("keeps the drawing for more than eight widgets without asking Rune", async () => {
  snapshot.instances = Array.from({ length: 9 }, (_, index) => ({
    ...structuredClone(snapshot.instances[0]),
    id: `widget-${index}`,
  }));
  layout = readLayout();
  mount();
  await act(async () => {});
  expect(photos()).toHaveLength(0);
  expect(screen.queryAllByRole("img")).toHaveLength(0);
});
it.each(["noDemo", "busy", "tooLarge", "denied", "captureFailed"])(
  "is all-or-nothing for %s and never retries in the same visit",
  async (mode) => {
    request.mockImplementation(async (value) => {
      if (value.method === "studio.get")
        return { method: "studio.get", value: structuredClone(snapshot) };
      if (photos().length === 2)
        throw new HostFailure(
          mode === "busy"
            ? { kind: "busy" }
            : mode === "denied"
              ? { kind: "denied" }
              : {
                  kind: "previewFailed",
                  reason: mode as "noDemo" | "tooLarge" | "captureFailed",
                },
        );
      return image;
    });
    const ui = mount();
    await waitFor(() => expect(photos()).toHaveLength(2));
    await act(async () => {});
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    const attempted = photos().length;
    ui.rerender(<Probe />);
    await act(async () => {});
    expect(photos()).toHaveLength(attempted);
  },
);
it("reuses exactly the last complete set across visits when only position/revision changes", async () => {
  const ui = mount();
  await ready();
  const sources = screen
    .getAllByRole("img")
    .map((node) => node.getAttribute("src"));
  const count = photos().length;
  ui.rerender(null);
  snapshot.revision = "b".repeat(64);
  snapshot.instances[0].x += 125;
  snapshot.instances[0].size.width += 10;
  ui.rerender(<Probe />);
  await ready();
  expect(reads()).toHaveLength(2);
  expect(photos()).toHaveLength(count);
  expect(
    screen.getAllByRole("img").map((node) => node.getAttribute("src")),
  ).toEqual(sources);
});
it("invalidates the complete set after a settings fingerprint changes", async () => {
  const ui = mount();
  await ready();
  const count = photos().length;
  ui.rerender(null);
  snapshot.revision = "c".repeat(64);
  const item = snapshot.instances[0];
  if (item.settings?.kind !== "standings") throw Error("expected Standings");
  item.settings.accent = "green";
  ui.rerender(<Probe />);
  await ready();
  expect(photos()).toHaveLength(count * 2);
  expect(
    photos()
      .slice(count)
      .every(
        (r) =>
          r.target.kind === "instance" &&
          r.target.baseRevision === snapshot.revision,
      ),
  ).toBe(true);
});
it.each(["live", "account", "disconnected"])(
  "invalidates retained photos even while Inicio is unmounted: %s",
  async (mode) => {
    const ui = mount();
    await ready();
    const count = photos().length;
    ui.rerender(null);
    const changed = structuredClone(core);
    if (mode === "live") changed.live = true;
    if (mode === "account") changed.accountGeneration = "d".repeat(64);
    if (mode === "disconnected") changed.rights = "unavailable";
    await publish(changed);
    await publish({ ...core, live: false, rights: "connected" });
    ui.rerender(<Probe />);
    await ready();
    expect(photos()).toHaveLength(count * 2);
  },
);
it.each(["unmount", "account", "live", "disconnected"])(
  "discards a late photo after %s without exposing any composition",
  async (mode) => {
    const pending = held();
    request.mockImplementation(async (value) =>
      value.method === "studio.get"
        ? { method: "studio.get", value: structuredClone(snapshot) }
        : pending.promise,
    );
    const ui = mount();
    await waitFor(() => expect(photos()).toHaveLength(1));
    if (mode === "unmount") ui.rerender(null);
    else {
      const changed = structuredClone(core);
      if (mode === "account") changed.accountGeneration = "f".repeat(64);
      if (mode === "live") changed.live = true;
      if (mode === "disconnected") changed.rights = "unavailable";
      await publish(changed);
    }
    await act(async () => pending.resolve(image));
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(photos()).toHaveLength(1);
  },
);
it.each(["count", "protected", "missing"])(
  "never pairs Home slots by index with a mismatching snapshot: %s",
  async (mode) => {
    if (mode === "count") snapshot.instances.pop();
    else snapshot.state = mode as "protected" | "missing";
    mount();
    await waitFor(() => expect(reads()).toHaveLength(1));
    await act(async () => {});
    expect(photos()).toHaveLength(0);
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  },
);
it("composes only confirmed snapshot geometry, preserving valid transparent PNG and focus", async () => {
  snapshot.instances[0].x = 125.5;
  snapshot.instances[0].y = -40;
  snapshot.instances[0].size = { width: 338, height: 304 };
  mount();
  await ready();
  expect(decode).toHaveBeenCalledTimes(snapshot.instances.length);
  expect(document.activeElement).toBe(document.body);
  const first = screen.getAllByRole("img")[0];
  expect(
    ["data-x", "data-y", "data-w", "data-h"].map((key) =>
      first.getAttribute(key),
    ),
  ).toEqual(["125.5", "-40", "338", "304"]);
  expect(screen.getAllByRole("img")[0].getAttribute("src")).toBe(
    `data:image/png;base64,${previewTransparentPng}`,
  );
});
it("does not expose a corrupt PNG or retry it", async () => {
  decode.mockRejectedValue(new Error("bad PNG"));
  const ui = mount();
  await waitFor(() => expect(decode).toHaveBeenCalledOnce());
  expect(screen.queryAllByRole("img")).toHaveLength(0);
  ui.rerender(<Probe />);
  await act(async () => {});
  expect(photos()).toHaveLength(1);
});

it("captures exactly eight distinct instances even when their kinds repeat", async () => {
  snapshot.instances = Array.from({ length: 8 }, (_, index) => ({
    ...structuredClone(snapshot.instances[0]),
    id: `instance-${index}`,
  }));
  layout = readLayout();
  mount();
  await ready();
  expect(photos()).toHaveLength(8);
  expect(
    photos().map((r) => r.target.kind === "instance" && r.target.id),
  ).toEqual(snapshot.instances.map((item) => item.id));
});
it("invalidates the retained composition when the instance list changes", async () => {
  const ui = mount();
  await ready();
  const previous = photos().length;
  ui.rerender(null);
  snapshot.instances[0].id = "replacement";
  snapshot.revision = "e".repeat(64);
  ui.rerender(<Probe />);
  await ready();
  expect(photos()).toHaveLength(previous * 2);
  expect(photos()[previous].target).toEqual({
    kind: "instance",
    id: "replacement",
    baseRevision: snapshot.revision,
  });
});
function HomePreview(props: HomeProps) {
  const photos = useHomePhotos(props.view?.layout);
  return <HomeLayout {...props} photos={photos} />;
}

it("announces one completed composition, keeps widget names and retains the drawing seal until all photos arrive", async () => {
  const pending = held();
  request.mockImplementation(async (value) =>
    value.method === "studio.get"
      ? { method: "studio.get", value: structuredClone(snapshot) }
      : pending.promise,
  );
  const props: HomeProps = {
    view: home,
    core,
    name: "QA",
    now: new Date(2026, 10, 17, 16),
    selected: home.favorite ?? "",
    pending: false,
    records: [],
    select: vi.fn(),
    launch: vi.fn(),
    navigate: vi.fn(),
    commands: vi.fn(),
    retry: vi.fn(),
  };
  const ui = render(<HomePreview {...props} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={cache}>
        <HostProvider>{children}</HostProvider>
      </QueryClientProvider>
    ),
  });
  await screen.findByText("Dibujo orientativo", { exact: true });
  await waitFor(() => expect(photos()).toHaveLength(1));
  expect(
    screen.queryByText("Vista previa del layout lista.", { exact: true }),
  ).toBeNull();
  request.mockImplementation(async () => image);
  await act(async () => pending.resolve(image));
  await screen.findByText("Fotos", { exact: true });
  expect(screen.getByText("· datos de ejemplo", { exact: true })).toBeTruthy();
  expect(
    screen.getAllByText("Vista previa del layout lista.", { exact: true }),
  ).toHaveLength(1);
  const announced = screen.getByText("Vista previa del layout lista.", {
    exact: true,
  });
  expect(announced.getAttribute("role")).toBe("status");
  ui.rerender(<HomePreview {...props} />);
  expect(
    screen.getAllByText("Vista previa del layout lista.", { exact: true }),
  ).toHaveLength(1);
});
