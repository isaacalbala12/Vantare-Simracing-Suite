// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type {
  HostError,
  Reply,
  Request,
  StudioView,
} from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus/studio.json";
import { UiProvider } from "../src/renderer/app/UiState";
import { HostFailure } from "../src/renderer/bridge/client";
import { studioText as studio } from "../src/renderer/i18n/studio";
import { studioContentText as text } from "../src/renderer/i18n/studio-content.es";
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

function view(): StudioView {
  const item = contentInstance();
  if (item.settings?.kind !== "standings" || !item.settings.columns)
    throw Error("standings fixture");
  const column = item.settings.columns.find(
    (column) => column.metricId === "driverName",
  );
  if (!column) throw Error("driver column");
  column.format.mode = "truncate";
  column.format.maxChars = 16;
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
  throw Error("Studio view fixture");
}
function confirmed(current: StudioView, value: number): StudioView {
  const next = structuredClone(current);
  next.revision = "b".repeat(64);
  const settings = next.instances[0].settings;
  if (settings?.kind !== "standings") throw Error("standings");
  const column = settings.columns?.find(
    (column) => column.metricId === "driverName",
  );
  if (!column) throw Error("column");
  column.format.maxChars = value;
  return next;
}
function Screen() {
  const state = useStudio();
  const item = state.view?.instances[0];
  return item ? <StudioSteps item={item} /> : null;
}
async function edit(decimals = false) {
  const initial = view();
  let accept: (reply: Reply) => void = () => {
    throw Error("No pending save");
  };
  let reject: (error: HostFailure) => void = () => {
    throw Error("No pending save");
  };
  transport.request.mockImplementation((request: Request) => {
    if (request.method === "studio.get")
      return Promise.resolve({ method: "studio.get", value: initial });
    if (request.method !== "studio.instance") throw Error("Unexpected request");
    return new Promise<Reply>((resolve, fail) => {
      accept = resolve;
      reject = fail;
    });
  });
  render(
    <CSPProvider disableStyleElements>
      <TooltipProvider>
        <UiProvider>
          <StudioProvider>
            <Screen />
          </StudioProvider>
        </UiProvider>
      </TooltipProvider>
    </CSPProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("tab", { name: studio.content }));
  if (decimals) {
    await user.click(screen.getByRole("combobox", { name: text.columnFormat }));
    await user.click(
      await screen.findByRole("option", { name: "Última vuelta" }),
    );
  }
  const input = screen.getByRole("textbox", {
    name: decimals ? text.decimals : text.maxChars,
  }) as HTMLInputElement;
  await user.clear(input);
  await user.type(input, decimals ? "02{Enter}" : "0022{Enter}");
  expect(input.value).toBe(decimals ? "02" : "0022");
  expect(input.readOnly).toBe(true);
  const request = transport.request.mock.calls.find(
    ([request]) => request.method === "studio.instance",
  )?.[0];
  expect(request).toMatchObject({
    baseRevision: initial.revision,
    patch: { field: "settings", value: { kind: "standings" } },
  });
  expect(
    request.patch.value.columns.find(
      (column: { metric: string }) =>
        column.metric === (decimals ? "lastLap" : "driverName"),
    ).format,
  ).toEqual(decimals ? { decimals: 2 } : { maxChars: 22 });
  return { initial, input, accept, reject };
}
it.each(["Rejected", "Unknown", "Conflict"] as const)(
  "retains the decimal draft and never calls it saved after %s",
  async (kind) => {
    const { initial, input, reject } = await edit(true);
    const error: HostError =
      kind === "Rejected"
        ? { kind: "rejected" }
        : kind === "Unknown"
          ? { kind: "coreUnavailable" }
          : { kind: "studioConflict", current: initial };
    await act(async () => reject(new HostFailure(error)));
    expect(input.value).toBe("02");
    expect(input.readOnly).toBe(false);
    expect(document.activeElement).toBe(input);
    const status = screen
      .getAllByRole("status")
      .find((node) => node.classList.contains("v-step-save"));
    expect(status?.getAttribute("data-failed")).toBe("true");
    expect(status?.textContent).toContain(studio.notSaved);
    expect(
      transport.request.mock.calls.filter(
        ([request]) => request.method === "studio.instance",
      ),
    ).toHaveLength(1);
  },
);
it.each(["Rejected", "Unknown", "Conflict"] as const)(
  "keeps the exact draft and marks it unsaved after %s",
  async (kind) => {
    const { initial, input, reject } = await edit();
    const error: HostError =
      kind === "Rejected"
        ? { kind: "rejected" }
        : kind === "Unknown"
          ? { kind: "coreUnavailable" }
          : { kind: "studioConflict", current: confirmed(initial, 19) };
    await act(async () => reject(new HostFailure(error)));
    expect(input.value).toBe("0022");
    expect(input.readOnly).toBe(false);
    expect(document.activeElement).toBe(input);
    const status = screen
      .getAllByRole("status")
      .find((node) => node.classList.contains("v-step-save"));
    expect(status?.getAttribute("data-failed")).toBe("true");
    expect(status?.textContent).toContain(studio.notSaved);
    expect(
      transport.request.mock.calls.filter(
        ([request]) => request.method === "studio.instance",
      ),
    ).toHaveLength(1);
  },
);
it("normalizes the draft only after the host confirms the requested value", async () => {
  const { initial, input, accept } = await edit();
  await act(async () =>
    accept({ method: "studio.instance", value: confirmed(initial, 22) }),
  );
  expect(input.value).toBe("22");
  expect(document.activeElement).toBe(input);
  const status = screen
    .getAllByRole("status")
    .find((node) => node.classList.contains("v-step-save"));
  expect(status?.getAttribute("data-failed")).toBe("false");
  expect(status?.textContent).toContain(studio.autoSaved);
});
