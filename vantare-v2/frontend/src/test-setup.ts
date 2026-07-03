import { vi } from "vitest";

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: vi.fn(() => () => {}),
    Off: vi.fn(),
    Emit: vi.fn(),
  },
  Browser: {
    OpenURL: vi.fn(),
  },
}));
