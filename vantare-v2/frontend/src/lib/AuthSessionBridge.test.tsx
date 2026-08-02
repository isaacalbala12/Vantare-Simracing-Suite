import { cleanup, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { eventsEmit, eventsOn, restoreSession, subscribe, clearProtectedSession } = vi.hoisted(() => ({
	eventsEmit: vi.fn(),
	eventsOn: vi.fn(),
	restoreSession: vi.fn(),
	subscribe: vi.fn(),
	clearProtectedSession: vi.fn(),
}));

vi.mock("@wailsio/runtime", () => ({ Events: { Emit: eventsEmit, On: eventsOn } }));
vi.mock("./supabase-auth", () => ({
	removeLegacySupabaseSessions: vi.fn(),
	setSupabaseSession: restoreSession,
	onSupabaseAuthStateChange: subscribe,
	clearProtectedAuthSession: clearProtectedSession,
}));

import { AuthSessionBridge } from "./AuthSessionBridge";

describe("AuthSessionBridge", () => {
	let backendSession: ((event: { data?: Record<string, string> }) => void) | undefined;
	let authChanged: ((event: string, session: { access_token: string; refresh_token: string } | null) => void) | undefined;

	beforeEach(() => {
		cleanup();
		vi.clearAllMocks();
		backendSession = undefined;
		authChanged = undefined;
		eventsOn.mockImplementation((name: string, callback: typeof backendSession) => {
			if (name === "auth:session") backendSession = callback;
			return vi.fn();
		});
		subscribe.mockImplementation((callback: typeof authChanged) => {
			authChanged = callback;
			return vi.fn();
		});
		clearProtectedSession.mockResolvedValue({ ok: true });
	});

	it("restores and revalidates a protected session independently of LoginScreen", async () => {
		restoreSession.mockResolvedValueOnce({
			session: { access_token: "fresh-at", refresh_token: "fresh-rt" },
		});
		render(<AuthSessionBridge><div>app</div></AuthSessionBridge>);
		expect(eventsEmit).toHaveBeenCalledWith("auth:session:get");
		backendSession?.({ data: { access_token: "old-at", refresh_token: "old-rt", source: "restore" } });
		await waitFor(() => expect(eventsEmit).toHaveBeenCalledWith("license:validate", {
			sessionToken: "fresh-at", refreshToken: "fresh-rt",
		}));
	});

	it("deletes an invalid protected credential", async () => {
		restoreSession.mockResolvedValueOnce({ session: null, error: "expired", invalidCredential: true });
		render(<AuthSessionBridge><div>app</div></AuthSessionBridge>);
		backendSession?.({ data: { access_token: "old-at", refresh_token: "old-rt", source: "restore" } });
		await waitFor(() => expect(clearProtectedSession).toHaveBeenCalled());
	});

	it("keeps the protected credential on a transient offline restore failure", async () => {
		restoreSession.mockResolvedValueOnce({ session: null, error: "network unavailable", invalidCredential: false });
		render(<AuthSessionBridge><div>app</div></AuthSessionBridge>);
		backendSession?.({ data: { access_token: "old-at", refresh_token: "old-rt", source: "restore" } });
		await waitFor(() => expect(restoreSession).toHaveBeenCalled());
		expect(clearProtectedSession).not.toHaveBeenCalled();
	});

	it("persists refresh rotation and clears on signed out", () => {
		render(<AuthSessionBridge><div>app</div></AuthSessionBridge>);
		authChanged?.("TOKEN_REFRESHED", { access_token: "new-at", refresh_token: "new-rt" });
		expect(eventsEmit).toHaveBeenCalledWith("auth:session:save", {
			accessToken: "new-at", refreshToken: "new-rt",
		});
		authChanged?.("SIGNED_OUT", null);
		expect(clearProtectedSession).toHaveBeenCalled();
	});
});
