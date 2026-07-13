import { useCallback, useEffect, useState } from "react";
import { getSession } from "../../lib/supabase-auth";
import type { LicenseResult } from "../../lib/license-types";
import {
  formatLicenseDebugReport,
  getLicenseDebugEntries,
  isWailsRuntimeMockActive,
  subscribeLicenseDebug,
  type LicenseDebugEntry,
} from "../../lib/license-debug-log";

type LicenseDiagnosticsPanelProps = {
  license: LicenseResult | null;
};

function formatEntry(entry: LicenseDebugEntry): string {
  const detail = entry.detail ? ` ${JSON.stringify(entry.detail)}` : "";
  return `${entry.at.slice(11, 19)} ${entry.scope}: ${entry.message}${detail}`;
}

export function LicenseDiagnosticsPanel({
  license,
}: LicenseDiagnosticsPanelProps) {
  const [entries, setEntries] = useState<LicenseDebugEntry[]>(() =>
    getLicenseDebugEntries(),
  );
  const [sessionEmail, setSessionEmail] = useState<string>("…");
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  useEffect(() => {
    return subscribeLicenseDebug(() => {
      setEntries(getLicenseDebugEntries());
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((session) => {
        if (cancelled) return;
        setHasToken(Boolean(session?.access_token));
        setSessionEmail(session?.user?.email ?? "(sin email en sesión)");
      })
      .catch(() => {
        if (cancelled) return;
        setHasToken(false);
        setSessionEmail("(error leyendo sesión)");
      });
    return () => {
      cancelled = true;
    };
  }, [license?.email, license?.state]);

  const handleCopy = useCallback(async () => {
    const text = formatLicenseDebugReport(
      license
        ? {
            state: license.state,
            email: license.email,
            entitlements: license.entitlements,
            deviceOK: license.deviceOK,
            error: license.error,
            lastValidated: license.lastValidated,
          }
        : null,
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopyNote("Copiado al portapapeles");
    } catch {
      setCopyNote("No se pudo copiar — selecciona el texto manualmente");
    }
  }, [license]);

  if (!import.meta.env.DEV) {
    return null;
  }

  const mock = isWailsRuntimeMockActive();

  return (
    <div
      data-testid="license-diagnostics-panel"
      className="rounded border border-amber-500/30 bg-amber-500/5 p-3 space-y-2"
    >
      <p className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
        Diagnóstico licencia (solo dev)
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 font-mono text-[10px]">
        <dt className="text-vantare-textDim">Runtime</dt>
        <dd className={mock ? "text-vantare-red-400" : "text-vantare-success"}>
          {mock ? "MOCK (test@example.com)" : "Wails real (Go)"}
        </dd>
        <dt className="text-vantare-textDim">Sesión Supabase</dt>
        <dd>
          {hasToken === null
            ? "comprobando…"
            : hasToken
              ? `token OK — ${sessionEmail}`
              : "sin token (haz login de nuevo)"}
        </dd>
        <dt className="text-vantare-textDim">Licencia UI</dt>
        <dd>
          {license
            ? `${license.state} | ${license.email || "—"} | [${license.entitlements.join(", ") || "—"}]`
            : "—"}
        </dd>
      </dl>
      <div className="max-h-32 overflow-y-auto rounded border border-white/10 bg-black/40 p-2">
        {entries.length === 0 ? (
          <p className="font-mono text-[10px] text-vantare-textDim">
            Sin eventos aún. Pulsa Actualizar acceso o Restablecer PC.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {entries.slice(0, 12).map((entry, i) => (
              <li
                key={`${entry.at}-${i}`}
                className={`font-mono text-[9px] break-all ${
                  entry.level === "warn"
                    ? "text-vantare-red-400"
                    : "text-vantare-textDim"
                }`}
              >
                {formatEntry(entry)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="license-diagnostics-copy"
          onClick={handleCopy}
          className="rounded border border-amber-500/40 px-2 py-1 font-mono text-[10px] uppercase text-amber-300 hover:bg-amber-500/10"
        >
          Copiar diagnóstico
        </button>
        {copyNote ? (
          <span className="font-mono text-[10px] text-vantare-textDim">
            {copyNote}
          </span>
        ) : null}
      </div>
    </div>
  );
}