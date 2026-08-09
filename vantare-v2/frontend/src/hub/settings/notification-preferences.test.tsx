import { useEffect } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationPreferences } from "./notification-preferences";

type Handler = (event: { data: unknown }) => void;

const runtimeMock = vi.hoisted(() => ({
  handlers: new Map<string, Handler[]>(),
  emit: vi.fn(),
}));

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: (name: string, handler: Handler) => {
      runtimeMock.handlers.set(name, [...(runtimeMock.handlers.get(name) ?? []), handler]);
      return () => runtimeMock.handlers.delete(name);
    },
    Emit: runtimeMock.emit,
  },
}));

function dispatch(name: string, data: unknown) {
  act(() => {
    for (const handler of runtimeMock.handlers.get(name) ?? []) {
      handler({ data });
    }
  });
}

let renders = 0;

// Counted in an effect rather than during render: mutating during render is a
// side effect, and a render that bails out never commits anyway -- committed
// renders are the ones that cost.
function Probe() {
  useNotificationPreferences();
  useEffect(() => {
    renders += 1;
  });
  return null;
}

describe("useNotificationPreferences", () => {
  beforeEach(() => {
    runtimeMock.handlers.clear();
    runtimeMock.emit.mockClear();
    renders = 0;
  });

  afterEach(cleanup);

  // ChainRunnerProvider calls this hook and wraps the entire Hub, so a new
  // state identity here re-renders the whole application. Storing the incoming
  // object unconditionally did exactly that on every `settings` event, and the
  // app crawled. Repeated identical settings must not cost a render.
  it("does not re-render when the settings event carries the same choices", () => {
    render(<Probe />);
    const initial = renders;

    dispatch("settings", { cpuSampling: true, notifications: { updatesMuted: true } });
    const afterChange = renders;
    expect(afterChange).toBeGreaterThan(initial);

    for (let i = 0; i < 5; i += 1) {
      dispatch("settings", { cpuSampling: true, notifications: { updatesMuted: true } });
    }
    // React may still render once more before it notices the bail-out, so the
    // guarantee is that the cost does not grow with the number of events: five
    // identical ones used to cost five renders of the whole Hub.
    expect(renders - afterChange).toBeLessThanOrEqual(1);
  });

  // An unrelated setting changing is still a `settings` event, and it must not
  // drag the whole tree with it either.
  it("ignores settings events that leave the notification choices alone", () => {
    render(<Probe />);
    dispatch("settings", { cpuSampling: true, notifications: {} });
    const settled = renders;

    dispatch("settings", { cpuSampling: false, hotkeys: { toggleOverlay: "ctrl+x" } });

    expect(renders).toBe(settled);
  });

  it("still reacts when a choice actually changes", () => {
    render(<Probe />);
    dispatch("settings", { notifications: {} });
    const settled = renders;

    dispatch("settings", { notifications: { launcherMuted: true } });

    expect(renders).toBeGreaterThan(settled);
  });
});
