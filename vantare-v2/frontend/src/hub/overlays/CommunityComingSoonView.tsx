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
          className="mb-3 w-fit text-xs font-bold uppercase tracking-wider text-vantare-textMuted hover:text-white cursor-pointer"
        >
          {t("overlays.back")}
        </button>
        <h1 className="font-bold text-3xl text-white tracking-tight">
          {t("overlays.community.title")}
        </h1>
        <p className="text-sm text-vantare-textMuted mt-2 leading-relaxed max-w-3xl">
          {t("overlays.community.lead")}
        </p>
      </header>

      <section className="relative rounded-2xl overflow-hidden border border-white/5 opacity-0 animate-fade-in-up delay-100 flex flex-col items-center justify-center text-center py-16">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#141414] to-[#0a0a0a]"></div>
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[480px] h-[480px] bg-white/[.03] blur-3xl rounded-full pointer-events-none"></div>

        <div className="relative z-10 px-6">
          <span className="hub-eyebrow">{t("overlays.community.eyebrow")}</span>

          <div className="mt-6 mb-6 inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10">
            <svg className="w-10 h-10 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>

          <h2 className="font-bold text-5xl text-white tracking-tight leading-none">
            {t("overlays.community.soon")}
          </h2>
          <p className="text-base text-white/55 mt-4 max-w-md mx-auto leading-relaxed">
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
              <li className="flex items-start gap-2 text-sm text-white/50" key={key}>
                <span className="text-vantare-red-400 mt-0.5 shrink-0">·</span>
                {t(key)}
              </li>
            ))}
          </ul>

          <span className="inline-block mt-8 text-[10px] font-mono font-bold text-white/40 uppercase tracking-[.28em]">
            {t("overlays.community.footer")}
          </span>
        </div>
      </section>
    </div>
  );
}
