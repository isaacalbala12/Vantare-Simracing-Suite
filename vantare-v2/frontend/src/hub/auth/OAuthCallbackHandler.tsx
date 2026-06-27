import { useEffect } from "react";
import { Events } from "@wailsio/runtime";

function parseOAuthToken(): string | null {
  // Supabase may return the token either in the URL fragment or as a query
  // param depending on the flow and the redirectTo value. We check both.
  const hash = window.location.hash;
  const search = window.location.search;

  const fromFragment = new URLSearchParams(hash.replace(/^#/, "")).get(
    "access_token",
  );
  if (fromFragment) return fromFragment;

  const fromQuery = new URLSearchParams(search).get("access_token");
  if (fromQuery) return fromQuery;

  return null;
}

export function OAuthCallbackHandler() {
  useEffect(() => {
    const token = parseOAuthToken();
    if (token) {
      Events.Emit("license:validate", { sessionToken: token });
    }
    // Return to the hub regardless of whether a token was present; the license
    // gate will show login or paywall based on the validation result.
    window.location.replace("/#/hub");
  }, []);

  return (
    <div className="flex h-screen items-center justify-center bg-[#0a0a0a] text-white">
      <p className="font-mono text-xs uppercase tracking-widest text-vantare-textDim">
        Finalizando inicio de sesión...
      </p>
    </div>
  );
}
