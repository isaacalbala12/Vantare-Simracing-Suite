// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  AccountView,
  HostToUi,
  PilotView,
} from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus.json";
import {
  AccountSessionContext,
  createAccountSession,
} from "../src/renderer/app/AccountSession";
import { PilotProvider, usePilot } from "../src/renderer/app/PilotState";
import { openPilotPhoto } from "../src/renderer/screens/settings/pilot-photo";

const fake = vi.hoisted(() => ({
  client: { request: vi.fn(), addCloseGuard: vi.fn(() => () => {}) },
}));
vi.mock("../src/renderer/app/Host", () => ({
  useHost: () => ({ client: fake.client }),
}));
vi.mock("../src/renderer/screens/settings/pilot-photo", () => ({
  openPilotPhoto: vi.fn(),
  encodePilotPhoto: vi.fn(),
}));
let session: ReturnType<typeof createAccountSession>;
let view: PilotView;
function confirm() {
  session.confirm({
    session: "signedIn",
    gate: "none",
    blocked: false,
  } as AccountView);
}
beforeEach(() => {
  session = createAccountSession();
  confirm();
  const sample = (corpus.host as HostToUi[]).find(
    (m) => m.kind === "response" && m.result.method === "pilot.load",
  );
  if (sample?.kind !== "response" || sample.result.method !== "pilot.load")
    throw Error("missing pilot fixture");
  view = structuredClone(sample.result.value);
  fake.client.request.mockReset().mockImplementation(async (r) => ({
    method: r.method,
    value: { ...view, fields: r.fields ?? view.fields },
  }));
  vi.mocked(openPilotPhoto).mockReset();
});
afterEach(cleanup);
function mount() {
  return renderHook(usePilot, {
    wrapper: ({ children }) => (
      <AccountSessionContext.Provider value={session}>
        <PilotProvider>{children}</PilotProvider>
      </AccountSessionContext.Provider>
    ),
  });
}
function nextAccount() {
  act(() => {
    session.invalidate();
    confirm();
  });
}
function deferred() {
  let resolve!: (reply: unknown) => void;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function load(h: ReturnType<typeof mount>) {
  await act(async () => {
    await h.result.current.load();
  });
}
it("clears A's unsaved fields and photo synchronously without unconfirming core access", async () => {
  const h = mount();
  await load(h);
  const image = {
    width: 500,
    height: 500,
    close: vi.fn(),
  } as unknown as ImageBitmap;
  vi.mocked(openPilotPhoto).mockResolvedValue(image);
  act(() => h.result.current.edit({ ...view.fields, publicName: "UNSAVED_A" }));
  await act(async () => {
    await h.result.current.choosePhoto(new File(["QA"], "qa.png"));
  });
  nextAccount();
  expect(h.result.current.view).toBeUndefined();
  expect(h.result.current.draft).toBeUndefined();
  expect(h.result.current.photo).toBeUndefined();
  expect(h.result.current.dirty).toBe(false);
  expect(h.result.current.sessionDiscarded).toBe(true);
  expect(image.close).toHaveBeenCalledTimes(1);
  view = { ...view, fields: { ...view.fields, publicName: "B" } };
  await load(h);
  expect(h.result.current.draft?.publicName).toBe("B");
  expect(h.result.current.sessionDiscarded).toBe(true);
  act(() =>
    h.result.current.edit({ ...view.fields, favoriteCar: "Nueva elección" }),
  );
  expect(h.result.current.sessionDiscarded).toBe(false);
});
it.each(["load", "save", "retry"] as const)(
  "ignores a late %s from A and never continues retry into B",
  async (method) => {
    const h = mount();
    await load(h);
    act(() => h.result.current.edit({ ...view.fields, publicName: "A" }));
    const old = deferred();
    fake.client.request.mockImplementationOnce(() => old.promise);
    let operation!: Promise<void>;
    act(() => {
      operation = h.result.current[method]();
    });
    nextAccount();
    view = { ...view, fields: { ...view.fields, publicName: "B" } };
    await load(h);
    const calls = fake.client.request.mock.calls.length;
    await act(async () => {
      old.resolve({
        method: method === "save" ? "pilot.save" : "pilot.load",
        value: { ...view, fields: { ...view.fields, publicName: "A" } },
      });
      await operation;
    });
    expect(h.result.current.draft?.publicName).toBe("B");
    expect(h.result.current.lastSaved).toBe(false);
    expect(fake.client.request).toHaveBeenCalledTimes(calls);
  },
);
it("a stale operation cannot clear B's busy lock or error state", async () => {
  const h = mount();
  const a = deferred(),
    b = deferred();
  fake.client.request
    .mockImplementationOnce(() => a.promise)
    .mockImplementationOnce(() => b.promise);
  let first!: Promise<void>, second!: Promise<void>;
  act(() => {
    first = h.result.current.load();
  });
  nextAccount();
  act(() => {
    second = h.result.current.load();
  });
  await act(async () => {
    a.resolve({ method: "pilot.load", value: view });
    await first;
  });
  expect(h.result.current.busy).toBe(true);
  expect(h.result.current.view).toBeUndefined();
  await act(async () => {
    b.resolve({ method: "pilot.load", value: view });
    await second;
  });
  expect(h.result.current.busy).toBe(false);
});
it("closes a decoder result arriving after the account boundary", async () => {
  const h = mount();
  const photo = deferred();
  vi.mocked(openPilotPhoto).mockReturnValue(
    photo.promise as Promise<ImageBitmap>,
  );
  const image = {
    width: 500,
    height: 500,
    close: vi.fn(),
  } as unknown as ImageBitmap;
  let pending!: Promise<void>;
  act(() => {
    pending = h.result.current.choosePhoto(new File(["QA"], "qa.png"));
  });
  nextAccount();
  await act(async () => {
    photo.resolve(image);
    await pending;
  });
  expect(image.close).toHaveBeenCalledTimes(1);
  expect(h.result.current.photo).toBeUndefined();
  expect(h.result.current.photoBusy).toBe(false);
});
it("does not read or edit a pilot while the session is unconfirmed", async () => {
  const h = mount();
  act(() => session.invalidate());
  await load(h);
  act(() => h.result.current.edit(view.fields));
  expect(fake.client.request).not.toHaveBeenCalled();
  expect(h.result.current.draft).toBeUndefined();
});
it("preserves the stable guest's local profile without authenticating reports or mail", async () => {
  session.confirm({
    session: "signedOut",
    gate: "none",
    blocked: false,
  } as AccountView);
  const h = mount();
  expect(session.getSnapshot().confirmed).toBe(false);
  expect(h.result.current.available).toBe(true);
  await load(h);
  expect(h.result.current.draft).toEqual(view.fields);
});
