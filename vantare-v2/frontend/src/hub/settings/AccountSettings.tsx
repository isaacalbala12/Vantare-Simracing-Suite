import { useCallback } from "react";
import { signOut, getSession } from "../../lib/supabase-auth";
import { useLicense } from "../../lib/license";
import { Events } from "@wailsio/runtime";

export function AccountSettings() {
  const { result, refresh } = useLicense();

  const handleLogout = useCallback(async () => {
    await signOut();
    refresh();
  }, [refresh]);

  const handleResetDevice = useCallback(async () => {
    try {
      const session = await getSession();
      const token = session?.access_token ?? "";
      Events.Emit("license:reset-device", { sessionToken: token });
    } catch (err) {
      console.error("Error retrieving session for reset-device:", err);
    }
  }, []);

  return (
    <section className="space-y-4 text-white" aria-label="account-settings">
      <h2 className="font-mono text-xs uppercase tracking-widest">Cuenta</h2>
      <div className="rounded border border-white/10 bg-[#111] p-3">
        <p className="font-mono text-[10px] text-vantare-textDim">Email</p>
        <p className="font-mono text-xs">{result?.email ?? "—"}</p>
      </div>
      <div className="rounded border border-white/10 bg-[#111] p-3">
        <p className="font-mono text-[10px] text-vantare-textDim">Estado</p>
        <p className="font-mono text-xs uppercase">
          {result?.state ?? "loading"}
        </p>
      </div>
      <div className="rounded border border-white/10 bg-[#111] p-3">
        <p className="font-mono text-[10px] text-vantare-textDim">
          Entitlements
        </p>
        {result?.entitlements && result.entitlements.length > 0 ? (
          <ul className="space-y-1">
            {result.entitlements.map((e) => (
              <li key={e} className="font-mono text-xs uppercase">
                {e}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-mono text-xs text-vantare-textDim">—</p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleResetDevice}
          className="rounded border border-red-500/30 hover:bg-red-500/10 px-3 py-1.5 font-mono text-[10px] uppercase text-red-400"
        >
          Restablecer PC
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded border border-white/20 px-3 py-1.5 font-mono text-[10px] uppercase hover:bg-white/5"
        >
          Cerrar sesión
        </button>
      </div>
    </section>
  );
}