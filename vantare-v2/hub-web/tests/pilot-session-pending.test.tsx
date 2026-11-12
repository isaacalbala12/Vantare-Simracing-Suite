// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AccountView, HostToUi } from "../src/contract/generated/contract";
import corpus from "../src/contract/generated/corpus.json";
import {
  AccountSessionContext,
  createAccountSession,
} from "../src/renderer/app/AccountSession";
import { PilotProvider, usePilot } from "../src/renderer/app/PilotState";

const fake = vi.hoisted(() => ({
  client: { request: vi.fn(), addCloseGuard: () => () => {} },
}));
vi.mock("../src/renderer/app/Host", () => ({
  useHost: () => ({ client: fake.client }),
}));
afterEach(cleanup);

it("discards an in-flight pilot read across pending and signedIn in the same generation", async () => {
  const session = createAccountSession();
  const confirm = (state: "pending" | "signedIn") =>
    session.confirm({
      session: state,
      gate: "none",
      blocked: false,
    } as AccountView);
  confirm("signedIn");
  const sample = (corpus.host as HostToUi[]).find(
    (m) => m.kind === "response" && m.result.method === "pilot.load",
  );
  if (sample?.kind !== "response" || sample.result.method !== "pilot.load")
    throw Error("missing pilot fixture");
  const pilot = sample.result.value;
  let resolve!: (value: unknown) => void;
  fake.client.request.mockReset().mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const hook = renderHook(usePilot, {
    wrapper: ({ children }) => (
      <AccountSessionContext.Provider value={session}>
        <PilotProvider>{children}</PilotProvider>
      </AccountSessionContext.Provider>
    ),
  });
  let operation!: Promise<void>;
  act(() => {
    operation = hook.result.current.load();
  });
  expect(fake.client.request).toHaveBeenCalledOnce();
  const generation = session.getSnapshot().generation;
  act(() => confirm("pending"));
  expect(hook.result.current.available).toBe(false);
  act(() => confirm("signedIn"));
  expect(session.getSnapshot().generation).toBe(generation);
  expect(hook.result.current.available).toBe(true);
  await act(async () => {
    resolve({
      method: "pilot.load",
      value: {
        ...pilot,
        fields: { ...pilot.fields, publicName: "OLD_ACCOUNT" },
      },
    });
    await operation;
  });
  expect(hook.result.current.view).toBeUndefined();
  expect(hook.result.current.draft).toBeUndefined();
  expect(hook.result.current.busy).toBe(false);
});
