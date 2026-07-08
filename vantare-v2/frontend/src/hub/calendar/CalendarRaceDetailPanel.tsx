import { useCallback, useEffect, useMemo } from "react";
import { Events } from "@wailsio/runtime";
import type { Calendar, RaceSeries, RaceEvent, Session } from "../../calendar/calendar-types";
import { buildUpcomingRaceItems, type UpcomingRaceItem } from "./calendar-upcoming";
import type { CalendarFilter } from "./CalendarToolbar";
import { useAccess } from "../../lib/access";
import { canUseFeature } from "../../lib/access-policy";

const TIER_INFO: Record<
  Exclude<CalendarFilter, "all">,
  { label: string; color: string; bg: string; border: string }
> = {
  beginner: { label: "Bronce", color: "#CD7F32", bg: "rgba(205,127,50,.12)", border: "rgba(205,127,50,.5)" },
  intermediate: { label: "Plata", color: "#B8BFC8", bg: "rgba(184,191,200,.12)", border: "rgba(184,191,200,.5)" },
  advanced: { label: "Oro", color: "#D4A017", bg: "rgba(212,160,23,.12)", border: "rgba(212,160,23,.5)" },
  weekly: { label: "Semanal", color: "#ff3b3b", bg: "rgba(255,59,59,.12)", border: "rgba(255,59,59,.5)" },
  special: { label: "Especial", color: "#f59e0b", bg: "rgba(245,158,11,.12)", border: "rgba(245,158,11,.5)" },
};

export type CalendarRaceDetailPanelProps = {
  tier: CalendarFilter;
  calendar: Calendar;
  timeZone: string;
  onClose: () => void;
};

function getTierInfo(tier: CalendarFilter): { label: string; color: string; bg: string; border: string } {
  return TIER_INFO[tier as Exclude<CalendarFilter, "all">] ?? TIER_INFO.special;
}

function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-ES", { timeZone, hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-ES", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(date);
}

function getSessionLabel(name: string): string {
  switch (name) {
    case "practice": return "Práctica";
    case "qualifying": return "Qualy";
    case "race": return "Carrera";
    default: return name;
  }
}

