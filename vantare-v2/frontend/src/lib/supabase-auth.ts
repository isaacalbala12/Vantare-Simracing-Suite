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

// signInWithOAuth returns the OAuth URL for the given provider without
// navigating the WebView. The caller is responsible for opening the URL in
// the system's external browser (via Browser.OpenURL from @wailsio/runtime).
// Google blocks OAuth inside embedded WebViews, so this flow is mandatory.
export async function signInWithOAuth(
  provider: "google" | "discord",
): Promise<{ url?: string; error?: string }> {
  try {
    const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: oauthCallbackUrl(),
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
