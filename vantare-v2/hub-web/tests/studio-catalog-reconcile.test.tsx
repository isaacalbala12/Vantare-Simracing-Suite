// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createMockHost } from "../src/mock/host";
import { HostFailure } from "../src/renderer/bridge/client";
import {
  StudioProvider,
  useStudio,
} from "../src/renderer/screens/studio/state";

const fake = vi.hoisted(() => ({
  request: vi.fn(),
  listen: vi.fn(() => () => {}),
  subscribe: vi.fn(() => () => {}),
}));
vi.mock("../src/renderer/app/Host", () => ({
  useHost: () => ({ client: fake }),
}));
vi.mock("../src/renderer/app/UiState", () => ({
  useUi: (selector: (state: unknown) => unknown) =>
    selector({ studioLastSelected: null, rememberStudio: () => {} }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Harness() {
  const state = useStudio();
  return (
    <>
      <output>{state.view?.instances.length ?? "loading"}</output>
      <span data-testid="fence">{String(state.needsRead)}</span>
      <button
        type="button"
        onClick={() =>
          state.view &&
          void state.execute({
            method: "studio.add",
            kind: "delta",
            at: { x: 100.25, y: 200.5 },
            baseRevision: state.view.revision,
          })
        }
      >
        Drop
      </button>
      <button type="button" onClick={state.retry}>
        Retry
      </button>
      <button
        type="button"
        onClick={() => void state.execute({ method: "studio.get" })}
      >
        Reload
      </button>
    </>
  );
}

it("reconciles an applied add timeout, fences while reading and never retries the add", async () => {
  const host = createMockHost("studio-canvas");
  let reads = 0;
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  fake.request.mockImplementation(async (request) => {
    if (request.method === "studio.get" && ++reads === 2) await held;
    const reply = host({ kind: "request", id: reads + 1, request });
    if (request.method === "studio.add")
      throw new HostFailure({ kind: "coreUnavailable" });
    if (reply?.kind !== "response") throw Error("unexpected mock reply");
    return reply.result;
  });
  render(
    <StudioProvider>
      <Harness />
    </StudioProvider>,
  );
  await screen.findByText("4");
  fireEvent.click(screen.getByText("Drop"));
  await waitFor(() =>
    expect(screen.getByTestId("fence").textContent).toBe("true"),
  );
  fireEvent.click(screen.getByText("Drop"));
  fireEvent.click(screen.getByText("Retry"));
  expect(
    fake.request.mock.calls.filter(([r]) => r.method === "studio.add"),
  ).toHaveLength(1);
  await act(async () => {
    release();
  });
  await screen.findByText("5");
  expect(screen.getByTestId("fence").textContent).toBe("false");
  fireEvent.click(screen.getByText("Retry"));
  expect(
    fake.request.mock.calls.filter(([r]) => r.method === "studio.add"),
  ).toHaveLength(1);
});
