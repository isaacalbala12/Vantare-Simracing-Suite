import { useEffect, useState } from "react";
import { useAccess } from "../../lib/access";
import { canUseFeature } from "../../lib/access-policy";
import { useI18n } from "../../i18n/I18nProvider";
import {
  ROADMAP_CHANGELOG,
  ROADMAP_CHANGELOG_URL,
  ROADMAP_FEEDBACK_LINKS,
  getOverallProgress,
  getCurrentPhase,
  fetchRoadmapDataset,
  ROADMAP_FALLBACK,
  type RoadmapDataset,
  type RoadmapStatus,
  type RoadmapFeedbackType,
  type RoadmapFeedbackDestination,
} from "../roadmap/roadmap-data";
import {
  getActiveSections,
  STATUS_META,
  TIPO_META,
  type ActiveSections,
  type RoadmapCategory,
} from "../roadmap/roadmap-features";
import { pickText } from "../roadmap/roadmap-data";
import type { RoadmapFeature } from "../roadmap/features-data";

const STATUS_COLORS = {
  active: "text-vantare-red-400 border-vantare-red-500/30 bg-vantare-red-500/10",
};

const MILESTONE_TYPE_COLORS: Record<string, string> = {
  release: "text-green-400 border-green-500/30 bg-green-500/10",
  feature: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  fix: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  plan: "text-violet-400 border-violet-500/30 bg-violet-500/10",
};

