// @vitest-environment jsdom
import {
  act,
  cleanup,
  renderHook as renderMailHook,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AccountView } from "../src/contract/generated/contract";
import {
  AccountSessionContext,
  createAccountSession,
} from "../src/renderer/app/AccountSession";
import { HostFailure } from "../src/renderer/bridge/client";
import { useOnboardingMail } from "../src/renderer/screens/onboarding/useMail";

const fake = vi.hoisted(() => ({ client: { request: vi.fn() } }));
let session: ReturnType<typeof createAccountSession>;
const confirm = () =>
  session.confirm({
    session: "signedIn",
    gate: "none",
    blocked: false,
  } as AccountView);
const renderHook: typeof renderMailHook = (callback, options) =>
  renderMailHook(callback, {
    ...options,
    wrapper: ({ children }) => (
      <AccountSessionContext.Provider value={session}>
        {children}
      </AccountSessionContext.Provider>
    ),
  });
vi.mock("../src/renderer/app/Host", () => ({
  useHost: () => ({ client: fake.client }),
}));
beforeEach(() => {
  session = createAccountSession();
  confirm();
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

it("does not read optional mail with allowed access but an unconfirmed session", async () => {
  session.confirm({
    session: "pending",
    gate: "none",
    blocked: false,
  } as AccountView);
  const hook = renderHook(() => useOnboardingMail(true, true));
  await act(async () => {});
  expect(fake.client.request).not.toHaveBeenCalled();
  expect(hook.result.current.mail.available).toBe(false);
});

it("reports an unconfirmed session at Finish as failed without writing mail", async () => {
  const hook = renderHook(() => useOnboardingMail(true, true));
  await waitFor(() => expect(hook.result.current.mail.available).toBe(true));
  act(() => hook.result.current.mail.onChange?.(true));
  act(() =>
    session.confirm({
      session: "pending",
      gate: "none",
      blocked: false,
    } as AccountView),
  );
  await act(async () =>
    expect(await hook.result.current.commitMail()).toBe("failed"),
  );
  expect(hook.result.current.mail.message).toContain("Correos sin confirmar");
  expect(hook.result.current.mail.unconfirmed).toBe(true);
  expect(writes()).toHaveLength(0);
});

it("clears the saved consent and staged intent on A to B without losing allowed", async () => {
  const hook = renderHook(() => useOnboardingMail(true, true));
  await waitFor(() => expect(hook.result.current.mail.available).toBe(true));
  act(() => hook.result.current.mail.onChange?.(true));
  act(() => {
    session.invalidate();
    confirm();
  });
  await waitFor(() => expect(hook.result.current.mail.available).toBe(true));
  expect(hook.result.current.mail.consent).toBe(false);
  await act(async () => {
    await hook.result.current.commitMail();
  });
  expect(writes()).toHaveLength(0);
});

it("ignores a late consent read from A after B is already loaded", async () => {
  let resolve!: (reply: unknown) => void;
  fake.client.request.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const hook = renderHook(() => useOnboardingMail(true, true));
  act(() => {
    session.invalidate();
    confirm();
  });
  await waitFor(() => expect(hook.result.current.mail.available).toBe(true));
  await act(async () => {
    resolve({ method: "mail.get", value: { consent: true } });
  });
  expect(hook.result.current.mail.consent).toBe(false);
});

it.each(["account.get", "mail.set"])(
  "discards A's late %s response without applying consent to B",
  async (method) => {
    const hook = renderHook(() => useOnboardingMail(true, true));
    await waitFor(() => expect(hook.result.current.mail.available).toBe(true));
    act(() => hook.result.current.mail.onChange?.(true));
    const original = fake.client.request.getMockImplementation();
    if (!original) throw Error("missing host");
    let resolve!: (reply: unknown) => void;
    fake.client.request.mockImplementation((request) =>
      request.method === method
        ? new Promise((done) => {
            resolve = done;
          })
        : original(request),
    );
    let pending!: Promise<"ok" | "failed">;
    act(() => {
      pending = hook.result.current.commitMail();
    });
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    act(() => {
      session.invalidate();
      confirm();
    });
    await waitFor(() => expect(hook.result.current.mail.available).toBe(true));
    await act(async () => {
      resolve(
        method === "account.get"
          ? {
              method,
              value: { session: "signedIn", gate: "none", blocked: false },
            }
          : { method, value: { consent: true } },
      );
      expect(await pending).toBe("failed");
    });
    expect(hook.result.current.mail.consent).toBe(false);
    expect(hook.result.current.mail.unconfirmed).toBe(false);
    expect(writes()).toHaveLength(method === "mail.set" ? 1 : 0);
  },
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
