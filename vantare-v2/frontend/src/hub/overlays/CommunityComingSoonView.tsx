import { useI18n } from "../../i18n/I18nProvider";

type CommunityComingSoonViewProps = {
  onBack: () => void;
};

export function CommunityComingSoonView({ onBack }: CommunityComingSoonViewProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-5">
      <header className="opacity-0 animate-fade-in-up">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 w-fit text-xs font-bold uppercase tracking-wider text-orbit-ink-3 hover:text-orbit-ink cursor-pointer"
        >
          {t("overlays.back")}
        </button>
        <h1 className="font-bold text-3xl text-orbit-ink tracking-tight">
          {t("overlays.community.title")}
        </h1>
        <p className="text-sm text-orbit-ink-2 mt-2 leading-relaxed max-w-3xl">
          {t("overlays.community.lead")}
        </p>
      </header>

      <section className="relative rounded-orbit overflow-hidden border border-orbit-line opacity-0 animate-fade-in-up delay-100 flex flex-col items-center justify-center text-center py-16">
        <div className="absolute inset-0 bg-orbit-surface-1"></div>
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[480px] h-[480px] bg-white/[.03] blur-3xl rounded-full pointer-events-none"></div>

        <div className="relative z-10 px-6">
          <span className="text-xs font-bold uppercase tracking-[.3em] text-orbit-coral">
            {t("overlays.community.eyebrow")}
          </span>

          <div className="mt-6 mb-6 inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-orbit-surface-2 border border-orbit-line">
            <svg className="w-10 h-10 text-orbit-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>

          <h2 className="font-bold text-5xl text-orbit-ink tracking-tight leading-none">
            {t("overlays.community.soon")}
          </h2>
          <p className="text-base text-orbit-ink-2 mt-4 max-w-md mx-auto leading-relaxed">
            {t("overlays.community.body")}
          </p>

          <ul className="mt-8 flex flex-col gap-2 max-w-xs mx-auto text-left">
            {(
              [
                "overlays.community.bullet1",
                "overlays.community.bullet2",
                "overlays.community.bullet3",
              ] as const
            ).map((key) => (
              <li className="flex items-start gap-2 text-sm text-orbit-ink-3" key={key}>
                <span className="text-orbit-coral mt-0.5 shrink-0">·</span>
                {t(key)}
              </li>
            ))}
          </ul>

          <span className="inline-block mt-8 text-[10px] font-mono font-bold text-orbit-ink-3 uppercase tracking-[.28em]">
            {t("overlays.community.footer")}
          </span>
        </div>
      </section>
    </div>
  );
}