export function CalendarRaceDetailPanel({
  tier,
  calendar,
  timeZone,
  onClose,
}: CalendarRaceDetailPanelProps) {
  const access = useAccess();
  const canFollow = canUseFeature(access, "calendar.followReminders");
  const info = getTierInfo(tier);

  // Handle Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Find the series/event for this tier
  const items = useMemo(() => buildUpcomingRaceItems(calendar, new Date()), [calendar]);

  const currentItem: UpcomingRaceItem | null = useMemo(() => {
    if (tier === "special") return items.find((i) => i.kind === "event") ?? null;
    return items.find((i) => i.tier === tier) ?? null;
  }, [items, tier]);

  // Find the full series data
  const seriesData: RaceSeries | null = useMemo(() => {
    if (!currentItem) return null;
    return calendar.series?.find((s) => s.id === currentItem.id) ?? null;
  }, [calendar.series, currentItem]);

  // Find the concrete event if it's an event
  const eventData: RaceEvent | null = useMemo(() => {
    if (!currentItem || currentItem.kind !== "event") return null;
    return calendar.events?.find((e) => e.id === currentItem.id) ?? null;
  }, [calendar.events, currentItem]);

  const isFollowed = useMemo(() => {
    if (!currentItem) return false;
    if (currentItem.kind === "series") {
      return calendar.followedSeriesIds?.includes(currentItem.id) ?? false;
    }
    return calendar.followedEventIds?.includes(currentItem.id) ?? false;
  }, [currentItem, calendar]);

  const handleFollow = useCallback(() => {
    if (!currentItem || !canFollow) return;
    if (currentItem.kind === "series") {
      Events.Emit("calendar:series:follow", { seriesId: currentItem.id });
    } else {
      Events.Emit("calendar:follow", { eventId: currentItem.id });
    }
  }, [currentItem, canFollow]);

  const handleUnfollow = useCallback(() => {
    if (!currentItem || !canFollow) return;
    if (currentItem.kind === "series") {
      Events.Emit("calendar:series:unfollow", { seriesId: currentItem.id });
    } else {
      Events.Emit("calendar:unfollow", { eventId: currentItem.id });
    }
  }, [currentItem, canFollow]);

  // Determine sessions to display
  const sessions: Session[] = useMemo(() => {
    if (seriesData?.sessions && seriesData.sessions.length > 0) {
      return seriesData.sessions;
    }
    if (eventData?.sessions && eventData.sessions.length > 0) {
      return eventData.sessions;
    }
    // Fallback: build estimated sessions
    const raceDur = seriesData?.durationMin ?? eventData?.durationMin ?? 0;
    return [
      { name: "practice", durationMin: 3, estimated: true },
      { name: "qualifying", durationMin: 8, estimated: true },
      { name: "race", durationMin: raceDur, estimated: false },
    ];
  }, [seriesData, eventData]);

  const hasEstimatedSessions = sessions.some((s) => s.estimated);

  const raceDurationMin = seriesData?.raceDurationMin ?? seriesData?.durationMin ?? eventData?.durationMin ?? 0;
  const eventDurationMin = seriesData?.eventDurationMin ?? (raceDurationMin > 0 ? raceDurationMin + 11 : 0);

  const nextStartDate = currentItem?.nextStart ? new Date(currentItem.nextStart) : null;
  const registrationUrl = eventData?.registrationUrl ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="calendar-race-detail-panel"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Blur overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${info.label}`}
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl shadow-black flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
        style={{ scrollbarWidth: "thin" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-5 border-b border-white/10 shrink-0"
          style={{ borderBottomColor: info.border }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: info.color }}
            />
            <h2 className="text-lg font-bold text-white" data-testid="calendar-detail-panel-title">
              {info.label}
            </h2>
          </div>
          <button
            data-testid="calendar-detail-panel-close"
            onClick={onClose}
            className="text-vantare-textDim hover:text-white text-xl leading-none px-2"
            aria-label="Cerrar panel"
          >
            ×
          </button>
        </div>

        <div className="flex-1 p-5 space-y-5">
          {!currentItem ? (
            <p className="text-sm text-vantare-textDim italic">
              No hay información disponible para esta categoría.
            </p>
          ) : (
            <>
              {/* Series/Event name and track */}
              <div>
                <h3 className="text-xl font-bold text-white">{currentItem.name}</h3>
                <p className="text-sm text-vantare-textMuted mt-1">{currentItem.track}</p>
              </div>

              {/* Next start time */}
              {nextStartDate && (
                <div className="flex items-center gap-2 text-xs font-mono text-vantare-textMuted">
                  <span>Próxima salida:</span>
                  <span className="text-white font-semibold">
                    {formatDate(nextStartDate, timeZone)} · {formatTime(nextStartDate, timeZone)}
                  </span>
                </div>
              )}

              {/* Duration info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-vantare-textMuted">
                    Duración total
                  </span>
                  <p className="text-lg font-bold text-white mt-1">
                    {eventDurationMin > 0 ? `${eventDurationMin} min` : "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-vantare-textMuted">
                    Carrera
                  </span>
                  <p className="text-lg font-bold text-white mt-1">
                    {raceDurationMin > 0 ? `${raceDurationMin} min` : "—"}
                  </p>
                </div>
              </div>

              {/* Sessions breakdown */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-vantare-textMuted">
                    Sesiones
                  </span>
                  {hasEstimatedSessions && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                      Estimado
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  {sessions.map((sess, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg bg-white/[0.02] border border-white/5 px-3 py-2"
                    >
                      <span className="text-sm text-white">{getSessionLabel(sess.name)}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-vantare-textMuted">
                          {sess.durationMin} min
                        </span>
                        {sess.estimated && (
                          <span className="text-[9px] text-amber-400/70 font-mono">(est.)</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {hasEstimatedSessions && (
                  <p className="text-[10px] text-amber-400/60 mt-2 italic">
                    Las sesiones de práctica y qualy son estimadas. La duración real puede variar.
                  </p>
                )}
              </div>

              {/* Series details grid */}
              <div className="grid grid-cols-2 gap-2">
                {seriesData?.vehicleClass && (
                  <DetailItem label="Categoría" value={seriesData.vehicleClass} />
                )}
                {seriesData?.setup && (
                  <DetailItem label="Setup" value={seriesData.setup === "fixed" ? "Fijo" : "Abierto"} />
                )}
                {seriesData?.splits && (
                  <DetailItem label="Splits" value={String(seriesData.splits)} />
                )}
                {seriesData?.assists && (
                  <DetailItem label="Assists" value={seriesData.assists} />
                )}
                {seriesData?.tyreWarmers !== undefined && (
                  <DetailItem label="Tyre warmers" value={seriesData.tyreWarmers ? "Sí" : "No"} />
                )}
                {seriesData?.tyres && (
                  <DetailItem label="Neumáticos" value={`${seriesData.tyres} sets`} />
                )}
                {seriesData?.licenseLabel && (
                  <DetailItem label="Licencia" value={seriesData.licenseLabel} />
                )}
              </div>

              {/* Registration */}
              <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3">
                {registrationUrl ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-vantare-textMuted">Inscripción</span>
                    <a
                      href={registrationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-accent hover:text-white transition-colors"
                    >
                      Abrir inscripción →
                    </a>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-vantare-textMuted">Inscripción</span>
                    <span className="text-xs text-vantare-textDim italic">
                      Desde LMU / RaceControl
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-5 border-t border-white/10 bg-white/[0.02] shrink-0 flex gap-3">
          {currentItem && currentItem.id && (
            canFollow ? (
              <button
                data-testid="calendar-detail-panel-follow"
                onClick={isFollowed ? handleUnfollow : handleFollow}
                className={`flex-1 py-2.5 rounded text-xs font-bold uppercase tracking-widest transition-colors ${
                  isFollowed
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-vantare-red-500/10 hover:text-vantare-red-400 hover:border-vantare-red-500/20"
                    : "bg-white/5 text-[#f5f5f5]/60 border border-white/10 hover:text-white hover:border-white/20"
                }`}
                aria-label={isFollowed ? `Dejar de seguir ${currentItem.name}` : `Seguir ${currentItem.name}`}
                aria-pressed={isFollowed}
              >
                {isFollowed ? "Siguiendo · Dejar" : "Seguir"}
              </button>
            ) : (
              <span
                data-testid="calendar-detail-panel-locked"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded text-xs font-bold uppercase tracking-widest bg-white/5 text-vantare-textMuted border border-white/10 cursor-not-allowed"
                title="Disponible para testers y planes de pago"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m0 0v2m0-2h2m-2 0H10m9.364-7.364A9 9 0 1112 3a9 9 0 017.364 4.636z" />
                </svg>
                Bloqueado
              </span>
            )
          )}
          <button
            data-testid="calendar-detail-panel-close-btn"
            onClick={onClose}
            className="flex-1 py-2.5 rounded text-xs font-bold uppercase tracking-widest transition-colors border border-white/10 text-vantare-textMuted hover:text-white hover:border-white/20"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/5 px-3 py-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-vantare-textMuted">
        {label}
      </span>
      <p className="text-sm text-white mt-0.5 truncate" title={value}>
        {value}
      </p>
    </div>
  );
}
