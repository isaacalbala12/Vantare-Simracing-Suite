import { describe, expect, it } from "vitest";
import type { EngineerNotification } from "../../engineer/engineer-types";
import {
  clockOf,
  mergeMessages,
  modeOf,
  normalizeSensitivity,
  outputBadge,
  radioFeed,
} from "./engineer-orbit-model";

function message(id: string, role: "spotter" | "engineer", createdAt: number): EngineerNotification {
  return {
    version: 1,
    id,
    category: role === "spotter" ? "spotter" : "fuel",
    severity: "info",
    textKey: `${role}.key`,
    text: id,
    voiceText: id,
    locale: "es",
    role,
    channel: role,
    priority: 10,
    createdAt,
    expiresAt: createdAt + 10_000,
    source: "telemetry-core",
  };
}

describe("engineer-orbit-model", () => {
  it("ordena el feed con el más reciente arriba", () => {
    const feed = radioFeed(
      [message("a", "engineer", 100), message("b", "spotter", 300), message("c", "engineer", 200)],
      "all",
    );
    expect(feed.map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("filtra por origen", () => {
    const all = [message("a", "engineer", 100), message("b", "spotter", 300)];
    expect(radioFeed(all, "spotter").map((item) => item.id)).toEqual(["b"]);
    expect(radioFeed(all, "engineer").map((item) => item.id)).toEqual(["a"]);
  });

  it("no duplica mensajes al unir estado y notificación", () => {
    const merged = mergeMessages([message("a", "engineer", 1)], [message("a", "engineer", 1)]);
    expect(merged).toHaveLength(1);
  });

  it("traduce el modo de salida a la insignia del feed", () => {
    expect(outputBadge("both")).toBe("A·V");
    expect(outputBadge("visual")).toBe("V");
    expect(outputBadge("audio")).toBe("A");
    expect(outputBadge("disabled")).toBe("—");
  });

  it("cae en `both` y `normal` cuando el estado no dice otra cosa", () => {
    expect(modeOf(undefined, "fuel")).toBe("both");
    expect(modeOf({ fuel: "audio" }, "fuel")).toBe("audio");
    expect(normalizeSensitivity(undefined)).toBe("normal");
    expect(normalizeSensitivity("aggressive")).toBe("aggressive");
  });

  it("formatea la hora mono y aguanta una marca inválida", () => {
    const at = new Date(2026, 6, 7, 18, 44, 12).getTime();
    expect(clockOf(at)).toBe("18:44:12");
    expect(clockOf(Number.NaN)).toBe("--:--:--");
  });
});
