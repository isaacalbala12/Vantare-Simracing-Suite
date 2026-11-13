// @vitest-environment jsdom

import { CSPProvider } from "@base-ui/react/csp-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { HostProvider } from "../src/renderer/app/Host";
import { UiProvider } from "../src/renderer/app/UiState";
import { Client, HostFailure } from "../src/renderer/bridge/client";
import { studioText as t } from "../src/renderer/i18n/studio";
import {
  StudioProvider,
  useStudio,
} from "../src/renderer/screens/studio/state";
import { sessionsSummary } from "../src/renderer/screens/studio/track";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { StudioFocus } from "../src/renderer/ui/studio/StudioFocus";

const caches: QueryClient[] = [];
beforeAll(async () => {
  await import("../src/mock/host");
});
beforeEach(() =>
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  caches.forEach((c) => {
    c.clear();
  });
  caches.length = 0;
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
function ToggleScreen() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        Toggle Studio
      </button>
      {open && (
        <StudioProvider>
          <StudioFocus />
          <NoticeProbe />
        </StudioProvider>
      )}
    </>
  );
}
function NoticeProbe() {
  const state = useStudio();
  return (
    <button type="button" onClick={() => state.setNotice(undefined)}>
      Clear notice
    </button>
  );
}
function mount(scene = "studio-base") {
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
            <UiProvider>
              <ToggleScreen />
            </UiProvider>
          </TooltipProvider>
        </CSPProvider>
      </HostProvider>
    </QueryClientProvider>,
  );
}
async function tabTo(
  user: ReturnType<typeof userEvent.setup>,
  element: HTMLElement,
) {
  for (let i = 0; i < 40 && document.activeElement !== element; i++)
    await user.tab();
  expect(document.activeElement).toBe(element);
}
const listRow = (name: string) =>
  screen.findByRole("button", { name: new RegExp(`^${name}, `) });

async function openTrack() {
  await listRow("Standings");
  await userEvent.setup().click(screen.getByRole("tab", { name: t.track }));
  return screen.findByRole("slider", { name: t.opacity });
}
it.each([
  [0, "Ninguna sesión"],
  [1, "Solo en práctica"],
  [2, "Solo en qualy"],
  [3, "Práctica y qualy"],
  [4, "Solo en carrera"],
  [5, "Práctica y carrera"],
  [6, "Qualy y carrera"],
  [7, "Práctica, qualy y carrera"],
] as const)(
  "summarises session combination %s without invented defaults",
  (mask, expected) => {
    expect(
      sessionsSummary({
        showIn: {
          practice: !!(mask & 1),
          qualifying: !!(mask & 2),
          race: !!(mask & 4),
        },
      }),
    ).toBe(expected);
  },
);
it("keeps position and size read-only and gives a reason for placing being unavailable", async () => {
  mount();
  await openTrack();
  expect(screen.getByText(t.placeSummary(338, 304))).toBeTruthy();
  expect(screen.getAllByRole("slider")).toHaveLength(1);
  expect(screen.queryByRole("spinbutton")).toBeNull();
  expect(
    screen.getByRole("button", { name: t.edit }).hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.queryByRole("button", { name: t.remove })).toBeNull();
});
it("writes visibility with the observed revision and updates its summary", async () => {
  const requests = vi.spyOn(Client.prototype, "request");
  mount();
  await openTrack();
  await userEvent
    .setup()
    .click(screen.getByRole("switch", { name: t.visibleOnTrack }));
  await screen.findByText(t.trackVisibilitySummary(false, 100));
  expect(
    requests.mock.calls.some(
      ([r]) =>
        r.method === "studio.visibility" &&
        r.id === "widget-1" &&
        !r.visible &&
        r.baseRevision === "0".repeat(64),
    ),
  ).toBe(true);
});
it("writes only the session flag being toggled, preserving the other two", async () => {
  const requests = vi.spyOn(Client.prototype, "request");
  mount();
  await openTrack();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: t.practiceShort }));
  await screen.findByText("Qualy y carrera");
  const request = requests.mock.calls.find(
    ([r]) => r.method === "studio.instance",
  )?.[0];
  expect(request).toEqual({
    method: "studio.instance",
    id: "widget-1",
    baseRevision: "0".repeat(64),
    patch: {
      field: "showIn",
      value: { practice: false, qualifying: true, race: true },
    },
  });
});
it("writes only offTrack with CAS using a closed option", async () => {
  const requests = vi.spyOn(Client.prototype, "request");
  mount();
  await openTrack();
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: t.offTrack }));
  await user.click(await screen.findByRole("option", { name: t.offHide }));
  await waitFor(() =>
    expect(
      requests.mock.calls.some(
        ([r]) =>
          r.method === "studio.instance" &&
          r.patch.field === "offTrack" &&
          r.patch.value === "hide" &&
          r.baseRevision === "0".repeat(64),
      ),
    ).toBe(true),
  );
});
it("keeps a drag local and saves opacity once on pointer release", async () => {
  const requests = vi.spyOn(Client.prototype, "request");
  mount();
  const slider = await openTrack();
  const user = userEvent.setup();
  const control = slider.closest<HTMLElement>(".v-slider-control");
  if (!control) throw Error("Missing slider control");
  vi.spyOn(control, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 80,
    bottom: 22,
    width: 80,
    height: 22,
    toJSON() {},
  });
  Object.defineProperties(control, {
    setPointerCapture: { value: vi.fn(), configurable: true },
    hasPointerCapture: { value: () => false, configurable: true },
    releasePointerCapture: { value: vi.fn(), configurable: true },
  });
  await user.pointer({
    target: control,
    keys: "[MouseLeft>]",
    coords: { clientX: 40, clientY: 11 },
  });
  expect(slider.getAttribute("aria-valuenow")).toBe("60");
  await user.pointer({ target: control, coords: { clientX: 60, clientY: 11 } });
  expect(slider.getAttribute("aria-valuenow")).toBe("80");
  expect(
    requests.mock.calls.filter(([r]) => r.method === "studio.instance"),
  ).toHaveLength(0);
  await user.pointer({
    target: control,
    keys: "[/MouseLeft]",
    coords: { clientX: 60, clientY: 11 },
  });
  await within(
    screen.getByRole("region", { name: t.visibilityGroup }),
  ).findByText(t.trackVisibilitySummary(true, 80));
  expect(
    requests.mock.calls
      .filter(([r]) => r.method === "studio.instance")
      .map(([r]) => r),
  ).toEqual([
    {
      method: "studio.instance",
      id: "widget-1",
      baseRevision: "0".repeat(64),
      patch: { field: "opacity", value: 80 },
    },
  ]);
  expect(document.activeElement).toBe(slider);
});

