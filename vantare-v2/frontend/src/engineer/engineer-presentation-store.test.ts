import { describe, expect, it, vi } from "vitest";
import {
  createEngineerPresentationStore,
  parseEngineerPresentation,
} from "./engineer-presentation-store";

const presentation = {
  version: 1,
  id: "spotter-left-1",
  category: "spotter",
  severity: "critical",
  textKey: "spotter.car_left",
  text: "Coche a la izquierda",
  voiceText: "Coche a la izquierda",
  locale: "es",
  role: "spotter",
  channel: "spotter",
  priority: 100,
  createdAt: 1_000,
  expiresAt: 4_000,
  source: "telemetry-core",
} as const;

describe("engineer presentation projection", () => {
  it("accepts the exact ENG-07 presentation and rejects incomplete legacy payloads", () => {
    expect(parseEngineerPresentation(presentation)).toEqual(presentation);
    expect(() => parseEngineerPresentation({ ...presentation, text: "" })).toThrow();
    expect(() => parseEngineerPresentation({ ...presentation, locale: "fr" })).toThrow();
    expect(() => parseEngineerPresentation({ ...presentation, role: "system" })).toThrow();
    expect(() => parseEngineerPresentation({ ...presentation, version: 2 })).toThrow();
  });

  it("projects replacement and canonical expiry without a React-owned lifecycle", () => {
    let now = 1_000;
    let expiryCallback: (() => void) | undefined;
    const store = createEngineerPresentationStore({
      now: () => now,
      schedule: (callback) => {
        expiryCallback = callback;
        return 1;
      },
      cancelSchedule: vi.fn(),
    });
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.publish(presentation)).toBe(true);
    expect(store.getSnapshot()?.id).toBe("spotter-left-1");

    const replacement = { ...presentation, id: "engineer-fuel-1", role: "engineer" as const, channel: "engineer" as const };
    expect(store.publish(replacement)).toBe(true);
    expect(store.getSnapshot()?.id).toBe("engineer-fuel-1");

    now = replacement.expiresAt;
    expiryCallback?.();
    expect(store.getSnapshot()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("clears explicitly on a source boundary", () => {
    const store = createEngineerPresentationStore({ now: () => 1_000 });
    store.publish(presentation);
    store.clear("source-unavailable");
    expect(store.getSnapshot()).toBeNull();
  });
});
