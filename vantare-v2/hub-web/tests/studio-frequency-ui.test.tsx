// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type {
  HostError,
  Reply,
  Request,
  StudioView,
} from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus/studio.json";
import {
  studioFrequencyOptions,
  type WidgetKind,
} from "../src/contract/generated/studio";
import { frequencyFor } from "../src/contract/studio-frequency";
import { UiProvider } from "../src/renderer/app/UiState";
import { HostFailure } from "../src/renderer/bridge/client";
import { studioText as studio } from "../src/renderer/i18n/studio";
import { studioFrequencyText as text } from "../src/renderer/i18n/studio-frequency.es";
import {
  StudioProvider,
  useStudio,
} from "../src/renderer/screens/studio/state";
import { TooltipProvider } from "../src/renderer/ui/Layers";
import { StudioSteps } from "../src/renderer/ui/studio/StudioSteps";
import { contentInstance } from "./helpers/studio-content";

const transport = vi.hoisted(() => ({
  request: vi.fn(),
  listen: () => () => {},
  subscribe: () => () => {},
}));
vi.mock("../src/renderer/app/Host", () => ({
  useHost: () => ({ client: transport }),
}));
afterEach(() => {
  cleanup();
  transport.request.mockReset();
});

function view(kind: WidgetKind, override: number | null): StudioView {
  const item = contentInstance(kind);
  item.frequency = frequencyFor(kind, "balanced", override);
  for (const message of corpus.host) {
    if (
      message.result &&
      "value" in message.result &&
      message.result.value.instances.length
    )
      return {
        ...(structuredClone(message.result.value) as StudioView),
        state: "ready",
        plan: "pro",
        revision: "a".repeat(64),
        instances: [item],
      };
  }
  throw Error("Studio fixture missing");
}
function Screen() {
  const state = useStudio();
  const item = state.view?.instances[0];
  return (
    <>
      {item && <StudioSteps item={item} />}
      {state.failure && <p role="alert">{state.failure.message}</p>}
    </>
  );
}
async function mount(
  kind: WidgetKind = "standings",
  override: number | null = null,
) {
  const initial = view(kind, override);
  let resolve!: (reply: Reply) => void;
  let reject!: (error: unknown) => void;
  transport.request.mockImplementation((request: Request) => {
    if (request.method === "studio.get")
      return Promise.resolve({ method: "studio.get", value: initial });
    return new Promise<Reply>((ok, fail) => {
      resolve = ok;
      reject = fail;
    });
  });
  render(
    <TooltipProvider>
      <UiProvider>
        <StudioProvider>
          <Screen />
        </StudioProvider>
      </UiProvider>
    </TooltipProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("tab", { name: studio.track }));
  return {
    initial,
    user,
    resolve: (reply: Reply) => resolve(reply),
    reject: (error: unknown) => reject(error),
  };
}
const choices = () => screen.getByRole("group", { name: text.choices });

it.each([null, ...studioFrequencyOptions.choices])(
  "writes the closed frequency %s with the observed CAS revision",
  async (value) => {
    const { initial, user, resolve } = await mount(
      "standings",
      value === null ? 20 : null,
    );
    const button = within(choices()).getByRole("button", {
      name: value === null ? text.inherit : text.hz(value),
    });
    await user.click(button);
    expect(transport.request).toHaveBeenLastCalledWith({
      method: "studio.instance",
      id: initial.instances[0].id,
      baseRevision: initial.revision,
      patch: { field: "frequency", value },
    });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(button);
    await user.click(button);
    expect(
      transport.request.mock.calls.filter(
        ([r]) => r.method === "studio.instance",
      ),
    ).toHaveLength(1);
    const next = structuredClone(initial);
    next.revision = "b".repeat(64);
    next.instances[0].frequency = frequencyFor("standings", "balanced", value);
    await act(async () => resolve({ method: "studio.instance", value: next }));
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(button);
    expect(screen.queryByText(studio.notSaved)).toBeNull();
  },
);

