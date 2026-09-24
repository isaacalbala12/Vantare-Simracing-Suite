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
		restoreSession.mockResolvedValue({
			session: { access_token: "fresh-at", refresh_token: "fresh-rt" },
		});
		render(<AuthSessionBridge><div>app</div></AuthSessionBridge>);
		expect(eventsEmit).toHaveBeenCalledWith("auth:session:get");
		backendSession?.({ data: { access_token: "old-at", refresh_token: "old-rt", source: "restore" } });
		await waitFor(() => expect(eventsEmit).toHaveBeenCalledWith("license:validate", {
			sessionToken: "fresh-at", refreshToken: "fresh-rt",
		}));
		backendSession?.({ data: { access_token: "fresh-at", refresh_token: "fresh-rt", source: "validated" } });
		await waitFor(() => expect(restoreSession).toHaveBeenCalledTimes(2));
		expect(eventsEmit).not.toHaveBeenCalledWith("calendar:schedule:refresh");
	});

	it("refreshes the published calendar after the first validated login", async () => {
		restoreSession.mockResolvedValue({
			session: { access_token: "validated-at", refresh_token: "validated-rt" },
		});
		render(<AuthSessionBridge><div>app</div></AuthSessionBridge>);
		backendSession?.({ data: {
			access_token: "validated-at", refresh_token: "validated-rt", source: "validated",
		} });
		await waitFor(() => expect(eventsEmit).toHaveBeenCalledWith("calendar:schedule:refresh"));
		backendSession?.({ data: {
			access_token: "validated-at", refresh_token: "validated-rt", source: "validated",
		} });
		await waitFor(() => expect(restoreSession).toHaveBeenCalledTimes(2));
		expect(eventsEmit.mock.calls.filter(([name]) => name === "calendar:schedule:refresh")).toHaveLength(1);
	});

	it("deletes an invalid protected credential", async () => {
		restoreSession
			.mockResolvedValueOnce({ session: null, error: "expired", invalidCredential: true })
			.mockResolvedValueOnce({ session: { access_token: "new-at", refresh_token: "new-rt" } });
		render(<AuthSessionBridge><div>app</div></AuthSessionBridge>);
		backendSession?.({ data: { access_token: "old-at", refresh_token: "old-rt", source: "restore" } });
		await waitFor(() => expect(clearProtectedSession).toHaveBeenCalled());
		backendSession?.({ data: { access_token: "new-at", refresh_token: "new-rt", source: "validated" } });
		await waitFor(() => expect(eventsEmit).toHaveBeenCalledWith("calendar:schedule:refresh"));
	});

	it("does not refresh after a validated session fails hydration", async () => {
		restoreSession.mockResolvedValueOnce({ session: null, error: "unavailable", invalidCredential: false });
		render(<AuthSessionBridge><div>app</div></AuthSessionBridge>);
		backendSession?.({ data: {
			access_token: "validated-at", refresh_token: "validated-rt", source: "validated",
		} });
		await waitFor(() => expect(restoreSession).toHaveBeenCalled());
		expect(eventsEmit).not.toHaveBeenCalledWith("calendar:schedule:refresh");
	});

	it("keeps the protected credential on a transient offline restore failure", async () => {
		restoreSession.mockResolvedValueOnce({ session: null, error: "network unavailable", invalidCredential: false });
		render(<AuthSessionBridge><div>app</div></AuthSessionBridge>);
		backendSession?.({ data: { access_token: "old-at", refresh_token: "old-rt", source: "restore" } });
		await waitFor(() => expect(restoreSession).toHaveBeenCalled());
		expect(clearProtectedSession).not.toHaveBeenCalled();
	});

	it("hydrates an OAuth callback in memory without persisting or revalidating it twice", async () => {
		restoreSession.mockResolvedValueOnce({
			session: { access_token: "callback-at", refresh_token: "callback-rt" },
		});
		render(<AuthSessionBridge><div>app</div></AuthSessionBridge>);
		backendSession?.({ data: {
			access_token: "callback-at",
			refresh_token: "callback-rt",
			source: "callback",
		} });
		await waitFor(() => expect(restoreSession).toHaveBeenCalledWith("callback-at", "callback-rt"));
		expect(eventsEmit).not.toHaveBeenCalledWith("auth:session:save", expect.anything());
		expect(eventsEmit).not.toHaveBeenCalledWith("license:validate", expect.anything());
		expect(eventsEmit).not.toHaveBeenCalledWith("calendar:schedule:refresh");
	});

	it("does not delete a protected credential when an ephemeral callback is invalid", async () => {
		restoreSession.mockResolvedValueOnce({ session: null, error: "expired", invalidCredential: true });
		render(<AuthSessionBridge><div>app</div></AuthSessionBridge>);
		backendSession?.({ data: {
			access_token: "callback-at",
			refresh_token: "callback-rt",
			source: "callback",
		} });
		await waitFor(() => expect(restoreSession).toHaveBeenCalled());
		expect(clearProtectedSession).not.toHaveBeenCalled();
	});

	it("persists refresh rotation and clears on signed out", () => {
		render(<AuthSessionBridge><div>app</div></AuthSessionBridge>);
		authChanged?.("TOKEN_REFRESHED", { access_token: "new-at", refresh_token: "new-rt" });
		expect(eventsEmit).toHaveBeenCalledWith("auth:session:save", {
			accessToken: "new-at", refreshToken: "new-rt",
		});
		expect(eventsEmit).not.toHaveBeenCalledWith("calendar:schedule:refresh");
		authChanged?.("SIGNED_OUT", null);
		expect(clearProtectedSession).toHaveBeenCalled();
	});
});
