// @vitest-environment jsdom
import { expect, it } from "vitest";
import { dialogShortcut, hubShortcut } from "../src/renderer/ui/hub-shortcuts";

it.each([
  [{ key: "L", ctrlKey: true }, "launch"],
  [{ key: "l", ctrlKey: true, altKey: true }, undefined],
  [{ key: "l", ctrlKey: true, shiftKey: true }, undefined],
  [{ key: "l", ctrlKey: true, metaKey: true }, undefined],
  [{ key: "b", ctrlKey: true }, "sidebar"],
  [{ key: "b", ctrlKey: true, altKey: true }, "context"],
  [{ key: "b", ctrlKey: true, shiftKey: true }, undefined],
  [{ key: "n", ctrlKey: true }, undefined],
  [{ key: "n", ctrlKey: true, shiftKey: true }, "notifications"],
  [{ key: "n", ctrlKey: true, shiftKey: true, altKey: true }, undefined],
  [{ key: "+", ctrlKey: true, shiftKey: true }, "zoomIn"],
  [{ key: "0", ctrlKey: true, altKey: true }, undefined],
  [{ key: "k", ctrlKey: true, repeat: true }, undefined],
  [{ key: "b", ctrlKey: true, repeat: true }, undefined],
  [{ key: "k", ctrlKey: true, isComposing: true }, undefined],
])("resolves exact modifiers and repetition: %j", (init, action) => {
  expect(hubShortcut(new KeyboardEvent("keydown", init))).toBe(action);
});
it.each(["@", "#", "\\", "[", "]", "{", "}", "|", "~"])(
  "leaves AltGr %s untouched, including Chromium's Ctrl+Alt representation",
  (key) => {
    const event = new KeyboardEvent("keydown", {
      key,
      ctrlKey: true,
      altKey: true,
    });
    expect(hubShortcut(event)).toBeUndefined();
    expect(dialogShortcut(event)).toBe(false);
  },
);
it.each([
  { key: "+", code: "NumpadAdd", location: 3 },
  { key: "-", code: "NumpadSubtract", location: 3 },
  { key: "0", code: "Numpad0", location: 3 },
  { key: "=", code: "Equal" },
])(
  "permits exact zoom inside dialogs, including the numeric keypad: %j",
  (key) => {
    expect(
      dialogShortcut(new KeyboardEvent("keydown", { ...key, ctrlKey: true })),
    ).toBe(false);
    expect(
      dialogShortcut(
        new KeyboardEvent("keydown", { ...key, ctrlKey: true, altKey: true }),
      ),
    ).toBe(true);
  },
);