function StatusBadge({ status, t }: { status: RoadmapStatus; t: (key: string) => string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-[.22em] ${STATUS_COLORS.active}`}
    >
      {t(`roadmap.status.${status}`)}
    </span>
  );
}

function ProgressBar({ value, color }: { value: number; color?: string }) {
  const bg = color ?? "from-vantare-red-600 to-vantare-red-400";
  return (
    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${bg}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function RoadmapFeedback({ t }: { t: (key: string) => string }) {
  const [type, setType] = useState<RoadmapFeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [destination, setDestination] = useState<RoadmapFeedbackDestination>("github");

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    if (destination === "github") {
      const title = `[${type === "bug" ? "BUG" : type === "suggestion" ? "SUG" : "GEN"}] ${trimmed.slice(0, 80)}`;
      const url = `${ROADMAP_FEEDBACK_LINKS.github}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(trimmed)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      const url =
        destination === "discord"
          ? ROADMAP_FEEDBACK_LINKS.discord
          : ROADMAP_FEEDBACK_LINKS.form;
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <span
          role="status"
          data-testid="roadmap-feedback-unlocked"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-vantare-red-500/10 border border-vantare-red-500/30 text-xs text-vantare-textMuted"
        >
          <svg className="w-4 h-4 shrink-0 text-vantare-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <span>{t("roadmap.feedback.opensExternal")}</span>
        </span>
      </div>

      <label className="flex flex-col gap-1 text-[10px] font-mono font-bold uppercase tracking-[.22em] text-vantare-textDim">
        {t("roadmap.feedback.type")}
        <select
          value={type}
          onChange={(e) => setType(e.target.value as RoadmapFeedbackType)}
          className="mt-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white font-sans normal-case tracking-normal"
        >
          <option value="bug">{t("roadmap.feedback.type.bug")}</option>
          <option value="suggestion">{t("roadmap.feedback.type.suggestion")}</option>
          <option value="general">{t("roadmap.feedback.type.general")}</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-[10px] font-mono font-bold uppercase tracking-[.22em] text-vantare-textDim">
        {t("roadmap.feedback.message")}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="..."
          className="mt-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white font-sans normal-case tracking-normal resize-none"
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-mono font-bold uppercase tracking-[.22em] text-vantare-textDim">
          {t("roadmap.feedback.destination")}
        </span>
        <div className="flex flex-wrap gap-2">
          {(["github", "discord", "form"] as RoadmapFeedbackDestination[]).map((dest) => (
            <button
              key={dest}
              type="button"
              onClick={() => setDestination(dest)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                destination === dest
                  ? "bg-vantare-red-500 text-white border border-white/10"
                  : "bg-white/5 text-vantare-textMuted border border-white/10 hover:text-white"
              }`}
            >
              {t(`roadmap.feedback.dest.${dest}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!message.trim()}
          onClick={handleSend}
          className="px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-[.18em] bg-gradient-to-br from-vantare-red-500 to-[#9a0606] border border-white/10 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {destination === "github"
            ? t("roadmap.feedback.sendGithub")
            : destination === "discord"
              ? t("roadmap.feedback.sendDiscord")
              : t("roadmap.feedback.sendForm")}
        </button>
      </div>
    </div>
  );
}

type FeaturesSectionProps = {
  t: (key: string) => string;
  locale: string;
  sections: ActiveSections;
  overallProgress: number;
};

function FeatureCard({
  locale,
  feat,
  isExpanded,
  onToggle,
}: {
  locale: string;
  feat: RoadmapFeature;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const tipo = TIPO_META[feat.tipo] ?? TIPO_META.feature;
  const status = STATUS_META[feat.status] ?? STATUS_META.future;
  return (
    <article
      onClick={onToggle}
      className={`rounded-xl p-4 flex flex-col gap-2 transition-all duration-300 cursor-pointer border ${
        feat.status === "future"
          ? "bg-[rgba(20,20,20,.35)] border-white/5 hover:border-white/10 opacity-70"
          : "border-vantare-red-500/50 bg-gradient-to-b from-vantare-red-500/10 to-vantare-red-500/5 hover:shadow-[0_0_20px_rgba(255,59,59,.15)]"
      }`}
      data-testid={`feature-card-${feat.id}`}
      data-status={feat.status}
    >
      <div className="flex items-center gap-2">
        <span className={`text-[10px] ${tipo.color}`}>
          {tipo.icon} {tipo.label}
        </span>
        <span
          className={`inline-block px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-[.22em] ${
            feat.status === "future"
              ? "text-vantare-textDim border border-white/10 bg-white/5"
              : "text-vantare-red-400 border border-vantare-red-500/30 bg-vantare-red-500/10"
          }`}
        >
          {status.label}
        </span>
      </div>
      <h3 className="font-bold text-sm text-white tracking-tight leading-tight">
        {pickText(feat.label, locale)}
      </h3>
      {!isExpanded && pickText(feat.description, locale) && (
        <p className="text-[11px] text-vantare-textMuted leading-relaxed line-clamp-2 flex-1">
          {pickText(feat.description, locale)}
        </p>
      )}
      {isExpanded && (
        <div className="flex flex-col gap-2 mt-1">
          <p className="text-[11px] text-vantare-textMuted leading-relaxed">
            {pickText(feat.description, locale)}
          </p>
          <div className="mt-1 pt-2 border-t border-white/5">
            <span className="text-[9px] font-mono font-bold uppercase tracking-[.22em] text-vantare-textDim block mb-0.5">
              Progreso
            </span>
            <span className="text-sm font-bold text-white">{feat.percent}%</span>
          </div>
        </div>
      )}
      {!isExpanded && (
        <div className="mt-auto pt-1">
          <ProgressBar value={feat.percent} />
          <div className="flex justify-end mt-1">
            <span className="text-[9px] font-mono font-bold text-vantare-red-400">
              {feat.percent}%
            </span>
          </div>
        </div>
      )}
    </article>
  );
}

function SectionBlock({
  locale,
  title,
  categories,
  expandedId,
  onToggle,
}: {
  locale: string;
  title: string;
  categories: ReadonlyArray<RoadmapCategory>;
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  if (categories.length === 0) return null;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="v52-eyebrow">{title}</span>
      </div>
      {categories.map((cat) => (
        <section key={cat.id}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="v52-eyebrow text-vantare-textMuted">
                {pickText(cat.label, locale)}
              </span>
              <span className="text-[10px] font-mono font-bold text-vantare-textDim px-2 py-0.5 rounded bg-white/5">
                {cat.features.length}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-24">
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, cat.percent))}%`,
                      background: "linear-gradient(90deg,#ff3b3b,#ff4d4d)",
                    }}
                  />
                </div>
              </div>
              <span className="text-sm font-bold text-vantare-red-400">
                {cat.percent}%
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {cat.features.map((feat) => (
              <FeatureCard
                key={feat.id}
                locale={locale}
                feat={feat}
                isExpanded={expandedId === feat.id}
                onToggle={() => onToggle(feat.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FeaturesSection({ t, locale, sections, overallProgress }: FeaturesSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggle = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const inDevCount = sections.inDevelopment.reduce(
    (s, c) => s + c.features.length,
    0,
  );
  const researchCount = sections.research.reduce(
    (s, c) => s + c.features.length,
    0,
  );
  const futureCount = sections.future.reduce(
    (s, c) => s + c.features.length,
    0,
  );
  const totalCats =
    sections.inDevelopment.length +
    sections.research.length +
    sections.future.length;

  return (
    <div className="flex flex-col gap-5 opacity-0 animate-fade-in-up delay-100">
      <section className="glass-panel rounded-xl p-6">
        <div className="flex items-end justify-between mb-2">
          <span className="v52-eyebrow">{t("roadmap.features.eyebrow")}</span>
          <span
            className="text-3xl font-bold text-vantare-red-400"
            style={{ textShadow: "0 0 20px rgba(255,59,59,.3)" }}
          >
            {overallProgress}%
          </span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, Math.max(0, overallProgress))}%`,
              background: "linear-gradient(90deg,#ff3b3b,#ff4d4d)",
              boxShadow: "0 0 12px rgba(255,59,59,.4)",
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-[10px] font-mono text-vantare-textDim">
          <span>
            {inDevCount} en desarrollo · {researchCount} en investigación ·{" "}
            {futureCount} próximas
          </span>
          <span>{totalCats} áreas</span>
        </div>
      </section>

      <SectionBlock
        locale={locale}
        title={STATUS_META["in-development"].label}
        categories={sections.inDevelopment}
        expandedId={expandedId}
        onToggle={toggle}
      />

      <SectionBlock
        locale={locale}
        title={STATUS_META.research.label}
        categories={sections.research}
        expandedId={expandedId}
        onToggle={toggle}
      />

      <SectionBlock
        locale={locale}
        title={STATUS_META.future.label}
        categories={sections.future}
        expandedId={expandedId}
        onToggle={toggle}
      />
    </div>
  );
}

export function RoadmapPage() {
  const { t, locale } = useI18n();
  const access = useAccess();
  const canGiveFeedback = canUseFeature(access, "roadmap.feedback");
  const [activeKey, setActiveKey] = useState<"current" | "next">("current");
  const [dataset, setDataset] = useState<RoadmapDataset>(ROADMAP_FALLBACK);

  useEffect(() => {
    const controller = new AbortController();
    fetchRoadmapDataset(controller.signal).then(setDataset).catch(() => {});
    return () => controller.abort();
  }, []);

  const currentPhase = getCurrentPhase(dataset.phases);
  const overallProgress = getOverallProgress(dataset.areas);
  const allPhasesDoneOrActive = dataset.phases.filter(
    (p) => p.status === "done" || p.status === "in-progress",
  ).length;
  const trackWidth = (allPhasesDoneOrActive / dataset.phases.length) * 100;
  // Estado inicial síncrono con FEATURES_FALLBACK (consistente con roadmap-data.ts).
  const [sections, setSections] = useState<ActiveSections>(() => ({
    inDevelopment: [],
    research: [],
    future: [],
  }));
  const [featureOverallProgress, setFeatureOverallProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getActiveSections()
      .then((result) => {
        if (cancelled) return;
        setSections(result.sections);
        setFeatureOverallProgress(result.overallProgress);
      })
      .catch(() => {
        if (cancelled) return;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {/* Dataset toggle */}
      <div className="flex items-center gap-2">
        {(["current", "next"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveKey(key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-[.18em] transition-colors ${
              activeKey === key
                ? "bg-gradient-to-br from-vantare-red-500 to-[#9a0606] text-white border border-white/10"
                : "bg-white/5 text-vantare-textMuted border border-white/10 hover:text-white"
            }`}
          >
            {t(`roadmap.tab.${key}`)}
          </button>
        ))}
      </div>

      {/* Hero */}
      <div className="relative rounded-xl overflow-hidden border border-vantare-red-400/40 opacity-0 animate-fade-in-up">
        <div className="absolute inset-0 bg-gradient-to-br from-vantare-red-400/50 via-[#9a0606]/30 to-[#0a0a0a]" />
        <div className="absolute -right-16 -top-16 w-80 h-80 bg-vantare-red-400/20 blur-3xl rounded-full pointer-events-none" />
        <div className="relative p-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-[.22em] bg-vantare-red-400/15 text-vantare-red-400 border border-vantare-red-400/40">
              {t("roadmap.hero.badge")}
            </span>
            <span className="flex items-center gap-1.5 text-[9px] font-mono font-bold text-vantare-textDim">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 6px rgba(52,211,153,.6)" }} />
              {t("roadmap.hero.updated")}
            </span>
          </div>
          <span className="v52-eyebrow mb-4">{t("roadmap.hero.title")}</span>
          <h1 className="font-sans font-bold text-[clamp(2.5rem,5vw,4.5rem)] text-white tracking-tight leading-[.92] -tracking-[.045em] mt-2">
            {t("roadmap.hero.title")}
          </h1>
          <p className="mt-3 text-base text-vantare-textMuted max-w-2xl leading-relaxed">
            {t("roadmap.hero.subtitle")}
          </p>
          <div className="flex items-center gap-3 mt-5">
            <a
              href={ROADMAP_FEEDBACK_LINKS.github}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-[.18em] bg-gradient-to-br from-vantare-red-500 to-[#9a0606] border border-white/10 text-white hover:opacity-90 transition-opacity"
            >
              {t("roadmap.hero.suggest")}
            </a>
            <a
              href={ROADMAP_CHANGELOG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-[.18em] bg-white/5 border border-white/10 text-vantare-textMuted hover:text-white transition-colors"
            >
              {t("roadmap.hero.changelog")}
            </a>
          </div>
        </div>
      </div>

      {activeKey === "current" && (
        <>
          {/* Current phase highlight */}
          {currentPhase && (
            <section className="relative rounded-xl overflow-hidden border border-vantare-red-500/30 opacity-0 animate-fade-in-up delay-75">
              <div className="absolute inset-0 bg-gradient-to-br from-[#ff3b3b]/20 via-[#9a0606]/10 to-[#0a0a0a]" />
              <div className="absolute -right-20 top-0 w-64 h-64 bg-vantare-red-500/10 blur-3xl rounded-full pointer-events-none" />
              <div className="relative p-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="v52-eyebrow">{t("roadmap.currentPhase.eyebrow")}</span>
                  <StatusBadge status={currentPhase.status} t={t} />
                </div>
                <h2 className="font-bold text-2xl text-white tracking-tight">
                  {pickText(currentPhase.title, locale)}
                </h2>
                <p className="text-sm text-vantare-textMuted mt-1 leading-relaxed">
                  {pickText(currentPhase.summary, locale)}
                </p>
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex-1">
                    <ProgressBar value={currentPhase.progress} color="from-[#ff3b3b] to-[#ff6b6b]" />
                  </div>
                  <span className="text-[10px] font-mono font-bold text-vantare-red-400 shrink-0">
                    {currentPhase.progress}%
                  </span>
                </div>
                <div className="mt-2 text-[10px] font-mono font-bold text-vantare-textDim uppercase tracking-[.22em]">
                  {t("roadmap.phases.range")}
                </div>
              </div>
            </section>
          )}

          {/* Phases grid */}
          <section className="glass-panel rounded-xl p-6 opacity-0 animate-fade-in-up delay-100">
            <div className="flex items-center justify-between mb-6">
              <span className="v52-eyebrow">{t("roadmap.phases.eyebrow")}</span>
              <span className="text-[10px] font-mono font-bold text-vantare-textDim uppercase tracking-[.22em]">{t("roadmap.phases.range")}</span>
            </div>
            <div className="relative h-2 mx-2 mb-12">
              <div className="absolute inset-0 rounded-full bg-white/10" />
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-vantare-red-500 to-vantare-red-400/20"
                style={{ width: `${trackWidth}%` }}
              />
              {dataset.phases.map((phase, i) => {
                const isActive = phase.status === "in-progress";
                const left = `${((i + 0.5) / dataset.phases.length) * 100}%`;
                return (
                  <div key={phase.id} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left }}>
                    <div className={`w-3 h-3 rotate-45 border transition-all duration-500 ${isActive ? "bg-vantare-red-500 border-vantare-red-500 shadow-[0_0_12px_rgba(255,59,59,.6)] w-5 h-5" : "bg-[#0a0a0a] border-white/20"}`} />
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {dataset.phases.map((phase) => {
                const isActive = phase.status === "in-progress";
                return (
                  <article key={phase.id} className={`rounded-xl p-5 flex flex-col gap-3 transition-all duration-300 ${isActive ? "border border-vantare-red-500/50 bg-gradient-to-b from-vantare-red-500/10 to-vantare-red-500/5 shadow-[0_0_0_1px_rgba(255,59,59,.18),0_24px_60px_rgba(255,59,59,.22)]" : "bg-[rgba(20,20,20,.55)] border border-white/5 hover:border-vantare-red-400/40"}`}>
                    <div className="flex items-center gap-2">
                      {isActive ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-vantare-red-500 shadow-[0_0_8px_rgba(255,59,59,.6)]" />
                          <span className="text-[10px] font-mono font-bold uppercase tracking-[.18em] text-vantare-red-400">{t("roadmap.phase.status.current")}</span>
                        </>
                      ) : (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
                          <span className="text-[10px] font-mono font-bold uppercase tracking-[.18em] text-vantare-textDim">{t(`roadmap.status.${phase.status}`)}</span>
                        </>
                      )}
                    </div>
                    <h3 className="font-bold text-lg text-white tracking-tight leading-tight">{pickText(phase.title, locale)}</h3>
                    <p className="text-xs text-vantare-textMuted leading-relaxed flex-1">{pickText(phase.summary, locale)}</p>
                    {phase.highlights.length > 0 && (
                      <ul className="space-y-1">
                        {phase.highlights.map((hk, i) => (
                          <li key={i} className="text-[10px] text-vantare-textMuted flex items-start gap-1.5">
                            <span className="text-vantare-red-400 mt-0.5 shrink-0">•</span>
                            {pickText(hk, locale)}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-auto">
                      <ProgressBar value={phase.progress} color="from-[#ff3b3b] to-[#ff6b6b]" />
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[9px] font-mono font-bold text-vantare-textDim uppercase tracking-[.22em]">{pickText(phase.phaseLabel, locale)}</span>
                        <span className="text-[9px] font-mono font-bold text-vantare-textDim uppercase tracking-[.22em]">{pickText(phase.target, locale)}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* Overall progress + Areas + Milestones + Changelog */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 opacity-0 animate-fade-in-up delay-150">
            <section className="glass-panel rounded-xl p-5">
              <span className="v52-eyebrow">{t("roadmap.progress.eyebrow")}</span>
              <div className="mt-4">
                <div className="flex items-end justify-between mb-2">
                  <span className="text-sm font-bold text-white">{t("roadmap.progress.completed")}</span>
                  <span className="text-3xl font-bold text-vantare-red-400" style={{ textShadow: "0 0 20px rgba(255,59,59,.3)" }}>{overallProgress}%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, overallProgress))}%`, background: "linear-gradient(90deg,#ff3b3b,#ff4d4d)", boxShadow: "0 0 12px rgba(255,59,59,.4)" }} />
                </div>
                <div className="flex items-center justify-between mt-2 text-[10px] font-mono text-vantare-textDim">
                  <span>{t("roadmap.progress.betaActive")}</span>
                  <span>{t("roadmap.progress.goal")}</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-white/5 space-y-2.5">
                {dataset.areas.map((area) => (
                  <div key={area.id}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-vantare-textMuted">{pickText(area.title, locale)}</span>
                      <span className="font-mono font-bold text-white">{area.progress}%</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, area.progress))}%`, background: "linear-gradient(90deg,#ff3b3b,#ff4d4d)" }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="glass-panel rounded-xl p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <span className="v52-eyebrow">{t("roadmap.milestones.eyebrow")}</span>
                <a href={ROADMAP_CHANGELOG_URL} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-vantare-red-400 uppercase tracking-[.22em] hover:text-white transition-colors">{t("roadmap.milestones.all")}</a>
              </div>
              <div className="space-y-2">
                {dataset.milestones.length > 0 ? dataset.milestones.map((ms) => (
                  <div key={ms.id} className="flex items-start gap-3 p-3 rounded-lg bg-[rgba(20,20,20,.5)] border border-white/5">
                    <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-[.22em] shrink-0 mt-0.5 ${MILESTONE_TYPE_COLORS[ms.type]}`}>{pickText(ms.label, locale)}</span>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-white">{pickText(ms.title, locale)}</h4>
                      <p className="text-[11px] text-vantare-textMuted mt-0.5 leading-relaxed">{pickText(ms.body, locale)}</p>
                    </div>
                  </div>
                )) : <p className="text-[11px] text-vantare-textDim">{t("roadmap.milestones.all")}</p>}
              </div>
              <div className="mt-6 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between mb-3">
                  <span className="v52-eyebrow">{t("roadmap.changelog.eyebrow")}</span>
                </div>
                <div className="space-y-2">
                  {ROADMAP_CHANGELOG.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg bg-[rgba(20,20,20,.5)] border border-white/5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-white">{t(entry.titleKey)}</h4>
                          <span className="text-[9px] font-mono font-bold text-vantare-textDim">{entry.version}</span>
                          <span className="text-[9px] font-mono text-vantare-textDim">{entry.date}</span>
                        </div>
                        <p className="text-[11px] text-vantare-textMuted mt-0.5 leading-relaxed">{t(entry.bodyKey)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {/* Features by area (next tab) */}
      {activeKey === "next" && (
        <FeaturesSection
          t={t}
          locale={locale}
          sections={sections}
          overallProgress={featureOverallProgress}
        />
      )}

      {/* Feedback / Voting */}
      <section className="relative rounded-xl p-6 overflow-hidden border border-vantare-red-400/30 opacity-0 animate-fade-in-up delay-250">
        <div className="absolute inset-0 bg-gradient-to-br from-vantare-red-400/10 via-[#9a0606]/15 to-[#0a0a0a]" />
        <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-vantare-red-400/10 blur-3xl rounded-full pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-vantare-red-500 to-[#9a0606] flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
              </svg>
            </div>
            <span className="v52-eyebrow">{t("roadmap.feedback.eyebrow")}</span>
          </div>
          <h3 className="text-xl font-bold text-white tracking-tight mb-2">
            {t("roadmap.feedback.title")}
          </h3>
          <p className="text-sm text-vantare-textMuted leading-relaxed mb-5 max-w-xl">
            {t("roadmap.feedback.body")}
          </p>
          <div className="flex flex-wrap gap-3">
            {!canGiveFeedback ? (
              <span
                role="status"
                data-testid="roadmap-feedback-locked"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-vantare-textMuted"
              >
                <svg className="w-4 h-4 shrink-0 text-vantare-textMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m0 0v2m0-2h2m-2 0H10m9.364-7.364A9 9 0 1112 3a9 9 0 017.364 4.636z" />
                </svg>
                <span>{t("roadmap.feedback.locked")}</span>
              </span>
            ) : (
              <RoadmapFeedback t={t} />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
