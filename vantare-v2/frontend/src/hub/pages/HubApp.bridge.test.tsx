import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

const {
  emitted,
  onListeners,
  eventsOn,
  eventsOff,
  eventsEmit,
  getSessionMock,
} = vi.hoisted(() => {
  const emitted = vi.fn();
  const onListeners = new Map<string, (event: unknown) => void>();
  return {
    emitted,
    onListeners,
    eventsOn: vi.fn((name: string, cb: (event: unknown) => void) => {
      onListeners.set(name, cb);
      return () => onListeners.delete(name);
    }),
    eventsOff: vi.fn(),
    eventsEmit: emitted,
    getSessionMock: vi.fn(),
  };
});

vi.mock("@wailsio/runtime", () => ({
  Events: {
    On: eventsOn,
    Off: eventsOff,
    Emit: eventsEmit,
  },
}));

vi.mock("../../lib/supabase-auth", () => ({
  getSession: getSessionMock,
}));

import { HubApp } from "./HubApp";

describe("LicenseBridge", () => {
  beforeEach(() => {
    cleanup();
    emitted.mockClear();
    onListeners.clear();
    getSessionMock.mockReset();
  });

  it("emits license:validate with the session access token", async () => {
    getSessionMock.mockResolvedValueOnce({
      access_token: "bridge-token",
    });
    render(<HubApp />);

    await waitFor(() => {
      expect(emitted).toHaveBeenCalledWith("license:validate", {
        sessionToken: "bridge-token",
      });
    });
  });

  it("falls back to a blank validation when there is no session", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    render(<HubApp />);

    await waitFor(() => {
      expect(emitted).toHaveBeenCalledWith("license:validate", {});
    });
  });
});
