import { useCallback, useState } from "react";
import type { FormEvent } from "react";
import { signInWithEmail, signInWithOAuth } from "../../lib/supabase-auth";

type LoginScreenProps = {
  onLoggedIn: (accessToken?: string) => void;
};

export function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const handleOAuth = useCallback(
    async (provider: "google" | "discord") => {
      setError(null);
      const { error: msg } = await signInWithOAuth(provider);
      if (msg) {
        setError(msg);
      }
    },
    [],
  );

  return (
    <div
      data-testid="login-screen"
      className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-white"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-white/10 bg-[#111] p-6"
      >
        <h1 className="text-center font-mono text-sm uppercase tracking-widest">
          Iniciar sesión
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
            Email
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
            Contraseña
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
          Entrar
        </button>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => handleOAuth("google")}
            className="flex-1 rounded border border-white/10 py-2 font-mono text-[10px] uppercase hover:bg-white/5"
          >
            Google
          </button>
          <button
            type="button"
            onClick={() => handleOAuth("discord")}
            className="flex-1 rounded border border-white/10 py-2 font-mono text-[10px] uppercase hover:bg-white/5"
          >
            Discord
          </button>
        </div>
      </form>
    </div>
  );
}