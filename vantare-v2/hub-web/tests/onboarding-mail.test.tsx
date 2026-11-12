// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HostFailure } from "../src/renderer/bridge/client";
import { useOnboardingMail } from "../src/renderer/screens/onboarding/useMail";

const fake = vi.hoisted(() => ({ client: { request: vi.fn() } }));
vi.mock("../src/renderer/app/Host", () => ({
  useHost: () => ({ client: fake.client }),
}));
beforeEach(() => {
  fake.client.request.mockReset().mockImplementation(async (request) => {
    if (request.method === "mail.get")
      return { method: "mail.get", value: { consent: false } };
    if (request.method === "account.get")
      return {
        method: "account.get",
        value: { session: "signedIn", gate: "none", blocked: false },
      };
    return { method: "mail.set", value: { consent: request.consent } };
  });
});
afterEach(cleanup);
it("discards a late mail read after the session disappears", async () => {
  let reply!: (value: unknown) => void;
  fake.client.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        reply = resolve;
      }),
  );
  const hook = renderHook(({ allowed }) => useOnboardingMail(allowed, true), {
    initialProps: { allowed: true },
  });
  hook.rerender({ allowed: false });
  await act(async () =>
    reply({ method: "mail.get", value: { consent: true } }),
  );
  expect(hook.result.current.mail.available).toBe(false);
  expect(hook.result.current.mail.consent).toBe(false);
  expect(fake.client.request).toHaveBeenCalledTimes(1);
});
it("starts unchecked, stages changes and saves only on Finish with onboarding origin", async () => {
  const hook = renderHook(() => useOnboardingMail(true, true));
  await waitFor(() => expect(hook.result.current.mail.available).toBe(true));
  expect(hook.result.current.mail.consent).toBe(false);
  act(() => hook.result.current.mail.onChange?.(true));
  expect(
    fake.client.request.mock.calls.map(([request]) => request.method),
  ).toEqual(["mail.get"]);
  await act(async () => hook.result.current.commitMail());
  expect(fake.client.request).toHaveBeenLastCalledWith({
    method: "mail.set",
    consent: true,
    source: "onboarding",
  });
  await act(async () => hook.result.current.commitMail());
  expect(
    fake.client.request.mock.calls.filter(
      ([request]) => request.method === "mail.set",
    ),
  ).toHaveLength(1);
});
it("does not adopt a previous opt-in; an unchecked Finish explicitly turns it off", async () => {
  fake.client.request.mockResolvedValueOnce({
    method: "mail.get",
    value: { consent: true },
  });
  const hook = renderHook(() => useOnboardingMail(true, true));
  await waitFor(() => expect(hook.result.current.mail.available).toBe(true));
  expect(hook.result.current.mail.consent).toBe(false);
  await act(async () => hook.result.current.commitMail());
  expect(fake.client.request).toHaveBeenLastCalledWith({
    method: "mail.set",
    consent: false,
    source: "onboarding",
  });
});
it("disables and explains mail without a session, including after a staged opt-in", async () => {
  const hook = renderHook(({ allowed }) => useOnboardingMail(allowed, true), {
    initialProps: { allowed: true },
  });
  await waitFor(() => expect(hook.result.current.mail.available).toBe(true));
  act(() => hook.result.current.mail.onChange?.(true));
  hook.rerender({ allowed: false });
  expect(hook.result.current.mail.available).toBe(false);
  expect(hook.result.current.mail.consent).toBe(false);
  expect(hook.result.current.mail.message).toContain("Sin cuenta");
  await act(async () => hook.result.current.commitMail());
  expect(
    fake.client.request.mock.calls.filter(
      ([request]) => request.method === "mail.set",
    ),
  ).toHaveLength(0);
});
it("does not save when account revalidation fails and allows a deliberate retry", async () => {
  const hook = renderHook(() => useOnboardingMail(true, true));
  await waitFor(() => expect(hook.result.current.mail.available).toBe(true));
  act(() => hook.result.current.mail.onChange?.(true));
  fake.client.request.mockResolvedValueOnce({
    method: "account.get",
    value: { session: "signedOut", gate: "choose", blocked: false },
  });
  await expect(hook.result.current.commitMail()).rejects.toEqual(
    new HostFailure({ kind: "denied" }),
  );
  expect(
    fake.client.request.mock.calls.filter(
      ([request]) => request.method === "mail.set",
    ),
  ).toHaveLength(0);
  await act(async () => hook.result.current.commitMail());
  expect(fake.client.request).toHaveBeenLastCalledWith({
    method: "mail.set",
    consent: true,
    source: "onboarding",
  });
});
it("a failed consent write is retriable and an unavailable read cannot opt in", async () => {
  const hook = renderHook(() => useOnboardingMail(true, true));
  await waitFor(() => expect(hook.result.current.mail.available).toBe(true));
  act(() => hook.result.current.mail.onChange?.(true));
  fake.client.request
    .mockImplementationOnce(async () => ({
      method: "account.get",
      value: { session: "signedIn", gate: "none", blocked: false },
    }))
    .mockRejectedValueOnce(new HostFailure({ kind: "io" }));
  await expect(hook.result.current.commitMail()).rejects.toEqual(
    new HostFailure({ kind: "io" }),
  );
  await act(async () => hook.result.current.commitMail());
  hook.unmount();
  fake.client.request.mockRejectedValueOnce(
    new HostFailure({ kind: "coreUnavailable" }),
  );
  const unavailable = renderHook(() => useOnboardingMail(true, true));
  await waitFor(() =>
    expect(unavailable.result.current.mail.pending).toBe(false),
  );
  expect(unavailable.result.current.mail.available).toBe(false);
  expect(unavailable.result.current.mail.message).toContain("sin modificarlo");
});