it.each(["rejected", "unknown", "conflict"] as const)(
  "does not confirm a %s write",
  async (kind) => {
    const { initial, user, reject } = await mount();
    await user.click(within(choices()).getByRole("button", { name: "10 Hz" }));
    const fresh = structuredClone(initial);
    fresh.revision = "c".repeat(64);
    fresh.instances[0].frequency = frequencyFor("standings", "balanced", 4);
    const error: HostError =
      kind === "conflict"
        ? { kind: "studioConflict", current: fresh }
        : { kind: "rejected" };
    await act(async () =>
      reject(
        kind === "unknown"
          ? new Error("uncertain transport")
          : new HostFailure(error),
      ),
    );
    expect(screen.getByText(studio.notSaved)).toBeTruthy();
    expect(
      within(choices())
        .getByRole("button", { name: "10 Hz" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      within(choices())
        .getByRole("button", {
          name: kind === "conflict" ? "4 Hz" : text.inherit,
        })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByText("uncertain transport")).toBeNull();
  },
);
it.each([0, 40])(
  "preserves stored %s without silently selecting or sending an override",
  async (override) => {
    await mount("standings", override);
    expect(within(choices()).getAllByRole("button")).toHaveLength(
      studioFrequencyOptions.choices.length + 1,
    );
    expect(
      within(choices())
        .getAllByRole("button")
        .some((button) => button.getAttribute("aria-pressed") === "true"),
    ).toBe(false);
    expect(screen.getByText(text.preserved)).toBeTruthy();
    expect(transport.request).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(
        text.applied(
          override === 0 ? text.snapshot : text.hz(override),
          "Equilibrado",
        ),
      ),
    ).toBeTruthy();
  },
);
it("does not offer a cadence editor for snapshot-driven flags", async () => {
  await mount("racing-flags", 40);
  expect(screen.getByText(text.flags)).toBeTruthy();
  expect(screen.queryByRole("group", { name: text.choices })).toBeNull();
  expect(transport.request).toHaveBeenCalledTimes(1);
});
it("does not write the already selected choice", async () => {
  const { user } = await mount();
  await user.click(
    within(choices()).getByRole("button", { name: text.inherit }),
  );
  expect(transport.request).toHaveBeenCalledTimes(1);
});
it("does not accept Hz while the previous opacity is only a local draft, then uses the confirmed revision", async () => {
  const { initial, user, resolve } = await mount();
  const slider = screen.getByRole("slider", { name: studio.opacity });
  slider.focus();
  await user.keyboard("{ArrowLeft}");
  const opacityRequest = transport.request.mock.lastCall?.[0] as Request;
  if (
    opacityRequest.method !== "studio.instance" ||
    opacityRequest.patch.field !== "opacity"
  )
    throw Error("Expected opacity write");
  const opacity = opacityRequest.patch.value;
  expect(slider.getAttribute("aria-valuetext")).toBe(
    studio.opacityValue(opacity),
  );
  const visibility = screen.getByRole("region", {
    name: studio.visibilityGroup,
  });
  expect(
    within(visibility).getByText(
      studio.trackVisibilitySummary(true, initial.instances[0].opacity),
    ),
  ).toBeTruthy();
  expect(
    within(visibility).queryByText(
      studio.trackVisibilitySummary(true, opacity),
    ),
  ).toBeNull();
  const hz = within(choices()).getByRole("button", { name: text.hz(10) });
  await user.click(hz);
  await user.keyboard("{Enter}");
  expect(
    transport.request.mock.calls.filter(
      ([r]) => r.method === "studio.instance",
    ),
  ).toHaveLength(1);
  const confirmed = structuredClone(initial);
  confirmed.revision = "b".repeat(64);
  confirmed.instances[0].opacity = opacity;
  await act(async () =>
    resolve({ method: "studio.instance", value: confirmed }),
  );
  expect(
    within(visibility).getByText(studio.trackVisibilitySummary(true, opacity)),
  ).toBeTruthy();
  expect(document.activeElement).toBe(hz);
  await user.keyboard("{Enter}");
  expect(transport.request).toHaveBeenLastCalledWith({
    method: "studio.instance",
    id: initial.instances[0].id,
    baseRevision: confirmed.revision,
    patch: { field: "frequency", value: 10 },
  });
  const final = structuredClone(confirmed);
  final.instances[0].frequency = frequencyFor("standings", "balanced", 10);
  await act(async () => resolve({ method: "studio.instance", value: final }));
  expect(hz.getAttribute("aria-pressed")).toBe("true");
});
