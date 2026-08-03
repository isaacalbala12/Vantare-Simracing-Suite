import { useEffect, type PropsWithChildren } from "react";
import { Events } from "@wailsio/runtime";
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

	return children;
}
