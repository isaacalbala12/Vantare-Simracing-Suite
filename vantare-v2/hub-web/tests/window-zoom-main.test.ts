import type { BrowserWindow } from "electron";
import { expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  nativeTheme: { themeSource: "dark", shouldUseDarkColors: true },
  Notification: {},
}));

import { paintWindow } from "../src/main/appearance";

it("applies the size ceiling in Electron and restores the requested zoom when enlarged", () => {
  let size = [1920, 1080],
    factor = 1;
  const setZoomFactor = vi.fn((value: number) => {
    factor = value;
  });
  const window = {
    isDestroyed: () => false,
    getContentSize: () => size,
    setBackgroundColor: vi.fn(),
    webContents: { getZoomFactor: () => factor, setZoomFactor },
  } as unknown as BrowserWindow;
  const theme = { palette: "vantare", scheme: "dark" } as const;
  paintWindow(window, theme, 125);
  size = [1280, 720];
  paintWindow(window, theme, 125);
  paintWindow(window, theme, 125); // Stable size must not create a zoom/resize loop.
  size = [1920, 1080];
  paintWindow(window, theme, 125);
  expect(setZoomFactor.mock.calls).toEqual([[1.25], [1], [1.25]]);
});
