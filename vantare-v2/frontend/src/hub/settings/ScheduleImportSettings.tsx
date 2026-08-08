import { useCallback, useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";

/** One parsed series, as the backend summarises it for review. */
export type PreviewSeries = {
  id: string;
  name: string;
  tier: string;
  track: string;
  classes: string[];
  raceMin: number;
  cadence: string;
  setup: string;
  timeScale?: number;
  veLimit?: number;
  safetyRating?: string;
  noteCount: number;
};

export type SchedulePreview = {
  validFrom: string;
  validUntil: string;
  seriesCount: number;
  series: PreviewSeries[];
};

const TIER_LABELS: Record<string, string> = {
  beginner: "Bronce",
  intermediate: "Plata",
  advanced: "Oro",
  weekly: "Semanal",
};

/**
 * The owner-only screen for publishing the weekly LMU schedule.
 *
 * LMU posts it as text on Discord, so the flow is paste, review, publish. The
 * review step exists because a parser that misreads a changed format should be
 * caught here rather than by everyone's calendar.
 */
export function ScheduleImportSettings() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const offs: (() => void)[] = [];

    offs.push(
      Events.On("schedule:preview", (event: { data: SchedulePreview }) => {
        setBusy(false);
        setError(null);
        setPreview(event.data);
      }),
    );
    offs.push(
      Events.On("schedule:draft-saved", (event: { data: { draftId?: string } }) => {
        setBusy(false);
        setError(null);
        setDraftId(event.data.draftId ?? null);
        setStatus("Borrador guardado. Revísalo y publícalo cuando esté bien.");
      }),
    );
    offs.push(
      Events.On("schedule:published", () => {
        setBusy(false);
        setError(null);
        setDraftId(null);
        setStatus("Publicado. Los demás lo verán al abrir la app o al recargar.");
      }),
    );
    offs.push(
      Events.On(
        "schedule:draft",
        (event: { data: { draftId?: string; sourceText?: string; preview?: SchedulePreview } }) => {
          setBusy(false);
          if (!event.data.draftId) return;
          setDraftId(event.data.draftId);
          setText(event.data.sourceText ?? "");
          setPreview(event.data.preview ?? null);
          setStatus("Tienes un borrador sin publicar.");
        },
      ),
    );
    offs.push(
      Events.On("schedule:error", (event: { data: { message?: string } }) => {
        setBusy(false);
        setError(event.data.message ?? "Error desconocido");
      }),
    );

    Events.Emit("schedule:draft:get");
    return () => offs.forEach((off) => off());
  }, []);

  const handleParse = useCallback(() => {
    setBusy(true);
    setStatus(null);
    setError(null);
    Events.Emit("schedule:parse", { text });
  }, [text]);

  const handleSaveDraft = useCallback(() => {
    setBusy(true);
    setStatus(null);
    setError(null);
    Events.Emit("schedule:draft:save", { text });
  }, [text]);

  const handlePublish = useCallback(() => {
    setBusy(true);
    setStatus(null);
    setError(null);
    Events.Emit("schedule:publish", { draftId });
  }, [draftId]);

  return (
    <section className="flex flex-col gap-4" data-testid="schedule-import">
      <header>
        <h2 className="text-sm font-bold text-white">Horario semanal de LMU</h2>
        <p className="mt-1 text-xs text-vantare-textMuted">
          Pega el horario tal cual lo publican en Discord. Revisa lo que ha entendido antes de
          publicarlo: lo verán todos los usuarios.
        </p>
      </header>

      <textarea
        data-testid="schedule-import-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        spellCheck={false}
        placeholder="Daily Race Schedule from: 4th August 2026…"
        className="w-full resize-y rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-[11px] text-vantare-text outline-none focus:border-white/25"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="schedule-import-parse"
          onClick={handleParse}
          disabled={busy || text.trim() === ""}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-vantare-text disabled:opacity-40"
        >
          Interpretar
        </button>
        <button
          type="button"
          data-testid="schedule-import-save"
          onClick={handleSaveDraft}
          disabled={busy || preview === null}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-vantare-text disabled:opacity-40"
        >
          Guardar borrador
        </button>
        <button
          type="button"
          data-testid="schedule-import-publish"
          onClick={handlePublish}
          disabled={busy || draftId === null}
          className="rounded-lg bg-vantare-red-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
        >
          Publicar para todos
        </button>
      </div>

      {status && (
        <p data-testid="schedule-import-status" className="text-xs text-emerald-400">
          {status}
        </p>
      )}
      {error && (
        <p data-testid="schedule-import-error" className="text-xs text-red-400">
          {error}
        </p>
      )}

      {preview && <PreviewTable preview={preview} />}
    </section>
  );
}

function PreviewTable({ preview }: { preview: SchedulePreview }) {
  return (
    <div data-testid="schedule-import-preview" className="flex flex-col gap-2">
      <p className="text-xs text-vantare-textMuted">
        Semana del <span className="text-vantare-text">{preview.validFrom}</span> ·{" "}
        <span className="text-vantare-text">{preview.seriesCount}</span> series
      </p>

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-white/[0.03] text-vantare-textMuted">
            <tr>
              <th className="px-2 py-1.5 font-semibold">Serie</th>
              <th className="px-2 py-1.5 font-semibold">Tier</th>
              <th className="px-2 py-1.5 font-semibold">Circuito</th>
              <th className="px-2 py-1.5 font-semibold">Clases</th>
              <th className="px-2 py-1.5 font-semibold">Duración</th>
              <th className="px-2 py-1.5 font-semibold">Cadencia</th>
              <th className="px-2 py-1.5 font-semibold">Reglas</th>
            </tr>
          </thead>
          <tbody>
            {preview.series.map((s) => (
              <tr
                key={s.id}
                data-testid={`schedule-import-row-${s.id}`}
                className="border-t border-white/5"
              >
                <td className="px-2 py-1.5 font-semibold text-vantare-text">{s.name}</td>
                <td className="px-2 py-1.5 text-vantare-textMuted">
                  {TIER_LABELS[s.tier] ?? s.tier}
                </td>
                <td className="px-2 py-1.5 text-vantare-textMuted">{s.track}</td>
                <td className="px-2 py-1.5 text-vantare-textMuted">{s.classes.join(" · ")}</td>
                <td className="px-2 py-1.5 tabular-nums text-vantare-textMuted">{s.raceMin}m</td>
                <td className="px-2 py-1.5 text-vantare-textMuted">{s.cadence}</td>
                <td className="px-2 py-1.5 text-vantare-textMuted">
                  {[
                    s.setup === "fixed" ? "fijo" : "libre",
                    s.timeScale ? `${s.timeScale}x` : null,
                    s.veLimit ? `VE ${s.veLimit}%` : null,
                    s.safetyRating,
                    s.noteCount > 0 ? "aviso" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
