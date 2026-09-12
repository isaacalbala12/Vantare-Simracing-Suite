import type { RecommendedProfile } from "./recommended-profiles";
import { ProfilePreview } from "./ProfilePreview";
import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../ui/orbit/Button";
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
          className="mb-3 text-xs font-bold uppercase tracking-wider text-orbit-ink-3 hover:text-orbit-ink cursor-pointer"
        >
          {t("overlays.back")}
        </button>
        <h1 className="font-display text-3xl font-bold text-orbit-ink">
          {t("overlays.recommended.title")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-orbit-ink-2">
          {t("overlays.recommended.lead")}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {profiles.map((profile) => (
          <article
            key={profile.id}
            className="rounded-orbit border border-orbit-line bg-orbit-surface-1 p-5"
          >
            <ProfilePreview profile={profile.profile} />
            <div className="mt-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-orbit-coral">
                {profile.tag} · {t("overlays.recommended.presetTag")}
              </p>
              <h2 className="mt-2 font-display text-xl font-semibold text-orbit-ink">{profile.name}</h2>
              <p className="mt-2 text-sm leading-6 text-orbit-ink-2">
                {t(profile.descriptionKey)}
              </p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-orbit-ink-3">
                {formatMessage(t("overlays.recommended.widgetsIncluded"), {
                  count: profile.profile.widgets.length,
                })}
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              data-testid={ctaTestId}
              aria-label={formatMessage(t("overlays.recommended.saveAria"), {
                name: profile.name,
              })}
              onClick={() => onSaveRecommended(profile)}
              className="mt-4 w-full"
            >
              {ctaLabel}
            </Button>
          </article>
        ))}
      </div>
    </div>
  );
}
