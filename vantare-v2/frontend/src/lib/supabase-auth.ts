import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";

function supabaseUrl(): string {
  return (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
}

function supabaseAnonKey(): string {
  return (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";
}

// OAuth redirect target. In Wails builds the frontend is served from a local
// dev-server port during development; production packages should set the
// correct redirect URL via VITE_OAUTH_REDIRECT_URL at build time.
//
// FALLBACK: If VITE_OAUTH_REDIRECT_URL is not set, we attempt to use the current
// window.location.origin if it points to a local port (excluding the test port :3000),
// falling back to http://localhost:34115 as the default Vite dev server.
function oauthRedirectUrl(): string {
  const envUrl = import.meta.env.VITE_OAUTH_REDIRECT_URL as string | undefined;
  if (envUrl) {
    return envUrl;
  }
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin && origin.startsWith("http://localhost:") && !origin.includes(":3000")) {
      return `${origin}/#/auth/callback`;
    }
  }
  return "http://localhost:34115/#/auth/callback";
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
      persistSession: true,
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

export async function signOut(): Promise<{ error?: string }> {
  try {
    const { error } = await getSupabaseClient().auth.signOut();
    return { error: error?.message };
  } catch (err) {
    if (isConfigError(err)) {
      return { error: missingConfigError };
    }
    throw err;
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

export async function signInWithOAuth(
  provider: "google" | "discord",
): Promise<{ error?: string }> {
  try {
    const { error } = await getSupabaseClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: oauthRedirectUrl() },
    });
    return { error: error?.message };
  } catch (err) {
    if (isConfigError(err)) {
      return { error: missingConfigError };
    }
    throw err;
  }
}
