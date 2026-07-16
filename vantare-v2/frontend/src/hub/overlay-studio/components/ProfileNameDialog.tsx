import { useEffect, useRef, useState } from "react";

export type ProfileNameDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  defaultName?: string;
  confirmLabel?: string;
  placeholder?: string;
  saving?: boolean;
  errorMessage?: string | null;
  dialogTestId?: string;
  onClose(): void;
  onConfirm(name: string): void;
};

export function ProfileNameDialog(props: ProfileNameDialogProps): React.ReactElement | null {
  const {
    open,
    title,
    description,
    defaultName = "",
    confirmLabel = "Guardar",
    placeholder = "Mi overlay",
    saving = false,
    errorMessage,
    dialogTestId = "studio-profile-name-dialog",
    onClose,
    onConfirm,
  } = props;

  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setName(defaultName);
      return;
    }
    setName(defaultName);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [defaultName, open]);

  if (!open) {
    return null;
  }

  const trimmedName = name.trim();
  const canConfirm = trimmedName.length > 0 && !saving;

  return (
    <div
      className="osv3-dialog-backdrop"
      data-testid={dialogTestId}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${dialogTestId}-title`}
    >
      <div className="osv3-dialog-panel osv3-design-dialog">
        <h2 id={`${dialogTestId}-title`} className="osv3-dialog-panel__title">
          {title}
        </h2>
        {description ? (
          <p className="osv3-dialog-panel__body">{description}</p>
        ) : null}
        <label className="osv3-design-dialog__field">
          <span className="osv3-design-dialog__label">Nombre</span>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canConfirm) {
                event.preventDefault();
                onConfirm(trimmedName);
              }
              if (event.key === "Escape" && !saving) {
                event.preventDefault();
                onClose();
              }
            }}
            data-testid={`${dialogTestId}-input`}
            className="osv3-design-dialog__input"
            placeholder={placeholder}
            disabled={saving}
          />
        </label>
        {errorMessage ? (
          <p data-testid={`${dialogTestId}-error`} className="osv3-dialog-panel__error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className="osv3-dialog-panel__actions">
          <button
            type="button"
            data-testid={`${dialogTestId}-cancel`}
            className="osv3-dialog-panel__button"
            disabled={saving}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid={`${dialogTestId}-confirm`}
            className="osv3-dialog-panel__button osv3-dialog-panel__button--primary"
            disabled={!canConfirm}
            onClick={() => onConfirm(trimmedName)}
          >
            {saving ? "Guardando..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}