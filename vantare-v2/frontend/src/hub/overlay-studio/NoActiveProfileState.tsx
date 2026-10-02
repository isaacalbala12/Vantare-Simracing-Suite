import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../ui/orbit/Button";
import "../../styles/orbit.tokens.css";
import "../../styles/orbit-kit.css";

export type NoActiveProfileStateProps = {
  onCreateProfile: () => void;
  onSelectProfile: () => void;
  onOpenRecommended: () => void;
};

export function NoActiveProfileState(props: NoActiveProfileStateProps): React.ReactElement {
  const { onCreateProfile, onSelectProfile, onOpenRecommended } = props;
  const { t } = useI18n();

  return (
    <div
      data-testid="no-active-profile-state"
      className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[720px] flex-col items-center justify-center gap-6 px-6 py-12 text-center"
    >
      <div>
        <h1 className="text-2xl font-semibold text-orbit-ink">{t("studio.v3.empty.title")}</h1>
        <p className="mt-2 text-sm text-orbit-ink-2">
          {t("studio.v3.empty.description")}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="primary" onClick={onCreateProfile}>
          {t("studio.v3.empty.createProfile")}
        </Button>
        <Button variant="ghost" onClick={onSelectProfile}>
          {t("studio.v3.empty.selectProfile")}
        </Button>
        <Button variant="ghost" onClick={onOpenRecommended}>
          {t("studio.v3.empty.viewRecommended")}
        </Button>
      </div>
    </div>
  );
}
