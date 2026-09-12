import { useEffect, type PropsWithChildren } from "react";
import { Events } from "@wailsio/runtime";
import { isClerkConfigured, loadClerk } from "./clerk-auth";
import {
	clearProtectedAuthSession,
	onSupabaseAuthStateChange,
	removeLegacySupabaseSessions,
	setSupabaseSession,
} from "./supabase-auth";

type ProtectedSessionEvent = {
	data?: {
		access_token?: string;
		refresh_token?: string;
		source?: "callback" | "restore" | "validated";
	};
};

// AuthSessionBridge is mounted at the application root, so protected session
// restore and token rotation never depend on LoginScreen or the license cache
// being visible. Supabase remains memory-only; Credential Manager is the sole
// persistent session store.
export function AuthSessionBridge({ children }: PropsWithChildren) {
	useEffect(() => {
		removeLegacySupabaseSessions();
		let active = true;
		const offBackend = Events.On("auth:session", async (event: ProtectedSessionEvent) => {
			const accessToken = event.data?.access_token;
			const refreshToken = event.data?.refresh_token;
			if (!accessToken || !refreshToken) return;
			const restored = await setSupabaseSession(accessToken, refreshToken);
			if (!active) return;
			if (restored.invalidCredential && event.data?.source !== "callback") {
				void clearProtectedAuthSession();
				return;
			}
			if (!restored.session?.access_token || !restored.session.refresh_token) return;
			if (event.data?.source === "restore") {
				Events.Emit("license:validate", {
					sessionToken: restored.session.access_token,
					refreshToken: restored.session.refresh_token,
				});
			}
		});
		const offSupabase = onSupabaseAuthStateChange((event, session) => {
			if (event === "SIGNED_OUT") {
				void clearProtectedAuthSession();
				return;
			}
			if (event === "TOKEN_REFRESHED" && session?.access_token && session.refresh_token) {
				Events.Emit("auth:session:save", {
					accessToken: session.access_token,
					refreshToken: session.refresh_token,
				});
			}
		});
		Events.Emit("auth:session:get");
		return () => {
			active = false;
			offBackend?.();
			offSupabase();
		};
	}, []);

	// Clerk session feed, mounted at the root so sign-in detection and token
	// rotation never depend on LoginScreen. The listener fires on every token
	// refresh (~50s), so license:validate is deduped by session id; the backend
	// persists only the Clerk sid when refreshToken is empty.
	useEffect(() => {
		if (!isClerkConfigured()) return;
		let active = true;
		let lastSessionId: string | null = null;
		let unsubscribe: (() => void) | undefined;
		loadClerk()
			.then((clerk) => {
				if (!active) return;
				unsubscribe = clerk.addListener(({ session }) => {
					if (session === undefined) return; // still loading
					if (session === null) {
						// Only a real signed-in -> signed-out transition clears the
						// stored credential; a boot-time null must not race the
						// Supabase restore above.
						if (lastSessionId) void clearProtectedAuthSession();
						lastSessionId = null;
						return;
					}
					if (session.id === lastSessionId) return;
					lastSessionId = session.id;
					session
						.getToken()
						.then((token) => {
							if (!active || !token || session.id !== lastSessionId) return;
							Events.Emit("license:validate", {
								sessionToken: token,
								refreshToken: "",
							});
						})
						.catch(() => {
							// Offline getToken: the license cache covers it. Allow the
							// next listener emission of this session to retry.
							if (lastSessionId === session.id) lastSessionId = null;
						});
				});
			})
			.catch(() => {
				// A failed Clerk load is surfaced by LoginScreen; the bridge
				// stays silent.
			});
		return () => {
			active = false;
			unsubscribe?.();
		};
	}, []);

	return children;
}
