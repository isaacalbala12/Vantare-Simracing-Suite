import type { RecommendedProfile } from "./recommended-profiles";
import { ProfilePreview } from "./ProfilePreview";
import { useI18n } from "../../i18n/I18nProvider";
import { formatMessage } from "../orbit/format-message";

type RecommendedProfilesViewProps = {
  profiles: RecommendedProfile[];
  onSaveRecommended: (profile: RecommendedProfile) => void;
  onBack: () => void;
  autoActivateAndStart?: boolean;
};

export function RecommendedProfilesView({
  profiles,
  onSaveRecommended,
  onBack,
  autoActivateAndStart = false,
}: RecommendedProfilesViewProps) {
  const { t } = useI18n();
  const ctaLabel = autoActivateAndStart
    ? t("overlays.recommended.saveAsOverlay")
    : t("overlays.recommended.saveAsProfile");
  const ctaTestId = autoActivateAndStart ? "recommended-save-as-own" : undefined;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[1800px] flex-col px-6 py-8">
      <div className="mb-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 text-xs font-bold uppercase tracking-wider text-vantare-textMuted hover:text-white cursor-pointer"
        >
          {t("overlays.back")}
        </button>
        <h1 className="font-display text-3xl font-bold text-white">
          {t("overlays.recommended.title")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-vantare-textMuted">
          {t("overlays.recommended.lead")}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {profiles.map((profile) => (
          <article key={profile.id} className="card-sleek rounded-xl p-5">
            <ProfilePreview profile={profile.profile} />
            <div className="mt-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-vantare-red-300">
                {profile.tag} · {t("overlays.recommended.presetTag")}
              </p>
              <h2 className="mt-2 font-display text-xl font-semibold text-white">{profile.name}</h2>
              <p className="mt-2 text-sm leading-6 text-vantare-textMuted">
                {t(profile.descriptionKey)}
              </p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-vantare-textDim">
                {formatMessage(t("overlays.recommended.widgetsIncluded"), {
                  count: profile.profile.widgets.length,
                })}
              </p>
            </div>
            <button
              type="button"
              data-testid={ctaTestId}
              aria-label={formatMessage(t("overlays.recommended.saveAria"), {
                name: profile.name,
              })}
              onClick={() => onSaveRecommended(profile)}
              className="btn-primary mt-4 w-full rounded-lg px-4 py-2 text-xs font-bold text-white"
            >
              {ctaLabel}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
