import { useEffect, useRef, useState } from "react";
import { dark } from "@clerk/ui/themes";
import { useI18n } from "../../i18n/I18nProvider";
import { isClerkConfigured, loadClerk } from "../../lib/clerk-auth";

type LoadState = "loading" | "ready" | "error";

// LoginScreen mounts Clerk's prebuilt SignIn inside the Vantare shell.
// license:validate is emitted by AuthSessionBridge from the Clerk session
// listener, so authentication never depends on this screen staying mounted.
export function LoginScreen() {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const unmountRef = useRef<(() => void) | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);
  // Compile-time config: a missing publishable key is derived state, not an
  // effect result.
  const configured = isClerkConfigured();
  const error = !configured ? "config" : loadState === "error" ? "load" : null;

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    loadClerk()
      .then((clerk) => {
        const node = hostRef.current;
        if (cancelled || !node) return;
        clerk.mountSignIn(node, {
          routing: "hash",
          appearance: { theme: dark },
        });
        unmountRef.current = () => clerk.unmountSignIn(node);
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });
    return () => {
      cancelled = true;
      unmountRef.current?.();
      unmountRef.current = null;
    };
  }, [configured, attempt]);

  return (
    <div
      data-testid="login-screen"
      className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] text-white"
    >
      <div className="w-full max-w-sm space-y-6 px-4">
        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12"
            viewBox="0 0 40 40"
            fill="none"
            style={{ filter: "drop-shadow(0 0 14px rgba(255,59,59,.4))" }}
          >
            <defs>
              <linearGradient id="loginLogoGradMain" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ff4d4d" />
                <stop offset="55%" stopColor="#e21b1b" />
                <stop offset="100%" stopColor="#9a0606" />
              </linearGradient>
            </defs>
            <path
              d="M20 2 L38 38 L28 38 L20 18 L12 38 L2 38 Z"
              fill="url(#loginLogoGradMain)"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="0.5"
            />
            <path
              d="M20 8 L32 34 L26 34 L20 20 L14 34 L8 34 Z"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="0.5"
            />
          </svg>
          <h1 className="mt-4 font-sans text-xl font-semibold tracking-wide">
            Welcome to Vantare
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Sign in or create an account
          </p>
        </div>

        <div ref={hostRef} data-testid="clerk-signin-host" />

        {loadState === "loading" && configured ? (
          <div className="flex flex-col items-center gap-3">
            <div className="login-spinner" />
            <p data-testid="login-loading" className="text-sm text-white/60">
              {t("auth.clerkLoading")}
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="space-y-3 text-center">
            <p
              data-testid="login-error"
              className="text-sm text-vantare-red-400"
            >
              {error === "config"
                ? t("auth.clerkConfigMissing")
                : t("auth.clerkLoadFailed")}
            </p>
            <button
              type="button"
              data-testid="login-retry"
              onClick={() => {
                setLoadState("loading");
                setAttempt((n) => n + 1);
              }}
              className="w-full rounded-lg border border-white/10 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            >
              {t("auth.retry")}
            </button>
          </div>
        ) : null}

        <p className="pt-8 text-center text-[10px] text-white/20">
          made by <span className="font-semibold text-white/40">Vantare</span>
        </p>
      </div>
    </div>
  );
}
