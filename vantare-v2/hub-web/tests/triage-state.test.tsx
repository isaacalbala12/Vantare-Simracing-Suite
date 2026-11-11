// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import corpus from "../src/contract/generated/corpus/triage.json";
import type { TriagePreview } from "../src/contract/generated/triage";
import { useTriageState } from "../src/renderer/screens/testing/TriageState";

afterEach(cleanup);
const sample = corpus.host[0].result.value;
if (typeof sample.id !== "string" || typeof sample.payload !== "string")
  throw new Error("missing Rust preview");
const preview: TriagePreview = { id: sample.id, payload: sample.payload };
it("drops a preparation that arrives after editing or changing the session", async () => {
  let finish!: (value: TriagePreview) => void;
  const prepare = vi.fn(
    () =>
      new Promise<TriagePreview>((resolve) => {
        finish = resolve;
      }),
  );
  const send = vi.fn(async () => {});
  const hook = renderHook(
    (props) => useTriageState({ ...props, prepare, send }),
    { initialProps: { session: {}, allowed: true, available: true } },
  );
  act(() => hook.result.current.accept(true));
  let pending!: Promise<void>;
  act(() => {
    pending = hook.result.current.prepareReport();
  });
  act(() => hook.result.current.editTitle("Edited while preparing"));
  await act(async () => {
    finish(preview);
    await pending;
  });
  expect(hook.result.current.preview).toBeUndefined();
  expect(hook.result.current.consent).toBe(false);
  act(() => hook.result.current.accept(true));
  act(() => {
    pending = hook.result.current.prepareReport();
  });
  hook.rerender({ session: {}, allowed: true, available: true });
  act(() => hook.result.current.editTitle("New account's note"));
  await act(async () => {
    finish(preview);
    await pending;
  });
  expect(hook.result.current.title).toBe("New account's note");
  expect(hook.result.current.preview).toBeUndefined();
  expect(hook.result.current.pending).toBe(false);
});
it("requires access, a connection and consent before asking to prepare", async () => {
  const prepare = vi.fn(async () => preview),
    send = vi.fn(async () => {});
  const session = {};
  const hook = renderHook(
    (props) => useTriageState({ ...props, prepare, send }),
    { initialProps: { session, allowed: false, available: false } },
  );
  act(() => hook.result.current.accept(true));
  await act(async () => {
    await hook.result.current.prepareReport();
  });
  expect(prepare).not.toHaveBeenCalled();
  hook.rerender({ session, allowed: true, available: true });
  await act(async () => {
    await hook.result.current.prepareReport();
  });
  expect(prepare).not.toHaveBeenCalled();
  act(() => hook.result.current.accept(true));
  await act(async () => {
    await hook.result.current.prepareReport();
  });
  expect(prepare).toHaveBeenCalledOnce();
});
