import { ActiveOverlayCard } from "../components/ActiveOverlayCard";
import { QuickActions } from "../components/QuickActions";
import { LastActivityCard } from "../components/LastActivityCard";
import { LauncherCard } from "../components/LauncherCard";
import { RecommendedQuickStart } from "../components/RecommendedQuickStart";
import { CalendarHeroUpcomingPanel } from "../calendar/CalendarHeroUpcomingPanel";
import { V52InfoCard } from "../components/V52InfoCard";

type DashboardPageProps = {
  onNavigate?: (section: string) => void;
  hasActiveProfile?: boolean;
  onUseRecommended?: () => void;
};

export function DashboardPage({
  onNavigate,
  hasActiveProfile = false,
  onUseRecommended,
}: DashboardPageProps) {
  const handleNavigate = onNavigate ?? (() => {});

  return (
    <div className="flex flex-col gap-5">
      {/* Hero banner — full width, gradient red */}
      <div
        className="relative rounded-xl overflow-hidden border border-vantare-red-500/50 hover:border-vantare-red-500/70 transition-all hover:-translate-y-0.5"
        data-testid="dashboard-hero-banner"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#ff3b3b]/60 via-[#9a0606]/40 to-[#0a0a0a]" />
        <div className="absolute right-0 top-0 w-64 h-64 bg-vantare-red-500/20 blur-3xl rounded-full" />
        <div className="relative p-7 flex flex-col md:flex-row items-center gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="pro-badge">BETA</span>
              <span className="text-xs text-vantare-red-400 font-semibold bg-[#9a0606]/50 px-2 py-1 rounded-full border border-vantare-red-500/30 whitespace-nowrap">
                v0.1.0.2
              </span>
            </div>
            <h3 className="font-bold text-3xl text-white mb-2 tracking-tight">
              Vantare Beta
            </h3>
            <p className="text-sm text-vantare-textMuted leading-relaxed">
              Overlays para simulación, editor de widgets, Ingeniero de spotter y OBS local. Plan Free activo con acceso básico.
            </p>
          </div>
          <div className="flex flex-col items-end shrink-0 gap-3">
            <button
              type="button"
              onClick={() => handleNavigate("setup")}
              className="btn-primary px-6 py-2.5 rounded-lg font-bold text-sm text-white whitespace-nowrap"
            >
              Gestionar cuenta
            </button>
          </div>
        </div>
      </div>

      {/* Próximas carreras — 3 cards + WEC Weekly row */}
      <CalendarHeroUpcomingPanel onNavigate={handleNavigate} />

      {/* Overlay activo */}
      <ActiveOverlayCard
        onNavigate={handleNavigate}
        onUseRecommended={onUseRecommended}
      />

      {/* Ingeniero — purple gradient block */}
      <section
        className="relative rounded-xl p-6 overflow-hidden border border-[#7c3aed]/30 hover:border-[#7c3aed]/60 transition-colors"
        data-testid="dashboard-engineer-section"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#1e1b4b]/60 via-[#312e81]/40 to-[#0a0a0a]" />
        <div className="absolute -right-20 top-0 w-72 h-72 bg-[#7c3aed]/20 blur-3xl rounded-full pointer-events-none" />
        <div className="relative flex items-center gap-5">
          <div
            className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#312e81] flex items-center justify-center shrink-0"
            style={{ boxShadow: "0 0 24px rgba(124,58,237,.4)" }}
          >
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-[.22em]"
                style={{ background: "rgba(124,58,237,.2)", color: "#a78bfa", border: "1px solid rgba(124,58,237,.4)" }}
              >
                En desarrollo
              </span>
              <span className="text-[10px] font-bold text-vantare-textDim uppercase tracking-[.22em]">
                Disponible en beta segun configuracion actual
              </span>
            </div>
            <h3 className="font-bold text-xl text-white tracking-tight">
              Ingeniero Vantare · Spotter IA
            </h3>
            <p className="text-sm text-vantare-textMuted mt-1 leading-relaxed">
              Analiza stint, predice degrado y avisa como un ingeniero real. Funciona con LMU en modo simulacion o replay.
            </p>
            <div className="flex items-center gap-3 mt-3">
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: "47%", background: "linear-gradient(90deg,#7c3aed,#a78bfa)", boxShadow: "0 0 8px rgba(124,58,237,.5)" }}
                />
              </div>
              <span className="text-[10px] font-mono font-bold text-[#a78bfa] shrink-0">
                47%
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleNavigate("roadmap")}
              className="mt-3 text-[10px] font-bold uppercase tracking-[.22em] text-vantare-textMuted hover:text-white transition-colors"
            >
              Ver roadmap →
            </button>
          </div>
        </div>
      </section>

      {/* Bottom grid: 3 columns — Simulador principal + Novedades Vantare */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Simulador principal */}
        <section className="glass-panel rounded-xl p-4" data-testid="dashboard-main-sim">
          <div className="flex items-center justify-between mb-3">
            <span className="v52-eyebrow">Simulador principal</span>
            <span className="text-[10px] font-mono font-bold text-vantare-textDim uppercase tracking-[.22em]">
              Configurado
            </span>
          </div>
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-vantare-red-700 to-[#9a0606] flex items-center justify-center shrink-0"
              style={{ boxShadow: "0 0 12px rgba(255,59,59,.3)" }}
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 13l1.5-4.5A2 2 0 016.4 7h11.2a2 2 0 011.9 1.5L21 13M5 13h14v4a1 1 0 01-1 1h-2a1 1 0 01-1-1v-1H9v1a1 1 0 01-1 1H6a1 1 0 01-1-1v-4z" />
                <circle cx="7.5" cy="15.5" r="0.8" fill="currentColor" />
                <circle cx="16.5" cy="15.5" r="0.8" fill="currentColor" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm text-white truncate">Le Mans Ultimate</p>
              <p className="text-[9px] font-mono font-bold text-vantare-textMuted uppercase tracking-[.18em]">
                Launcher configurado
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <div>
              <div className="flex items-center justify-between text-[10px] mb-0.5">
                <span className="text-white font-semibold">Le Mans Ultimate</span>
                <span className="font-mono text-vantare-textDim">Configurado</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: "100%", background: "linear-gradient(90deg,#ff3b3b,#ff4d4d)" }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-[10px] mb-0.5">
                <span className="text-vantare-textMuted">iRacing</span>
                <span className="font-mono text-vantare-textDim">No disponible</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-white/10" style={{ width: "0%" }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-[10px] mb-0.5">
                <span className="text-vantare-textMuted">Assetto Corsa</span>
                <span className="font-mono text-vantare-textDim">No disponible</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-white/10" style={{ width: "0%" }} />
              </div>
            </div>
          </div>
        </section>

        {/* Novedades Vantare (2 cols) */}
        <section className="lg:col-span-2 glass-panel rounded-xl p-4" data-testid="dashboard-novedades">
          <div className="flex items-center justify-between mb-3">
            <span className="v52-eyebrow">Novedades Vantare</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <V52InfoCard
              label="Release"
              title="v0.1.0.2 publicado"
              body="Fix de login Google OAuth · Free plan ya no se queda bloqueado. Supabase configurado en build."
              tone="green"
            />
            <V52InfoCard
              label="Feature"
              title="Hub v5.2 en progreso"
              body="Estamos migrando el Hub por cortes pequenos para no romper el flujo de beta."
              tone="blue"
            />
            <V52InfoCard
              label="Launcher"
              title="LMU disponible"
              body="Configura Steam o ejecutable local desde la pestana Launcher."
              tone="green"
            />
            <V52InfoCard
              label="Beta"
              title="Ingeniero en desarrollo"
              body="Spotter IA con analisis de stint y prediccion de degrado. Disponible en modo simulacion."
              tone="purple"
            />
          </div>
        </section>
      </div>

      {/* Secondary row: Launcher + Quick actions + Last activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <LauncherCard />
        <QuickActions onNavigate={handleNavigate} />
        <LastActivityCard />
      </div>

      {/* RecommendedQuickStart — only when no active profile */}
      {!hasActiveProfile && onUseRecommended && (
        <RecommendedQuickStart
          hasActiveProfile={hasActiveProfile}
          onUseRecommended={onUseRecommended}
          onGoToObsSetup={handleNavigate}
        />
      )}
    </div>
  );
}
