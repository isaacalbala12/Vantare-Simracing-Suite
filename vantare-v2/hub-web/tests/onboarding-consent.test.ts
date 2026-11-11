import { expect, it, vi } from "vitest";
import fixture from "../fixtures/privacy-base.json";
import type {
  PrivacyView,
  Reply,
  Request,
} from "../src/contract/generated/contract";
import { HostFailure } from "../src/renderer/bridge/client";
import {
  canEnterPrivate,
  saveConsents,
} from "../src/renderer/screens/onboarding/consent";

const initial: PrivacyView = {
  ...fixture,
  crashes: false,
  usage: false,
  crashesDecided: false,
  usageDecided: false,
  revision: "0".repeat(64),
};
it("saves explicit choices in order with each durable revision", async () => {
  const first = {
    ...initial,
    crashes: true,
    crashesDecided: true,
    revision: "1".repeat(64),
  };
  const final = { ...first, usageDecided: true, revision: "2".repeat(64) };
  const request = vi
    .fn<(request: Request) => Promise<Reply>>()
    .mockResolvedValueOnce({ method: "privacy.get", value: initial })
    .mockResolvedValueOnce({ method: "privacy.update", value: first })
    .mockResolvedValueOnce({ method: "privacy.update", value: final });
  const publish = vi.fn();
  await expect(
    saveConsents({ request }, { crashes: true, usage: false }, publish),
  ).resolves.toEqual(final);
  expect(request.mock.calls.map(([request]) => request)).toEqual([
    { method: "privacy.get" },
    {
      method: "privacy.update",
      baseRevision: initial.revision,
      patch: { field: "crashes", value: true },
    },
    {
      method: "privacy.update",
      baseRevision: first.revision,
      patch: { field: "usage", value: false },
    },
  ]);
  expect(publish).toHaveBeenLastCalledWith(final);
});
it("does not keep rewriting already confirmed choices when retrying", async () => {
  const coherent = { ...initial, crashesDecided: true, usageDecided: true };
  const request = vi
    .fn<(request: Request) => Promise<Reply>>()
    .mockResolvedValue({ method: "privacy.get", value: coherent });
  await saveConsents({ request }, { crashes: false, usage: false }, () => {});
  expect(request).toHaveBeenCalledExactlyOnceWith({ method: "privacy.get" });
});
it("publishes partial success and forbids private escape over a durable opt-in", async () => {
  const saved = {
    ...initial,
    crashes: true,
    crashesDecided: true,
    revision: "1".repeat(64),
  };
  const error = new HostFailure({ kind: "io" });
  const request = vi
    .fn<(request: Request) => Promise<Reply>>()
    .mockResolvedValueOnce({ method: "privacy.get", value: initial })
    .mockResolvedValueOnce({ method: "privacy.update", value: saved })
    .mockRejectedValueOnce(error);
  const publish = vi.fn();
  await expect(
    saveConsents({ request }, { crashes: true, usage: false }, publish),
  ).rejects.toBe(error);
  expect(publish).toHaveBeenLastCalledWith(saved);
  expect(canEnterPrivate(error, saved)).toBe(false);
});
it("keeps the durable choice from cleanup failures and never offers escape for conflicts", async () => {
  const current = {
    ...initial,
    crashes: true,
    crashesDecided: true,
    cleanupPending: true,
  };
  const cleanup = new HostFailure({ kind: "privacyCleanup", current });
  const request = vi
    .fn<(request: Request) => Promise<Reply>>()
    .mockResolvedValueOnce({ method: "privacy.get", value: initial })
    .mockRejectedValueOnce(cleanup);
  const publish = vi.fn();
  await expect(
    saveConsents({ request }, { crashes: true, usage: false }, publish),
  ).rejects.toBe(cleanup);
  expect(publish).toHaveBeenLastCalledWith(current);
  expect(canEnterPrivate(cleanup, current)).toBe(false);
  expect(
    canEnterPrivate(
      new HostFailure({ kind: "privacyConflict", current: initial }),
      initial,
    ),
  ).toBe(false);
  expect(canEnterPrivate(new HostFailure({ kind: "io" }), initial)).toBe(true);
  expect(
    canEnterPrivate(new HostFailure({ kind: "io" }), {
      ...initial,
      protected: true,
    }),
  ).toBe(false);
});
