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
const writes = () =>
  fake.client.request.mock.calls.filter(
    ([request]) => request.method === "mail.set",
  );
it.each([false, true])(
  "preserves server consent %s and never writes an untouched choice",
  async (saved) => {
    fake.client.request.mockResolvedValueOnce({
      method: "mail.get",
      value: { consent: saved },
    });
    const hook = renderHook(() => useOnboardingMail(true, true));
    await waitFor(() => expect(hook.result.current.mail.available).toBe(true));
    expect(hook.result.current.mail.consent).toBe(saved);
    await act(async () => {
      expect(await hook.result.current.commitMail()).toBe("ok");
    });
    expect(writes()).toHaveLength(0);
  },
);
it.each([false, true])(
  "only saves an explicit change from %s, once at Terminar",
  async (saved) => {
    fake.client.request.mockResolvedValueOnce({
      method: "mail.get",
      value: { consent: saved },
    });
    const hook = renderHook(() => useOnboardingMail(true, true));
    await waitFor(() => expect(hook.result.current.mail.available).toBe(true));
    act(() => hook.result.current.mail.onChange?.(!saved));
    expect(writes()).toHaveLength(0);
    await act(async () => {
      expect(await hook.result.current.commitMail()).toBe("ok");
    });
    expect(writes().map(([request]) => request)).toEqual([
      { method: "mail.set", consent: !saved, source: "onboarding" },
    ]);
    await act(async () => {
      expect(await hook.result.current.commitMail()).toBe("ok");
    });
    expect(writes()).toHaveLength(1);
  },
);
it("does not write when the user returns to the stored value", async () => {
  const hook = renderHook(() => useOnboardingMail(true, true));
  await waitFor(() => expect(hook.result.current.mail.available).toBe(true));
  act(() => hook.result.current.mail.onChange?.(true));
  act(() => hook.result.current.mail.onChange?.(false));
  await act(async () => {
    expect(await hook.result.current.commitMail()).toBe("ok");
  });
  expect(writes()).toHaveLength(0);
});
it("discards a late read after losing the session and clears a staged choice", async () => {
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
  expect(hook.result.current.mail.message).toContain("Sin cuenta");
  await act(async () => {
    expect(await hook.result.current.commitMail()).toBe("ok");
  });
  expect(writes()).toHaveLength(0);
});
it("commit during loading returns failed without writing or throwing", async () => {
  fake.client.request.mockImplementationOnce(() => new Promise(() => {}));
  const hook = renderHook(() => useOnboardingMail(true, true));
  expect(hook.result.current.mail.reading).toBe(true);
  await act(async () => {
    expect(await hook.result.current.commitMail()).toBe("failed");
  });
  expect(writes()).toHaveLength(0);
  expect(hook.result.current.mail.unconfirmed).toBe(true);
});
it.each(["account.get", "mail.set"])(
  "%s failure is optional, unconfirmed and retriable",
  async (method) => {
    const hook = renderHook(() => useOnboardingMail(true, true));
    await waitFor(() => expect(hook.result.current.mail.available).toBe(true));
    act(() => hook.result.current.mail.onChange?.(true));
    const original = fake.client.request.getMockImplementation();
    if (!original) throw new Error("Missing host test implementation");
    fake.client.request.mockImplementation(async (request) => {
      if (request.method === method) throw new HostFailure({ kind: "io" });
      return original(request);
    });
    await act(async () => {
      expect(await hook.result.current.commitMail()).toBe("failed");
    });
    expect(hook.result.current.mail.unconfirmed).toBe(true);
    expect(hook.result.current.mail.message).toContain("Correos sin confirmar");
    fake.client.request.mockImplementation(original);
    await act(async () => {
      expect(await hook.result.current.commitMail()).toBe("ok");
    });
    expect(hook.result.current.mail.unconfirmed).toBe(false);
  },
);
it("rejects a changed account gate without sending consent", async () => {
  const hook = renderHook(() => useOnboardingMail(true, true));
  await waitFor(() => expect(hook.result.current.mail.available).toBe(true));
  act(() => hook.result.current.mail.onChange?.(true));
  fake.client.request.mockResolvedValueOnce({
    method: "account.get",
    value: { session: "signedOut", gate: "choose", blocked: false },
  });
  await act(async () => {
    expect(await hook.result.current.commitMail()).toBe("failed");
  });
  expect(writes()).toHaveLength(0);
  expect(hook.result.current.mail.unconfirmed).toBe(true);
});
it.each(["coreUnavailable", "denied"] as const)(
  "%s read keeps the optional setting disabled and unconfirmed",
  async (kind) => {
    fake.client.request.mockRejectedValueOnce(new HostFailure({ kind }));
    const hook = renderHook(() => useOnboardingMail(true, true));
    await waitFor(() => expect(hook.result.current.mail.pending).toBe(false));
    expect(hook.result.current.mail.available).toBe(false);
    expect(hook.result.current.mail.unconfirmed).toBe(true);
    await act(async () => {
      expect(await hook.result.current.commitMail()).toBe("ok");
    });
    expect(writes()).toHaveLength(0);
  },
);
