import { useEffect, useId, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { Button, Drawer, Field, Input } from "../../ui/orbit";
import type { AppPickedListener, Unsubscribe } from "../launcher/launcher-bridge";
import { useHubSuspendBlocker } from "../hub-suspend-guard";
import "../../styles/orbit-launcher.css";

export type OrbitAddAppDrawerProps = {
  open: boolean;
  onClose(): void;
  /** Guarda la aplicación: el backend deriva id, monograma y disponibilidad. */
  onSubmit(input: { displayName: string; path: string }): void;
  /** Pide al backend que abra el diálogo nativo de fichero. */
  onBrowse(): void;
  /**
   * Suscripción a la respuesta del diálogo nativo. `null` significa que no hay
   * selector detrás: entonces «Examinar…» se deshabilita con su motivo en vez
   * de quedarse como un botón que no hace nada.
   */
  subscribeAppPicked: ((listener: AppPickedListener) => Unsubscribe) | null;
};

/**
 * Alta de una aplicación personalizada.
 *
 * El escaneo solo reconoce el catálogo oficial, así que cualquier otra
 * aplicación entra por aquí: la ruta la elige el diálogo nativo de Wails (el
 * `<input type="file">` del navegador entrega un `File` de su recinto, nunca
 * una ruta lanzable) y el nombre lo escribe el usuario sobre la propuesta que
 * saca el backend del nombre del ejecutable.
 *
 * Cada apertura arranca en blanco porque la pantalla remonta este cajón con una
 * `key` distinta: reiniciar el borrador desde un efecto encadenaba renders y el
 * estado inicial ya dice lo mismo sin ellos.
 */
export function OrbitAddAppDrawer({
  open,
  onClose,
  onSubmit,
  onBrowse,
  subscribeAppPicked,
}: OrbitAddAppDrawerProps) {
  const { t } = useI18n();
  const nameId = useId();
  const pathId = useId();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [browsing, setBrowsing] = useState(false);
  useHubSuspendBlocker(
    "launcher-add-app-draft",
    "Launcher tiene un alta de aplicación sin guardar",
    open && (name.trim() !== "" || path.trim() !== "" || browsing),
  );

  useEffect(() => {
    if (!open || !subscribeAppPicked) return;
    return subscribeAppPicked(({ path: picked, suggestedName }) => {
      setBrowsing(false);
      // Ruta vacía = diálogo cancelado. No es un fallo, pero el formulario
      // tiene que salir de «esperando» igualmente.
      if (!picked) return;
      setPath(picked);
      // El nombre propuesto solo se acepta mientras el usuario no haya escrito
      // el suyo: reescribirlo en cada examinar borraría su trabajo.
      setName((current) => (current.trim() === "" ? (suggestedName ?? "") : current));
    });
  }, [open, subscribeAppPicked]);

  const canBrowse = subscribeAppPicked !== null;
  const canSubmit = name.trim() !== "" && path.trim() !== "";

  return (
    <Drawer
      className="orbit-add-app"
      closeLabel={t("launcher.addApp.close")}
      data-testid="orbit-launcher-add-app"
      footer={
        <>
          <Button data-testid="orbit-launcher-add-app-cancel" onClick={onClose} variant="ghost">
            {t("launcher.addApp.cancel")}
          </Button>
          <Button
            data-testid="orbit-launcher-add-app-submit"
            data-tip={canSubmit ? undefined : t("launcher.addApp.submitBlocked")}
            data-tip-side="top"
            disabled={!canSubmit}
            onClick={() => onSubmit({ displayName: name.trim(), path: path.trim() })}
            variant="primary"
          >
            {t("launcher.addApp.submit")}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={t("launcher.addApp.title")}
    >
      <p className="orbit-add-app__hint">{t("launcher.addApp.hint")}</p>

      <Field htmlFor={pathId} label={t("launcher.addApp.path")}>
        <div className="orbit-add-app__path">
          <Input
            data-testid="orbit-launcher-add-app-path"
            id={pathId}
            onChange={(event) => setPath(event.target.value)}
            placeholder={t("launcher.addApp.pathPlaceholder")}
            value={path}
          />
          <Button
            data-testid="orbit-launcher-add-app-browse"
            data-tip={canBrowse ? undefined : t("launcher.addApp.browseUnavailable")}
            data-tip-side="top"
            disabled={!canBrowse}
            onClick={() => {
              setBrowsing(true);
              onBrowse();
            }}
            variant="ghost"
          >
            {t("launcher.addApp.browse")}
          </Button>
        </div>
      </Field>
      {browsing ? (
        <p
          className="orbit-add-app__browsing"
          data-testid="orbit-launcher-add-app-browsing"
          role="status"
        >
          {t("launcher.addApp.browsing")}
        </p>
      ) : null}

      <Field htmlFor={nameId} label={t("launcher.addApp.name")}>
        <Input
          data-testid="orbit-launcher-add-app-name"
          id={nameId}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("launcher.addApp.namePlaceholder")}
          value={name}
        />
      </Field>
    </Drawer>
  );
}
