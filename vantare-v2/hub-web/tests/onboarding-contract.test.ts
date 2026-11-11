import { expect, it } from "vitest";
import corpus from "../src/contract/generated/corpus/onboarding.json";
import {
  onboardingCpuLimit,
  onboardingEquipmentCountMax,
} from "../src/contract/generated/onboarding";
import { isOnboarding } from "../src/contract/modules/onboarding";
import { isHostMessage, isUiMessage } from "../src/contract/validation";
import { createMockHost } from "../src/mock/host";

it("accepts native examples and rejects inconsistent or open writes", () => {
  for (const value of corpus.ui) expect(isUiMessage(value)).toBe(true);
  for (const value of corpus.host) expect(isHostMessage(value)).toBe(true);
  const write = {
    kind: "request",
    id: 1,
    request: {
      method: "onboarding.finish",
      kit: ["delta"],
      level: "balanced",
      show: true,
      baseRevision: "a".repeat(64),
      layoutRevision: "b".repeat(64),
    },
  };
  expect(isUiMessage(write)).toBe(true);
  for (const patch of [
    { kit: [] },
    { kit: ["delta", "delta"] },
    { kit: ["unknown"] },
    { level: "auto" },
    { layoutRevision: "path" },
    { show: "true" },
    { path: "layout.json" },
  ])
    expect(
      isUiMessage({ ...write, request: { ...write.request, ...patch } }),
    ).toBe(false);
});
it("completes once and updates the shared settings mock", () => {
  const host = createMockHost("onboarding-7");
  for (const field of ["crashes", "usage"] as const) {
    const before = host({
      kind: "request",
      id: 10,
      request: { method: "privacy.get" },
    });
    if (before?.kind !== "response" || before.result.method !== "privacy.get")
      throw new Error("missing privacy");
    host({
      kind: "request",
      id: 11,
      request: {
        method: "privacy.update",
        patch: { field, value: false },
        baseRevision: before.result.value.revision,
      },
    });
  }
  const loaded = host({
    kind: "request",
    id: 1,
    request: { method: "onboarding.get" },
  });
  if (loaded?.kind !== "response" || loaded.result.method !== "onboarding.get")
    throw new Error("missing onboarding");
  const request = {
    method: "onboarding.finish",
    kit: ["delta"],
    level: "balanced",
    show: false,
    baseRevision: loaded.result.value.settingsRevision,
    layoutRevision: loaded.result.value.layoutRevision,
  };
  const finished = host({ kind: "request", id: 2, request });
  if (
    finished?.kind !== "response" ||
    finished.result.method !== "onboarding.finish"
  )
    throw new Error("missing completion");
  expect(finished.result.value.pending).toBe(false);
  expect(host({ kind: "request", id: 3, request })?.kind).toBe("failure");
  const settings = host({
    kind: "request",
    id: 4,
    request: { method: "settings.get" },
  });
  if (
    settings?.kind !== "response" ||
    settings.result.method !== "settings.get"
  )
    throw new Error("missing settings");
  expect(settings.result.value.general.onboarding_completed).toBe(true);
});
it("allows private escape only after a failed consent write without completing settings", () => {
  const host = createMockHost("onboarding-error-privacidad");
  expect(
    host({
      kind: "request",
      id: 1,
      request: { method: "onboarding.skipPrivate" },
    })?.kind,
  ).toBe("failure");
  const privacy = host({
    kind: "request",
    id: 2,
    request: { method: "privacy.get" },
  });
  if (privacy?.kind !== "response" || privacy.result.method !== "privacy.get")
    throw new Error("missing privacy");
  expect(
    host({
      kind: "request",
      id: 3,
      request: {
        method: "privacy.update",
        patch: { field: "usage", value: true },
        baseRevision: privacy.result.value.revision,
      },
    })?.kind,
  ).toBe("failure");
  expect(
    host({
      kind: "request",
      id: 4,
      request: { method: "onboarding.skipPrivate" },
    })?.kind,
  ).toBe("response");
  const settings = host({
    kind: "request",
    id: 5,
    request: { method: "settings.get" },
  });
  if (
    settings?.kind !== "response" ||
    settings.result.method !== "settings.get"
  )
    throw new Error("missing settings");
  expect(settings.result.value.general.onboarding_completed).toBe(false);
});

