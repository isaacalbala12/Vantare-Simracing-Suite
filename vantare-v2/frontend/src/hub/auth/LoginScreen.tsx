import { useCallback, useState, useEffect } from "react";
import type { FormEvent } from "react";
import {
  signInWithEmail,
  signInWithOAuth,
  signUp,
  resetPasswordForEmail,
  setSupabaseSession,
} from "../../lib/supabase-auth";
import { Browser, Events } from "@wailsio/runtime";
import { useI18n } from "../../i18n/I18nProvider";

export type LoginSessionTokens = {
  accessToken: string;
  refreshToken?: string;
};

type LoginScreenProps = {
  onLoggedIn: (tokens?: LoginSessionTokens) => void;
};

export function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [oauthPending, setOauthPending] = useState<"google" | "discord" | null>(
    null,
  );
  const [waitingExternal, setWaitingExternal] = useState(false);
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [signupEmailSent, setSignupEmailSent] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (!waitingExternal) return;
    const unsub = Events.On(
      "license:changed",
      (event: { data: { state?: string; accessToken?: string } }) => {
        const state = event.data?.state;
        if (state && state !== "anonymous") {
          setWaitingExternal(false);
          setOauthPending(null);
          if (event.data?.accessToken) {
            onLoggedIn({ accessToken: event.data.accessToken });
          }
        }
      },
    );
    return () => {
      unsub?.();
    };
  }, [waitingExternal, onLoggedIn]);

  useEffect(() => {
    const unsub = Events.On(
      "auth:session",
      (event: { data: { access_token?: string; refresh_token?: string } }) => {
        const at = event.data?.access_token;
        const rt = event.data?.refresh_token;
        if (at && rt) {
          setSupabaseSession(at, rt);
        }
      },
    );
    return () => {
      unsub?.();
    };
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setSubmitting(true);
      const { session, error: msg } = await signInWithEmail(email, password);
      setSubmitting(false);
      if (msg) {
        setError(msg);
        return;
      }
      if (session) {
        onLoggedIn({
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
        });
      }
    },
    [email, password, onLoggedIn],
  );

  const handleSignUp = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setSubmitting(true);
      const { session, error: msg } = await signUp(email, password);
      setSubmitting(false);
      if (msg) {
        setError(msg);
        return;
      }
      if (session) {
        onLoggedIn({
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
        });
      } else {
        setSignupEmailSent(true);
      }
    },
    [email, password, onLoggedIn],
  );

  const handleResetPassword = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setSubmitting(true);
      const { error: msg } = await resetPasswordForEmail(resetEmail);
      setSubmitting(false);
      if (msg) {
        setError(msg);
        return;
      }
      setResetSent(true);
    },
    [resetEmail],
  );

  const handleOAuth = useCallback(
    async (provider: "google" | "discord") => {
      setError(null);
      setOauthPending(provider);
      const { url, error: msg } = await signInWithOAuth(provider);
      if (msg) {
        setOauthPending(null);
        setError(msg);
        return;
      }
      if (url) {
        try {
          await Browser.OpenURL(url);
          setWaitingExternal(true);
        } catch {
          setOauthPending(null);
          setError(t("auth.oauthError"));
        }
      } else {
        setOauthPending(null);
        setError(t("auth.noAuthUrl"));
      }
    },
    [t],
  );

  const handleCancelWaiting = useCallback(() => {
    setWaitingExternal(false);
    setOauthPending(null);
  }, []);

  if (waitingExternal) {
    return (
      <div
        data-testid="login-screen"
        className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] text-white"
      >
        <div className="w-full max-w-sm space-y-5 text-center">
          <svg
            className="mx-auto h-10 w-10"
            viewBox="0 0 40 40"
            fill="none"
            style={{ filter: "drop-shadow(0 0 12px rgba(255,59,59,.4))" }}
          >
            <defs>
              <linearGradient id="loginLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ff4d4d" />
                <stop offset="55%" stopColor="#e21b1b" />
                <stop offset="100%" stopColor="#9a0606" />
              </linearGradient>
            </defs>
            <path
              d="M20 2 L38 38 L28 38 L20 18 L12 38 L2 38 Z"
              fill="url(#loginLogoGrad)"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="0.5"
            />
          </svg>
          <h1 className="font-sans text-lg font-semibold tracking-wide">
            {t("auth.waitingForAuth")}
          </h1>
          <p
            data-testid="login-waiting-message"
            className="text-sm text-white/60"
          >
            {t("auth.completeWith")}{" "}
            <span className="font-medium text-white capitalize">{oauthPending}</span>{" "}
            {t("auth.inBrowser")}
          </p>
          <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-vantare-red-500" />
          <button
            type="button"
            data-testid="login-cancel-waiting"
            onClick={handleCancelWaiting}
            className="w-full rounded-lg border border-white/10 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
          >
            {t("auth.cancelWaiting")}
          </button>
        </div>
      </div>
    );
  }

  if (signupEmailSent) {
    return (
      <div
        data-testid="login-screen"
        className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] text-white"
      >
        <div
          data-testid="login-email-sent"
          className="w-full max-w-sm space-y-5 text-center"
        >
          <svg
            className="mx-auto h-10 w-10"
            viewBox="0 0 40 40"
            fill="none"
            style={{ filter: "drop-shadow(0 0 12px rgba(255,59,59,.4))" }}
          >
            <defs>
              <linearGradient id="loginLogoGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ff4d4d" />
                <stop offset="55%" stopColor="#e21b1b" />
                <stop offset="100%" stopColor="#9a0606" />
              </linearGradient>
            </defs>
            <path
              d="M20 2 L38 38 L28 38 L20 18 L12 38 L2 38 Z"
              fill="url(#loginLogoGrad2)"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="0.5"
            />
          </svg>
          <h1 className="font-sans text-lg font-semibold tracking-wide">
            {t("auth.checkEmail")}
          </h1>
          <p className="text-sm text-white/60">
            {t("auth.checkEmailDesc")}
          </p>
          <button
            type="button"
            onClick={() => {
              setSignupEmailSent(false);
              setMode("login");
            }}
            className="w-full rounded-lg border border-white/10 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
          >
            {t("auth.backToLogin")}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "reset") {
    if (resetSent) {
      return (
        <div
          data-testid="login-screen"
          className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] text-white"
        >
          <div className="w-full max-w-sm space-y-5 text-center">
            <svg
              className="mx-auto h-10 w-10"
              viewBox="0 0 40 40"
              fill="none"
              style={{ filter: "drop-shadow(0 0 12px rgba(255,59,59,.4))" }}
            >
              <defs>
                <linearGradient id="loginLogoGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ff4d4d" />
                  <stop offset="55%" stopColor="#e21b1b" />
                  <stop offset="100%" stopColor="#9a0606" />
                </linearGradient>
              </defs>
              <path
                d="M20 2 L38 38 L28 38 L20 18 L12 38 L2 38 Z"
                fill="url(#loginLogoGrad3)"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="0.5"
              />
            </svg>
            <h1 className="font-sans text-lg font-semibold tracking-wide">
              {t("auth.checkEmail")}
            </h1>
            <p className="text-sm text-white/60">
              {t("auth.resetSent")}
            </p>
            <button
              type="button"
              onClick={() => {
                setResetSent(false);
                setMode("login");
              }}
              className="w-full rounded-lg border border-white/10 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            >
              {t("auth.backToLogin")}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        data-testid="login-screen"
        className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] text-white"
      >
        <form
          data-testid="login-reset-form"
          onSubmit={handleResetPassword}
          className="w-full max-w-sm space-y-5"
        >
          <div className="text-center">
            <svg
              className="mx-auto h-10 w-10"
              viewBox="0 0 40 40"
              fill="none"
              style={{ filter: "drop-shadow(0 0 12px rgba(255,59,59,.4))" }}
            >
              <defs>
                <linearGradient id="loginLogoGrad4" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ff4d4d" />
                  <stop offset="55%" stopColor="#e21b1b" />
                  <stop offset="100%" stopColor="#9a0606" />
                </linearGradient>
              </defs>
              <path
                d="M20 2 L38 38 L28 38 L20 18 L12 38 L2 38 Z"
                fill="url(#loginLogoGrad4)"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="0.5"
              />
            </svg>
            <h1 className="mt-4 font-sans text-lg font-semibold tracking-wide">
              {t("auth.resetTitle")}
            </h1>
          </div>
          {error ? (
            <p
              data-testid="login-error"
              className="text-center text-sm text-vantare-red-400"
            >
              {error}
            </p>
          ) : null}
          <label className="block space-y-1.5">
            <span className="text-xs uppercase tracking-widest text-white/60">
              {t("auth.email")}
            </span>
            <input
              type="email"
              required
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              className="w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm placeholder:text-white/35 focus:border-vantare-red-500/50 focus:bg-white/10 focus:outline-none transition-colors"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-gradient-to-br from-vantare-red-500 to-[#9a0606] py-2.5 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-vantare-red-900/20 transition-all hover:from-vantare-red-400 hover:to-vantare-red-600 disabled:opacity-50"
          >
            {t("auth.sendLink")}
          </button>
          <button
            type="button"
            onClick={() => setMode("login")}
            className="w-full py-2 text-sm text-white/60 transition-colors hover:text-white"
          >
            {t("auth.backToLogin")}
          </button>
        </form>
      </div>
    );
  }

  const isSignup = mode === "signup";

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
            {isSignup ? t("auth.signUpTitle") : "Welcome to Vantare"}
          </h1>
          <p className="mt-1 text-sm text-white/60">
            {isSignup ? t("auth.createAccount") : "Sign in or create an account"}
          </p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            data-testid="login-google-primary"
            onClick={() => handleOAuth("google")}
            disabled={oauthPending !== null}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-vantare-red-500 to-[#9a0606] py-3 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-vantare-red-900/20 transition-all hover:from-vantare-red-400 hover:to-vantare-red-600 disabled:opacity-50"
          >
            {oauthPending === "google" ? t("auth.openingGoogle") : t("auth.signInWithGoogle")}
          </button>

          <button
            type="button"
            onClick={() => handleOAuth("discord")}
            disabled={oauthPending !== null}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 py-3 text-sm font-bold uppercase tracking-widest text-white transition-all hover:bg-white/10 disabled:opacity-50"
          >
            {oauthPending === "discord" ? t("auth.opening") : t("auth.signInWithDiscord")}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[10px] uppercase tracking-widest text-white/35">
            {t("auth.or")}
          </span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form
          data-testid={isSignup ? "login-signup-form" : undefined}
          onSubmit={isSignup ? handleSignUp : handleSubmit}
          className="space-y-4"
        >
          {error ? (
            <p
              data-testid="login-error"
              className="text-center text-sm text-vantare-red-400"
            >
              {error}
            </p>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-xs uppercase tracking-widest text-white/60">
              {t("auth.email")}
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm placeholder:text-white/35 focus:border-vantare-red-500/50 focus:bg-white/10 focus:outline-none transition-colors"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs uppercase tracking-widest text-white/60">
              {t("auth.password")}
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm placeholder:text-white/35 focus:border-vantare-red-500/50 focus:bg-white/10 focus:outline-none transition-colors"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg border border-white/20 bg-white/5 py-2.5 text-sm font-bold uppercase tracking-widest text-white transition-all hover:bg-white/10 disabled:opacity-50"
          >
            {isSignup ? t("auth.signupButton") : t("auth.loginButton")}
          </button>
        </form>

        <div className="space-y-2 text-center">
          {isSignup ? (
            <button
              type="button"
              onClick={() => setMode("login")}
              className="text-xs text-white/60 transition-colors hover:text-white"
            >
              {t("auth.haveAccount")} {t("auth.backToLogin")}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="text-xs text-white/60 transition-colors hover:text-white"
              >
                {t("auth.noAccount")} {t("auth.createAccount")}
              </button>
              <button
                type="button"
                onClick={() => setMode("reset")}
                className="block mx-auto text-xs text-white/35 transition-colors hover:text-white/60"
              >
                {t("auth.forgotPassword")}
              </button>
            </>
          )}
        </div>

        <p
          data-testid="login-primary-hint"
          className="text-center text-[10px] text-white/35"
        >
          {t("auth.googleHint")}
        </p>

        <p className="pt-8 text-center text-[10px] text-white/20">
          made by <span className="font-semibold text-white/40">Vantare</span>
        </p>
      </div>
    </div>
  );
}
