import {
  createClient,
  type Session,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { Events } from "@wailsio/runtime";

function supabaseUrl(): string {
  return (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
}

function supabaseAnonKey(): string {
  return (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";
}

// OAuth redirect target for external browser flow. Points to the local HTTP
// server's /auth/callback endpoint where a small HTML page reads the
// access_token from the URL fragment and POSTs it back to the Go app.
//
// Configurable via VITE_OAUTH_REDIRECT_URL for custom setups.
function oauthCallbackUrl(): string {
  const envUrl = import.meta.env.VITE_OAUTH_REDIRECT_URL as string | undefined;
  if (envUrl) {
    return envUrl;
  }
  // Default: the local OBS/auth server on port 39261.
  return "http://127.0.0.1:39261/auth/callback";
}

const missingConfigError =
  "Supabase no configurado: faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY";

let client: SupabaseClient | null = null;

function buildClient(): SupabaseClient {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) {
    throw new Error(missingConfigError);
  }
  return createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
    },
  });
}


export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = buildClient();
  }
  return client;
}

// resetSupabaseClient clears the singleton so tests can exercise different
// environment configurations without reloading the module.
export function resetSupabaseClient(): void {
  client = null;
}


function isConfigError(err: unknown): boolean {
  return err instanceof Error && err.message === missingConfigError;
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<{ session: Session | null; error?: string }> {
  try {
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return { session: null, error: error.message };
    }
    return { session: data.session };
  } catch (err) {
    if (isConfigError(err)) {
      return { session: null, error: missingConfigError };
    }
    throw err;
  }
}

export async function signUp(
  email: string,
  password: string,
): Promise<{ user: User | null; session: Session | null; error?: string }> {
  try {
    const c = getSupabaseClient();
    const { data, error } = await c.auth.signUp({ email, password });
    if (error) return { user: null, session: null, error: error.message };
    return { user: data.user, session: data.session, error: undefined };
  } catch (err) {
    if (isConfigError(err)) return { user: null, session: null, error: missingConfigError };
    return { user: null, session: null, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

export async function signOut(): Promise<{ error?: string }> {
	// Local logout is fail-closed and independent from network availability.
	// The caller may keep the current screen open to report a remote failure,
	// but a restart can no longer restore this credential.
	Events.Emit("auth:session:clear");
  try {
    const { error } = await getSupabaseClient().auth.signOut();
    return { error: error?.message };
  } catch (err) {
    if (isConfigError(err)) {
      return { error: missingConfigError };
    }
		return { error: err instanceof Error ? err.message : "Error al cerrar la sesión remota" };
  }
}

export async function resetPasswordForEmail(
  email: string,
): Promise<{ error?: string }> {
  try {
    const c = getSupabaseClient();
    const redirectTo = `${oauthCallbackUrl()}/#/auth/callback`;
    const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return { error: error.message };
    return { error: undefined };
  } catch (err) {
    if (isConfigError(err)) return { error: missingConfigError };
    return { error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

export async function getSession(): Promise<Session | null> {
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    return data.session;
  } catch (err) {
    if (isConfigError(err)) {
      return null;
    }
    throw err;
  }
}

// setSupabaseSession restores a protected backend session into the in-memory
// Supabase client. Persistence belongs to Windows Credential Manager, never
// WebView localStorage.
export async function setSupabaseSession(
  accessToken: string,
  refreshToken?: string,
): Promise<{ session: Session | null; error?: string; invalidCredential?: boolean }> {
  if (!accessToken) {
    return { session: null, error: "access_token is required" };
  }
  if (!refreshToken) {
    return { session: null, error: "refresh_token is required to restore session" };
  }
  try {
    const { data, error } = await getSupabaseClient().auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
			const status = (error as { status?: number }).status;
			return {
				session: null,
				error: error.message,
				invalidCredential: status === 400 || status === 401,
			};
    }
    return { session: data.session };
  } catch (err) {
    if (isConfigError(err)) {
      return { session: null, error: missingConfigError };
    }
    throw err;
  }
}

// signInWithOAuth returns the OAuth URL for the given provider without
// navigating the WebView. The caller is responsible for opening the URL in
// the system's external browser (via Browser.OpenURL from @wailsio/runtime).
// Google blocks OAuth inside embedded WebViews, so this flow is mandatory.
export async function signInWithOAuth(
  provider: "google" | "discord",
): Promise<{ url?: string; error?: string }> {
  try {
		const attempt = await createOAuthAttempt(provider);
		if (attempt.error || !attempt.redirectUrl) {
			return { error: attempt.error ?? "No se pudo iniciar el acceso seguro" };
		}
    const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
      provider,
      options: {
				redirectTo: attempt.redirectUrl,
        skipBrowserRedirect: true,
      },
    });
    if (error) {
      return { error: error.message };
    }
    return { url: data.url ?? undefined };
  } catch (err) {
    if (isConfigError(err)) {
      return { error: missingConfigError };
    }
    throw err;
  }
}

type OAuthAttemptResult = { redirectUrl?: string; error?: string };

function requestID(): string {
	return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function createOAuthAttempt(
	provider: "google" | "discord",
	timeoutMs = 5000,
): Promise<OAuthAttemptResult> {
	return new Promise((resolve) => {
		const id = requestID();
		let settled = false;
		const unsubscribers: Array<() => void> = [];
		const finish = (result: OAuthAttemptResult) => {
			if (settled) return;
			settled = true;
			globalThis.clearTimeout(timer);
			for (const unsubscribe of unsubscribers) unsubscribe();
			resolve(result);
		};
		const timer = globalThis.setTimeout(
			() => finish({ error: "La solicitud de acceso seguro ha caducado" }),
			timeoutMs,
		);
		unsubscribers.push(Events.On("auth:attempt:created", (event: { data?: { requestId?: string; redirectUrl?: string } }) => {
			if (event.data?.requestId !== id) return;
			finish({ redirectUrl: event.data.redirectUrl });
		}));
		unsubscribers.push(Events.On("auth:attempt:error", (event: { data?: { requestId?: string; message?: string } }) => {
			if (event.data?.requestId !== id) return;
			finish({ error: event.data.message ?? "No se pudo iniciar el acceso seguro" });
		}));
		Events.Emit("auth:attempt:create", { requestId: id, provider });
	});
}

export function removeLegacySupabaseSessions(storage: Storage = window.localStorage): number {
	let removed = 0;
	for (let index = storage.length - 1; index >= 0; index -= 1) {
		const key = storage.key(index);
		if (!key) continue;
		if (/^sb-.+-auth-token$/i.test(key) || /^supabase\.auth\.token(?:\.|$)/i.test(key)) {
			storage.removeItem(key);
			removed += 1;
		}
	}
	return removed;
}

export function onSupabaseAuthStateChange(
	callback: (event: string, session: Session | null) => void,
): () => void {
	try {
		const { data } = getSupabaseClient().auth.onAuthStateChange(callback);
		return () => data.subscription.unsubscribe();
	} catch (err) {
		if (isConfigError(err)) return () => undefined;
		throw err;
	}
}