it("counts CPU Unicode characters exactly as Rust and rejects control characters", () => {
  const host = createMockHost("onboarding-4");
  const loaded = host({
    kind: "request",
    id: 1,
    request: { method: "onboarding.get" },
  });
  if (loaded?.kind !== "response" || loaded.result.method !== "onboarding.get")
    throw new Error("missing onboarding");
  const view = loaded.result.value;
  for (const character of ["a", "😀"]) {
    expect(
      isOnboarding({
        ...view,
        equipment: {
          ...view.equipment,
          cpu: character.repeat(onboardingCpuLimit),
        },
      }),
    ).toBe(true);
    expect(
      isOnboarding({
        ...view,
        equipment: {
          ...view.equipment,
          cpu: character.repeat(onboardingCpuLimit + 1),
        },
      }),
    ).toBe(false);
  }
  for (const code of [0, 31, 127, 128, 159])
    expect(
      isOnboarding({
        ...view,
        equipment: {
          ...view.equipment,
          cpu: `CPU${String.fromCodePoint(code)}`,
        },
      }),
    ).toBe(false);
});
it("keeps a failed consent write blocking completion even after reading decided permissions", () => {
  const host = createMockHost("onboarding-7");
  const initial = host({
    kind: "request",
    id: 1,
    request: { method: "privacy.get" },
  });
  if (initial?.kind !== "response" || initial.result.method !== "privacy.get")
    throw new Error("missing privacy");
  for (const field of ["usage", "crashes"] as const) {
    const current = host({
      kind: "request",
      id: 2,
      request: { method: "privacy.get" },
    });
    if (current?.kind !== "response" || current.result.method !== "privacy.get")
      throw new Error("missing privacy");
    host({
      kind: "request",
      id: 3,
      request: {
        method: "privacy.update",
        baseRevision: current.result.value.revision,
        patch: { field, value: false },
      },
    });
  }
  expect(
    host({
      kind: "request",
      id: 4,
      request: {
        method: "privacy.update",
        baseRevision: initial.result.value.revision,
        patch: { field: "usage", value: true },
      },
    })?.kind,
  ).toBe("failure");
  const reread = host({
    kind: "request",
    id: 5,
    request: { method: "privacy.get" },
  });
  if (reread?.kind !== "response" || reread.result.method !== "privacy.get")
    throw new Error("missing privacy");
  expect(
    reread.result.value.usageDecided && reread.result.value.crashesDecided,
  ).toBe(true);
  const loaded = host({
    kind: "request",
    id: 6,
    request: { method: "onboarding.get" },
  });
  if (loaded?.kind !== "response" || loaded.result.method !== "onboarding.get")
    throw new Error("missing onboarding");
  const request = {
    method: "onboarding.finish",
    kit: ["delta"],
    level: "balanced",
    show: false,
    baseRevision: loaded.result.value.settingsRevision,
    layoutRevision: loaded.result.value.layoutRevision,
  };
  expect(host({ kind: "request", id: 7, request })?.kind).toBe("failure");
  expect(
    host({
      kind: "request",
      id: 8,
      request: {
        method: "privacy.update",
        baseRevision: reread.result.value.revision,
        patch: { field: "usage", value: false },
      },
    })?.kind,
  ).toBe("response");
  expect(host({ kind: "request", id: 9, request })?.kind).toBe("response");
});

it("rejects equipment counts that cannot be represented by the native u32 fields", () => {
  const loaded = createMockHost("onboarding-4")({
    kind: "request",
    id: 1,
    request: { method: "onboarding.get" },
  });
  if (loaded?.kind !== "response" || loaded.result.method !== "onboarding.get")
    throw new Error("missing onboarding");
  const view = loaded.result.value;
  for (const field of ["cores", "ramGb"] as const) {
    expect(
      isOnboarding({
        ...view,
        equipment: { ...view.equipment, [field]: onboardingEquipmentCountMax },
      }),
    ).toBe(true);
    for (const value of [0, -1, 0.5, onboardingEquipmentCountMax + 1])
      expect(
        isOnboarding({
          ...view,
          equipment: { ...view.equipment, [field]: value },
        }),
      ).toBe(false);
  }
});
