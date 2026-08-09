import { useI18n } from "../../i18n/I18nProvider";
import { ConfirmDialog } from "./ConfirmDialog";
import type { Release } from "./settings-contract";

type DowngradeModalProps = {
  release: Release;
  currentVersion: string | undefined;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Downgrade confirmation. */
export function DowngradeModal({
  release,
  currentVersion,
  onCancel,
  onConfirm,
}: DowngradeModalProps) {
  const { t } = useI18n();

  return (
    <ConfirmDialog
      title={t("settings.downgrade.title")}
      cancelLabel={t("settings.downgrade.cancel")}
      confirmLabel={t("settings.downgrade.confirm")}
      onCancel={onCancel}
      onConfirm={onConfirm}
      testId="settings-downgrade-overlay"
    >
      {t("settings.downgrade.bodyBefore")}{" "}
      <strong className="text-white">{release.tag_name}</strong>,{" "}
      {t("settings.downgrade.bodyMiddle")}{" "}
      <strong className="text-white">{currentVersion}</strong>.{" "}
      {t("settings.downgrade.bodyAfter")}
    </ConfirmDialog>
  );
}
