import { cleanup, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	eventsEmit,
	eventsOn,
	restoreSession,
	subscribe,
	clearProtectedSession,
	isClerkConfiguredMock,
	loadClerkMock,
} = vi.hoisted(() => ({
	eventsEmit: vi.fn(),
	eventsOn: vi.fn(),
	restoreSession: vi.fn(),
	subscribe: vi.fn(),
	clearProtectedSession: vi.fn(),
	isClerkConfiguredMock: vi.fn(),
	loadClerkMock: vi.fn(),
}));

vi.mock("@wailsio/runtime", () => ({ Events: { Emit: eventsEmit, On: eventsOn } }));
vi.mock("./supabase-auth", () => ({
	removeLegacySupabaseSessions: vi.fn(),
	setSupabaseSession: restoreSession,
	onSupabaseAuthStateChange: subscribe,
	clearProtectedAuthSession: clearProtectedSession,
}));
vi.mock("./clerk-auth", () => ({
	isClerkConfigured: isClerkConfiguredMock,
	loadClerk: loadClerkMock,
	getClerkSessionToken: vi.fn(),
	signOutClerk: vi.fn(),
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
		// Clerk stays unconfigured by default so the existing Supabase restore
		// tests exercise exactly the same code path as before ISA-915.
		isClerkConfiguredMock.mockReturnValue(false);
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
		authChanged?.("SIGNED_OUT", null);
		expect(clearProtectedSession).toHaveBeenCalled();
	});

	describe("Clerk session", () => {
		type FakeSession = { id: string; getToken: () => Promise<string | null> };
		let clerkListener:
			| ((emission: { session?: FakeSession | null }) => void)
			| undefined;
		const clerkFake = { addListener: vi.fn() };

		const emitValidateCalls = () =>
			eventsEmit.mock.calls.filter(
				(call: unknown[]) => call[0] === "license:validate",
			);

		beforeEach(() => {
			clerkListener = undefined;
			clerkFake.addListener.mockImplementation(
				(cb: typeof clerkListener) => {
					clerkListener = cb;
					return vi.fn();
				},
			);
			isClerkConfiguredMock.mockReturnValue(true);
			loadClerkMock.mockResolvedValue(clerkFake);
		});

		it("emits license:validate with the Clerk session token and empty refreshToken", async () => {
			render(<AuthSessionBridge><div>app</div></AuthSessionBridge>);
			await waitFor(() => expect(clerkListener).toBeDefined());
			clerkListener?.({
				session: { id: "s1", getToken: () => Promise.resolve("jwt-1") },
			});
			await waitFor(() =>
				expect(eventsEmit).toHaveBeenCalledWith("license:validate", {
					sessionToken: "jwt-1",
					refreshToken: "",
				}),
			);
		});

		it("dedupes license:validate by session id across token rotations", async () => {
			render(<AuthSessionBridge><div>app</div></AuthSessionBridge>);
			await waitFor(() => expect(clerkListener).toBeDefined());
			const session: FakeSession = {
				id: "s1",
				getToken: () => Promise.resolve("jwt-1"),
			};
			clerkListener?.({ session });
			clerkListener?.({ session });
			await waitFor(() => expect(emitValidateCalls()).toHaveLength(1));
		});

		it("clears the protected credential on a real signed-in -> signed-out transition", async () => {
			render(<AuthSessionBridge><div>app</div></AuthSessionBridge>);
			await waitFor(() => expect(clerkListener).toBeDefined());
			clerkListener?.({
				session: { id: "s1", getToken: () => Promise.resolve("jwt-1") },
			});
			await waitFor(() => expect(emitValidateCalls()).toHaveLength(1));
			clerkListener?.({ session: null });
			expect(clearProtectedSession).toHaveBeenCalled();
		});

		it("does not clear the protected credential on a boot-time null session", async () => {
			render(<AuthSessionBridge><div>app</div></AuthSessionBridge>);
			await waitFor(() => expect(clerkListener).toBeDefined());
			clerkListener?.({ session: null });
			expect(clearProtectedSession).not.toHaveBeenCalled();
		});

		it("ignores the undefined (still loading) session state", async () => {
			render(<AuthSessionBridge><div>app</div></AuthSessionBridge>);
			await waitFor(() => expect(clerkListener).toBeDefined());
			clerkListener?.({ session: undefined });
			expect(emitValidateCalls()).toHaveLength(0);
			expect(clearProtectedSession).not.toHaveBeenCalled();
		});

		it("does not emit license:validate when getToken resolves null", async () => {
			render(<AuthSessionBridge><div>app</div></AuthSessionBridge>);
			await waitFor(() => expect(clerkListener).toBeDefined());
			const getToken = vi.fn().mockResolvedValue(null);
			clerkListener?.({ session: { id: "s1", getToken } });
			await waitFor(() => expect(getToken).toHaveBeenCalled());
			await Promise.resolve();
			expect(emitValidateCalls()).toHaveLength(0);
		});
	});
});
