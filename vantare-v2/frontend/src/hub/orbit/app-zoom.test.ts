import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_ZOOM_EVENT,
  appZoomPercent,
  appZoomShortcut,
  DEFAULT_APP_ZOOM,
  getStoredAppZoom,
  nextAppZoom,
  setAppZoom,
} from "./app-zoom";
import { ORBIT_KEYS } from "./orbit-store";

beforeEach(() => window.localStorage.clear());

describe("app zoom", () => {
  it("normaliza la ausencia y los valores corruptos al 100%", () => {
    expect(getStoredAppZoom()).toBe(DEFAULT_APP_ZOOM);
    window.localStorage.setItem(ORBIT_KEYS.appZoom, "1.37");
    expect(getStoredAppZoom()).toBe(DEFAULT_APP_ZOOM);
  });

  it("recorre pasos cerrados y no rebasa sus extremos", () => {
    expect(nextAppZoom(1, 1)).toBe(1.1);
    expect(nextAppZoom(1, -1)).toBe(0.9);
    expect(nextAppZoom(0.8, -1)).toBe(0.8);
    expect(nextAppZoom(1.5, 1)).toBe(1.5);
  });

  it("persiste y publica exactamente el mismo valor", () => {
    const listener = vi.fn();
    window.addEventListener(APP_ZOOM_EVENT, listener);
    setAppZoom(1.25);

    expect(window.localStorage.getItem(ORBIT_KEYS.appZoom)).toBe("1.25");
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toBe(1.25);
    expect(appZoomPercent(getStoredAppZoom())).toBe(125);
    window.removeEventListener(APP_ZOOM_EVENT, listener);
  });

  it("reconoce los atajos tipo Chrome fuera de campos editables", () => {
    expect(appZoomShortcut(new KeyboardEvent("keydown", { key: "+", ctrlKey: true }))).toBe(
      "increase",
    );
    expect(appZoomShortcut(new KeyboardEvent("keydown", { key: "-", ctrlKey: true }))).toBe(
      "decrease",
    );
    expect(appZoomShortcut(new KeyboardEvent("keydown", { key: "0", ctrlKey: true }))).toBe(
      "reset",
    );

    const input = document.createElement("input");
    document.body.append(input);
    const editableEvent = new KeyboardEvent("keydown", { key: "+", ctrlKey: true, bubbles: true });
    input.dispatchEvent(editableEvent);
    expect(appZoomShortcut(editableEvent)).toBeNull();
    input.remove();
  });
});