it("rolls back failed opacity and keeps focus", async () => {
  mount();
  const slider = await openTrack();
  const original = Client.prototype.request;
  vi.spyOn(Client.prototype, "request").mockImplementation(function (
    this: Client,
    request,
    onSent,
  ) {
    if (
      request.method === "studio.instance" &&
      request.patch.field === "opacity"
    )
      return Promise.reject(new HostFailure({ kind: "busy" }));
    return original.call(this, request, onSent);
  });
  const user = userEvent.setup();
  await tabTo(user, slider);
  await user.keyboard("{ArrowLeft}");
  await screen.findByText(t.busy);
  await waitFor(() => expect(slider.getAttribute("aria-valuenow")).toBe("100"));
  expect(document.activeElement).toBe(slider);
  await user.click(screen.getByRole("button", { name: t.discard }));
  expect(slider.getAttribute("aria-valuenow")).toBe("100");
});
it("uses the fresh saved value after a conflict is discarded", async () => {
  mount();
  const slider = await openTrack();
  const original = Client.prototype.request;
  vi.spyOn(Client.prototype, "request").mockImplementation(async function (
    this: Client,
    request,
    onSent,
  ) {
    if (
      request.method === "studio.instance" &&
      request.patch.field === "opacity"
    ) {
      const response = await original.call(this, { method: "studio.get" });
      if (response.method !== "studio.get") throw Error("Missing view");
      response.value.instances[0].opacity = 80;
      throw new HostFailure({
        kind: "studioConflict",
        current: response.value,
      });
    }
    return original.call(this, request, onSent);
  });
  const user = userEvent.setup();
  await tabTo(user, slider);
  await user.keyboard("{ArrowLeft}");
  await screen.findByText(t.conflict);
  await waitFor(() => expect(slider.getAttribute("aria-valuenow")).toBe("80"));
  await user.click(screen.getByRole("button", { name: t.discard }));
  expect(slider.getAttribute("aria-valuenow")).toBe("80");
});
it("does not disable a focused slider or send a second write while pending", async () => {
  mount();
  const slider = await openTrack();
  const original = Client.prototype.request;
  let settle: undefined | (() => Promise<void>);
  const requests = vi
    .spyOn(Client.prototype, "request")
    .mockImplementation(function (this: Client, request, onSent) {
      if (
        request.method === "studio.instance" &&
        request.patch.field === "opacity"
      )
        return new Promise((resolve, reject) => {
          settle = async () => {
            try {
              resolve(await original.call(this, request, onSent));
            } catch (e) {
              reject(e);
            }
          };
        });
      return original.call(this, request, onSent);
    });
  const user = userEvent.setup();
  await tabTo(user, slider);
  await user.keyboard("{ArrowLeft}");
  expect(settle).toBeTypeOf("function");
  expect(slider.hasAttribute("disabled")).toBe(false);
  expect(document.activeElement).toBe(slider);
  await user.keyboard("{ArrowLeft}");
  expect(
    requests.mock.calls.filter(([r]) => r.method === "studio.instance"),
  ).toHaveLength(1);
  if (!settle) throw Error("Missing request");
  const finish = settle;
  await act(async () => {
    await finish();
  });
  await waitFor(() => expect(slider.getAttribute("aria-valuenow")).toBe("99"));
  expect(document.activeElement).toBe(slider);
});
