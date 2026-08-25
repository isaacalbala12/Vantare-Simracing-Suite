import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import {
  addWallpaper,
  MAX_WALLPAPERS,
  removeWallpaper,
  wallpaperBackgroundId,
  wallpaperIdOf,
  WallpaperQuotaError,
} from "../canvas/studio-wallpapers";
import { useWallpapers } from "../canvas/use-wallpapers";
import { importWallpaperFile, WallpaperImportError } from "../canvas/wallpaper-import";
import { fill } from "./studio-orbit-model";

const ERROR_KEY_BY_REASON = {
  type: "studio.toolbar.wallpaper.errorType",
  size: "studio.toolbar.wallpaper.errorSize",
  decode: "studio.toolbar.wallpaper.errorDecode",
} as const;

export type StudioWallpaperPickerProps = {
  /** Fondo activo del lienzo; puede ser uno de fabrica. */
  backgroundId: string;
  onSelect(backgroundId: string): void;
  /** Fondo al que volver cuando se borra el que estaba puesto. */
  fallbackBackgroundId: string;
};

/**
 * Biblioteca de fondos propios de la toolbar (`06 § Overlays Studio`).
 *
 * Vive fuera del `Seg` de fondos de fabrica a proposito: los tres de fabrica
 * son una eleccion entre iguales y esto es un cajon que crece. El boton queda
 * encendido mientras el lienzo pinta una imagen del usuario.
 */
export function StudioWallpaperPicker(props: StudioWallpaperPickerProps): React.ReactElement {
  const { backgroundId, onSelect, fallbackBackgroundId } = props;
  const { t } = useI18n();
  const wallpapers = useWallpapers();
  const activeId = wallpaperIdOf(backgroundId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  // Mismo contrato de cierre que el `Menu` del kit: clic fuera y `Esc`.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setBusy(true);
      setError(null);
      let lastAdded: string | null = null;
      for (const file of Array.from(files)) {
        try {
          const wallpaper = await importWallpaperFile(file);
          addWallpaper(wallpaper);
          lastAdded = wallpaper.id;
        } catch (cause) {
          if (cause instanceof WallpaperImportError) {
            setError(t(ERROR_KEY_BY_REASON[cause.reason]));
          } else if (cause instanceof WallpaperQuotaError) {
            setError(t("studio.toolbar.wallpaper.errorQuota"));
          } else {
            setError(t("studio.toolbar.wallpaper.errorDecode"));
          }
          break;
        }
      }
      setBusy(false);
      // Anadir un fondo es pedir verlo: el ultimo importado pasa al lienzo.
      if (lastAdded) onSelect(wallpaperBackgroundId(lastAdded));
    },
    [onSelect, t],
  );

  const handleRemove = useCallback(
    (id: string) => {
      removeWallpaper(id);
      if (activeId === id) onSelect(fallbackBackgroundId);
    },
    [activeId, fallbackBackgroundId, onSelect],
  );

  return (
    <div className="orbit-studio-wallpapers" ref={wrapRef}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t("studio.toolbar.wallpaper")}
        className={["orbit-icon-btn", "orbit-icon-btn--39", activeId ? "is-on" : null]
          .filter(Boolean)
          .join(" ")}
        data-testid="orbit-studio-wallpaper-trigger"
        data-tip={t("studio.toolbar.wallpaper")}
        data-tip-side="top"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <svg
          aria-hidden="true"
          fill="none"
          focusable="false"
          height={16}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.4}
          viewBox="0 0 16 16"
          width={16}
        >
          <rect height="10" rx="1.6" width="12.4" x="1.8" y="3" />
          <path d="M1.8 10.4 5.3 7.3l2.6 2.3 2.3-1.9 4 3.3" />
          <circle cx="5.6" cy="6" r="1" />
        </svg>
      </button>

      {open ? (
        <div
          aria-label={t("studio.toolbar.wallpaper.title")}
          className="orbit-studio-wallpapers__panel"
          data-testid="orbit-studio-wallpaper-panel"
          id={panelId}
          role="dialog"
        >
          <p className="orbit-studio-wallpapers__title">{t("studio.toolbar.wallpaper.title")}</p>

          {wallpapers.length === 0 ? (
            <p className="orbit-studio-wallpapers__empty">
              {t("studio.toolbar.wallpaper.empty")}
            </p>
          ) : (
            <ul className="orbit-studio-wallpapers__grid">
              {wallpapers.map((wallpaper) => (
                <li key={wallpaper.id}>
                  <button
                    aria-pressed={activeId === wallpaper.id}
                    className="orbit-studio-wallpapers__item"
                    data-testid={`orbit-studio-wallpaper-${wallpaper.id}`}
                    onClick={() => onSelect(wallpaperBackgroundId(wallpaper.id))}
                    style={{ backgroundImage: `url("${wallpaper.dataUrl}")` }}
                    type="button"
                  >
                    <span>{wallpaper.name}</span>
                  </button>
                  <button
                    aria-label={fill(t("studio.toolbar.wallpaper.remove"), {
                      name: wallpaper.name,
                    })}
                    className="orbit-studio-wallpapers__remove"
                    data-testid={`orbit-studio-wallpaper-remove-${wallpaper.id}`}
                    onClick={() => handleRemove(wallpaper.id)}
                    type="button"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            className="orbit-btn orbit-btn--ghost orbit-btn--sm"
            data-testid="orbit-studio-wallpaper-add"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {busy ? t("studio.toolbar.wallpaper.adding") : t("studio.toolbar.wallpaper.add")}
          </button>

          <p className="orbit-studio-wallpapers__hint">
            {fill(t("studio.toolbar.wallpaper.hint"), { n: MAX_WALLPAPERS })}
          </p>

          {error ? (
            <p className="orbit-studio-wallpapers__error" data-testid="orbit-studio-wallpaper-error">
              {error}
            </p>
          ) : null}

          <input
            accept="image/*"
            aria-hidden="true"
            className="orbit-studio-wallpapers__input"
            data-testid="orbit-studio-wallpaper-input"
            multiple
            onChange={(event) => {
              // El input se vacia al terminar para que reelegir el mismo
              // fichero vuelva a disparar `change`.
              const input = event.currentTarget;
              void handleFiles(input.files).finally(() => {
                input.value = "";
              });
            }}
            ref={inputRef}
            tabIndex={-1}
            type="file"
          />
        </div>
      ) : null}
    </div>
  );
}
