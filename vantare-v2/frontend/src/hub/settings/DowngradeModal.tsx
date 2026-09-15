import { useI18n } from "../../i18n/I18nProvider";
import { ConfirmDialog } from "../../ui/orbit/ConfirmDialog";
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
      open
      tone="danger"
      title={t("settings.downgrade.title")}
      cancelLabel={t("settings.downgrade.cancel")}
      confirmLabel={t("settings.downgrade.confirm")}
      onCancel={onCancel}
      onConfirm={onConfirm}
      data-testid="settings-downgrade-overlay"
      body={
        <>
          {t("settings.downgrade.bodyBefore")}{" "}
          <strong className="text-orbit-ink">{release.tag_name}</strong>,{" "}
          {t("settings.downgrade.bodyMiddle")}{" "}
          <strong className="text-orbit-ink">{currentVersion}</strong>.{" "}
          {t("settings.downgrade.bodyAfter")}
        </>
      }
    />
  );
}
