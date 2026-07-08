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

type LoginScreenProps = {
  onLoggedIn: (accessToken?: string) => void;
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
  // "waiting" means the external browser is open and we're waiting for the
  // OAuth callback to arrive via the local HTTP server.
  const [waitingExternal, setWaitingExternal] = useState(false);
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [signupEmailSent, setSignupEmailSent] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  // Listen for license:changed events — when the external OAuth callback
  // arrives, the Go server emits license:validate, which triggers
  // license:changed. We pick it up and complete login.
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
            onLoggedIn(event.data.accessToken);
          }
        }
      },
    );
    return () => {
      unsub?.();
    };
  }, [waitingExternal, onLoggedIn]);

  // Listen for auth:session events — the Go backend emits this after
  // license:validate completes, carrying the access_token and refresh_token
  // from the OAuth callback. We persist the session in the WebView's
  // Supabase client so it survives app restarts.
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
        onLoggedIn(session.access_token);
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
        onLoggedIn(session.access_token);
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

  // When waiting for external OAuth, show a clear waiting state
  if (waitingExternal) {
    return (
      <div
        data-testid="login-screen"
        className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white"
      >
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-white/10 bg-[#111] p-6 text-center">
          <h1 className="font-mono text-sm uppercase tracking-widest">
            {t("auth.waitingForAuth")}
          </h1>
          <p
            data-testid="login-waiting-message"
            className="font-mono text-[10px] text-vantare-textDim"
          >
            {t("auth.completeWith")}{" "}
            <span className="text-white capitalize">{oauthPending}</span>{" "}
            {t("auth.inBrowser")}
          </p>
          <div className="mx-auto h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <button
            type="button"
            data-testid="login-cancel-waiting"
            onClick={handleCancelWaiting}
            className="w-full rounded border border-white/10 py-2 font-mono text-[10px] uppercase hover:bg-white/5"
          >
            {t("auth.cancelWaiting")}
          </button>
        </div>
      </div>
    );
  }

  // Signup email confirmation sent
  if (signupEmailSent) {
    return (
      <div
        data-testid="login-screen"
        className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white"
      >
        <div
          data-testid="login-email-sent"
          className="w-full max-w-sm space-y-4 rounded-lg border border-white/10 bg-[#111] p-6 text-center"
        >
          <h1 className="font-mono text-sm uppercase tracking-widest">
            {t("auth.checkEmail")}
          </h1>
          <p className="font-mono text-[10px] text-vantare-textDim">
            {t("auth.checkEmailDesc")}
          </p>
          <button
            type="button"
            onClick={() => {
              setSignupEmailSent(false);
              setMode("login");
            }}
            className="w-full rounded border border-white/20 py-2 font-mono text-[10px] uppercase tracking-widest hover:bg-white/5"
          >
            {t("auth.backToLogin")}
          </button>
        </div>
      </div>
    );
  }

  // Reset password form
  if (mode === "reset") {
    if (resetSent) {
      return (
        <div
          data-testid="login-screen"
          className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white"
        >
          <div className="w-full max-w-sm space-y-4 rounded-lg border border-white/10 bg-[#111] p-6 text-center">
            <h1 className="font-mono text-sm uppercase tracking-widest">
              {t("auth.checkEmail")}
            </h1>
            <p className="font-mono text-[10px] text-vantare-textDim">
              {t("auth.resetSent")}
            </p>
            <button
              type="button"
              onClick={() => {
                setResetSent(false);
                setMode("login");
              }}
              className="w-full rounded border border-white/20 py-2 font-mono text-[10px] uppercase tracking-widest hover:bg-white/5"
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
        className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white"
      >
        <form
          data-testid="login-reset-form"
          onSubmit={handleResetPassword}
          className="w-full max-w-sm space-y-4 rounded-lg border border-white/10 bg-[#111] p-6"
        >
          <h1 className="text-center font-mono text-sm uppercase tracking-widest">
            {t("auth.resetTitle")}
          </h1>
          {error ? (
            <p
              data-testid="login-error"
              className="text-center font-mono text-[10px] text-vantare-red-400"
            >
              {error}
            </p>
          ) : null}
          <label className="block space-y-1">
            <span className="font-mono text-[10px] uppercase text-vantare-textDim">
              {t("auth.email")}
            </span>
            <input
              type="email"
              required
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              className="w-full rounded border border-white/10 bg-black px-2 py-1 font-mono text-xs outline-none focus:border-vantare-red-500"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-vantare-red-500 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:opacity-90 disabled:opacity-50"
          >
            {t("auth.sendLink")}
          </button>
          <button
            type="button"
            onClick={() => setMode("login")}
            className="w-full rounded border border-white/10 py-2 font-mono text-[10px] uppercase hover:bg-white/5"
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
      className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white"
    >
      <form
        data-testid={isSignup ? "login-signup-form" : undefined}
        onSubmit={isSignup ? handleSignUp : handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-white/10 bg-[#111] p-6"
      >
        <h1 className="text-center font-mono text-sm uppercase tracking-widest">
          {isSignup ? t("auth.signUpTitle") : t("auth.loginTitle")}
        </h1>
        <p
          data-testid="login-primary-hint"
          className="text-center font-mono text-[10px] text-vantare-textDim"
        >
          {t("auth.googleHint")}
        </p>
        {error ? (
          <p
            data-testid="login-error"
            className="text-center font-mono text-[10px] text-vantare-red-400"
          >
            {error}
          </p>
        ) : null}
        <button
          type="button"
          data-testid="login-google-primary"
          onClick={() => handleOAuth("google")}
          disabled={oauthPending !== null}
          className="w-full rounded bg-white py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:opacity-90 disabled:opacity-50"
        >
          {oauthPending === "google" ? t("auth.openingGoogle") : t("auth.signInWithGoogle")}
        </button>
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-white/10" />
          <span className="font-mono text-[9px] uppercase text-vantare-textDim">
            {t("auth.or")}
          </span>
          <div className="h-px flex-1 bg-white/10" />
        </div>
        <label className="block space-y-1">
          <span className="font-mono text-[10px] uppercase text-vantare-textDim">
            {t("auth.email")}
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-white/10 bg-black px-2 py-1 font-mono text-xs outline-none focus:border-vantare-red-500"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[10px] uppercase text-vantare-textDim">
            {t("auth.password")}
          </span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-white/10 bg-black px-2 py-1 font-mono text-xs outline-none focus:border-vantare-red-500"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-vantare-red-500 py-2 font-mono text-xs font-bold uppercase tracking-widest text-black hover:opacity-90 disabled:opacity-50"
        >
          {isSignup ? t("auth.signupButton") : t("auth.loginButton")}
        </button>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => handleOAuth("discord")}
            disabled={oauthPending !== null}
            className="flex-1 rounded border border-white/10 py-2 font-mono text-[10px] uppercase hover:bg-white/5 disabled:opacity-50"
          >
            {oauthPending === "discord" ? t("auth.opening") : t("auth.signInWithDiscord")}
          </button>
        </div>
        <div className="flex flex-col gap-2 pt-2 text-center">
          {isSignup ? (
            <button
              type="button"
              onClick={() => setMode("login")}
              className="font-mono text-[10px] text-vantare-textDim hover:text-white"
            >
              {t("auth.haveAccount")} {t("auth.backToLogin")}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="font-mono text-[10px] text-vantare-textDim hover:text-white"
              >
                {t("auth.noAccount")} {t("auth.createAccount")}
              </button>
              <button
                type="button"
                onClick={() => setMode("reset")}
                className="font-mono text-[10px] text-vantare-textDim hover:text-white"
              >
                {t("auth.forgotPassword")}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
