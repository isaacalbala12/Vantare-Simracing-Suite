import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useI18n } from "../../i18n/I18nProvider";
import type { Release } from "./settings-contract";

type DowngradeModalProps = {
  release: Release;
  currentVersion: string | undefined;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Downgrade confirmation.
 *
 * The page used to draw this by hand with a bare `fixed inset-0`, which meant
 * it rendered inside the settings layout, had no escape hatch other than the
 * Cancel button and appeared without transition. AddNonSteamGameModal and
 * LauncherScanProgress already share a portal + motion pattern; this one now
 * follows it, so a modal behaves the same wherever it comes from.
 */
export function DowngradeModal({
  release,
  currentVersion,
  onCancel,
  onConfirm,
}: DowngradeModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[9000] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
        data-testid="settings-downgrade-overlay"
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-label={t("settings.downgrade.title")}
          className="card-sleek w-[min(28rem,calc(100vw-3rem))] rounded-xl p-6"
        >
          <h3 className="font-display font-semibold text-lg text-white mb-2">
            {t("settings.downgrade.title")}
          </h3>
          <p className="text-sm text-vantare-textMuted mb-4">
            {t("settings.downgrade.bodyBefore")}{" "}
            <strong className="text-white">{release.tag_name}</strong>,{" "}
            {t("settings.downgrade.bodyMiddle")}{" "}
            <strong className="text-white">{currentVersion}</strong>.{" "}
            {t("settings.downgrade.bodyAfter")}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-xs text-vantare-textMuted hover:text-white transition-colors"
            >
              {t("settings.downgrade.cancel")}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-vantare-red-700 to-vantare-burgundy hover:from-vantare-red-600 hover:to-vantare-burgundy transition-all"
            >
              {t("settings.downgrade.confirm")}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
