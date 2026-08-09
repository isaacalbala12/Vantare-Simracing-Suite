import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

type ConfirmDialogProps = {
  title: string;
  children: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  testId?: string;
};

/**
 * A confirmation, in a portal, dismissable with Escape.
 *
 * Settings had grown one hand-rolled `fixed inset-0` per question, each with
 * the Cancel button as its only exit. This is the shape they all share, so a
 * new one cannot arrive missing the keyboard escape or the transition.
 */
export function ConfirmDialog({
  title,
  children,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  testId,
}: ConfirmDialogProps) {
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
        data-testid={testId}
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="card-sleek w-[min(28rem,calc(100vw-3rem))] rounded-xl p-6"
        >
          <h3 className="font-display font-semibold text-lg text-white mb-2">{title}</h3>
          <div className="text-sm text-vantare-textMuted mb-4">{children}</div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-xs text-vantare-textMuted hover:text-white transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-vantare-red-700 to-vantare-burgundy hover:from-vantare-red-600 hover:to-vantare-burgundy transition-all"
            >
              {confirmLabel}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
