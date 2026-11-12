import { expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  Notification: {
    isSupported() {
      throw new Error("OS forbidden in unit tests");
    },
  },
}));

import { notifyCalendar } from "../src/main/calendar-notifications";

const text = {
  title: "LMGT3 sale a las 20:00",
  body: "Sebring · carrera 20 min · en 10 min",
};
it("uses only the native title/body, silently, without interactive actions", () => {
  const show = vi.fn(),
    supported = vi.fn(() => true);
  expect(
    notifyCalendar(
      {
        ...text,
        icon: "private-file",
        actions: [{ type: "button", text: "fake" }],
      } as typeof text,
      { platform: "win32", supported, show },
    ),
  ).toBe(true);
  expect(show).toHaveBeenCalledWith({ ...text, silent: true });
});
it.each(["linux", "darwin"])("does not invoke an OS API on %s", (platform) => {
  const show = vi.fn(),
    supported = vi.fn(() => true);
  expect(notifyCalendar(text, { platform, supported, show })).toBe(false);
  expect(supported).not.toHaveBeenCalled();
  expect(show).not.toHaveBeenCalled();
});
it("handles unsupported Windows notifications without pretending to send", () => {
  const show = vi.fn();
  expect(
    notifyCalendar(text, { platform: "win32", supported: () => false, show }),
  ).toBe(false);
  expect(show).not.toHaveBeenCalled();
});
it.each(["supported", "show"])(
  "closes an OS failure in %s without exposing its message",
  (stage) => {
    const fail = () => {
      throw new Error("private OS details");
    };
    expect(
      notifyCalendar(text, {
        platform: "win32",
        supported: stage === "supported" ? fail : () => true,
        show: stage === "show" ? fail : vi.fn(),
      }),
    ).toBe(false);
  },
);
