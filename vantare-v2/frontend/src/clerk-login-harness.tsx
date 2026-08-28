import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { I18nProvider } from "./i18n/I18nProvider";
import { LoginScreenView } from "./hub/auth/LoginScreen";

type HarnessState = "loading" | "signed-out" | "error";

function stateFromLocation(): HarnessState {
  const state = new URLSearchParams(window.location.search).get("state");
  return state === "loading" || state === "error" ? state : "signed-out";
}

function ClerkSignInFixture() {
  return (
    <section
      aria-label="Clerk SignIn fixture"
      className="w-full rounded-xl border border-white/10 bg-[#111] p-5 shadow-none sm:p-6"
      data-testid="clerk-sign-in-fixture"
    >
      <div className="space-y-4">
        <button
          type="button"
          className="min-h-11 w-full rounded-lg bg-vantare-red-600 px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Continuar con Google
        </button>
        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-white/45">o</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>
        <label className="block space-y-1.5 text-sm text-white/70">
          Email
          <input
            type="email"
            className="min-h-11 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-white outline-none focus:border-vantare-red-400"
          />
        </label>
        <button
          type="button"
          className="min-h-11 w-full rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vantare-red-400"
        >
          Continuar
        </button>
      </div>
    </section>
  );
}

export function ClerkLoginHarness() {
  const state = stateFromLocation();
  return (
    <I18nProvider>
      <LoginScreenView
        isConfigured
        isLoaded={state !== "loading"}
        isSignedIn={state === "error"}
        validationError={state === "error" ? "token_unavailable" : null}
        onRetry={async () => true}
        signIn={<ClerkSignInFixture />}
      />
    </I18nProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkLoginHarness />
  </StrictMode>,
);
