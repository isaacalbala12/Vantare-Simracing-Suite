import { SignIn } from "@clerk/react";
import { useI18n } from "../../i18n/I18nProvider";
import { useClerkAuth } from "../../lib/clerk-auth";

function VantareMark() {
  return (
    <svg
      aria-hidden="true"
      className="mx-auto h-12 w-12"
      viewBox="0 0 40 40"
      fill="none"
      style={{ filter: "drop-shadow(0 0 14px rgba(255,59,59,.4))" }}
    >
      <defs>
        <linearGradient id="clerkLoginLogo" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff4d4d" />
          <stop offset="55%" stopColor="#e21b1b" />
          <stop offset="100%" stopColor="#9a0606" />
        </linearGradient>
      </defs>
      <path
        d="M20 2 L38 38 L28 38 L20 18 L12 38 L2 38 Z"
        fill="url(#clerkLoginLogo)"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="0.5"
      />
    </svg>
  );
}

export function LoginScreen() {
  const auth = useClerkAuth();
  return (
    <LoginScreenView
      isConfigured={auth.isConfigured}
      isLoaded={auth.isLoaded}
      isSignedIn={auth.isSignedIn}
      validationError={auth.validationError}
      onRetry={auth.validateLicense}
      signIn={(
        <SignIn
          routing="path"
          path="/"
          appearance={{
            variables: {
              colorPrimary: "#e21b1b",
              colorBackground: "#111111",
              colorForeground: "#ffffff",
              colorMutedForeground: "rgba(255,255,255,.62)",
              colorInput: "rgba(255,255,255,.05)",
              colorInputForeground: "#ffffff",
              borderRadius: "0.75rem",
            },
            elements: {
              rootBox: "w-full",
              cardBox: "w-full shadow-none",
              card: "w-full border border-white/10 shadow-none",
              footer: "bg-transparent",
            },
          }}
        />
      )}
    />
  );
}

type LoginScreenViewProps = {
  isConfigured: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  validationError: "token_unavailable" | null;
  onRetry: () => Promise<boolean>;
  signIn: React.ReactNode;
};

export function LoginScreenView({
  isConfigured,
  isLoaded,
  isSignedIn,
  validationError,
  onRetry,
  signIn,
}: LoginScreenViewProps) {
  const { t } = useI18n();

  let content: React.ReactNode;
  if (!isConfigured) {
    content = (
      <div data-testid="login-configuration-error" className="space-y-3 text-center" role="alert">
        <h2 className="text-base font-semibold text-white">{t("auth.clerkConfigTitle")}</h2>
        <p className="text-sm leading-6 text-white/60">{t("auth.clerkConfigBody")}</p>
        <code className="inline-block rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80">
          VITE_CLERK_PUBLISHABLE_KEY
        </code>
      </div>
    );
  } else if (!isLoaded) {
    content = (
      <div data-testid="login-clerk-loading" className="space-y-4 text-center" role="status">
        <div className="mx-auto login-spinner" />
        <p className="text-sm text-white/60">{t("auth.clerkLoading")}</p>
      </div>
    );
  } else if (isSignedIn) {
    content = validationError ? (
      <div className="space-y-4 text-center" role="alert">
        <p className="text-sm leading-6 text-vantare-red-400">{t("auth.clerkTokenError")}</p>
        <button
          type="button"
          onClick={() => void onRetry()}
          className="min-h-11 w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vantare-red-400"
        >
          {t("auth.retry")}
        </button>
      </div>
    ) : (
      <div data-testid="login-clerk-validating" className="space-y-4 text-center" role="status">
        <div className="mx-auto login-spinner" />
        <p className="text-sm text-white/60">{t("auth.clerkValidating")}</p>
      </div>
    );
  } else {
    content = <div className="flex w-full justify-center">{signIn}</div>;
  }

  return (
    <main
      data-testid="login-screen"
      className="flex min-h-screen w-full items-center justify-center overflow-y-auto bg-[#0a0a0a] px-4 py-8 text-white sm:px-6 sm:py-12"
    >
      <div className="w-full max-w-md space-y-6">
        <header className="text-center">
          <VantareMark />
          <h1 className="mt-4 font-sans text-xl font-semibold tracking-wide">
            {t("auth.clerkTitle")}
          </h1>
          <p className="mt-1 text-sm text-white/60">{t("auth.clerkSubtitle")}</p>
        </header>
        {content}
        <p className="pt-2 text-center text-[10px] text-white/25">
          made by <span className="font-semibold text-white/45">Vantare</span>
        </p>
      </div>
    </main>
  );
}
