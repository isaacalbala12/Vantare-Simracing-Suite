import { describe, expect, it, vi } from "vitest";
import { notifyLaunchResult } from "./launch-notification";

describe("launch notifications", () => {
  it("does not expose paths or args and falls back when the page is visible", () => {
    expect(notifyLaunchResult("creator", "success")).toBe(false);
  });

  it("uses the system notification only when permission is granted and hidden", () => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    const OriginalNotification = globalThis.Notification;
    const NotificationMock = vi.fn();
    Object.assign(NotificationMock, { permission: "granted" });
    globalThis.Notification = NotificationMock as unknown as typeof Notification;
    expect(notifyLaunchResult("creator", "partial")).toBe(true);
    expect(NotificationMock).toHaveBeenCalledWith("Launcher: creator", { body: "Lanzamiento con fallos." });
    globalThis.Notification = OriginalNotification;
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });
});
