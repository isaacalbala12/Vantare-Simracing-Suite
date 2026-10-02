import { useEffect, useState, useSyncExternalStore } from "react";
import { IconButton } from "../../ui/orbit/IconButton";
import { useI18n } from "../../i18n/I18nProvider";
import { formatMessage } from "../orbit/format-message";
import {
  activateCenterRecord,
  clearCenter,
  getCenterSnapshot,
  markCenterRead,
  requestCenter,
  subscribeCenter,
  type CenterRecord,
} from "./notification-center";

function formatTime(occurredAt: number): string {
  const date = new Date(occurredAt);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * Centro de notificaciones (ISA-901): campana con badge de no leídos y panel
 * de avisos recientes. La lista la guarda el backend (store acotado); la UI
 * solo pinta el snapshot y manda intenciones (read/clear/action).
 *
 * La salida del Spotter no puede aparecer aquí: no existe una fuente
 * "spotter" en la matriz del contrato y el backend rechaza cualquier otra.
 */
export function NotificationCenter() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const snapshot = useSyncExternalStore(subscribeCenter, getCenterSnapshot, getCenterSnapshot);

  // Pedir el snapshot una vez montada la suscripción: cubre el arranque y la
  // reconexión del webview sin perderse lo emitido mientras no había UI.
  useEffect(() => requestCenter(), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const title = (record: CenterRecord) => formatMessage(t(record.titleKey), record.params ?? {});
  const text = (record: CenterRecord) =>
    record.textKey ? formatMessage(t(record.textKey), record.params ?? {}) : "";

  const onRecordClick = (record: CenterRecord) => {
    if (record.unread) markCenterRead(record.id);
    if (record.action) activateCenterRecord(record.id);
  };

  return (
    <div
      className="orbit-notifications"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <span className="orbit-notifications__bell">
        <IconButton
          aria-expanded={open}
          aria-haspopup="dialog"
          icon="i-campana"
          label={t("notifications.center.open")}
          onClick={() => setOpen((value) => !value)}
          size={28}
          tipSide="top"
        />
        {snapshot.unread > 0 ? (
          <span className="orbit-notifications__badge" aria-hidden="true">
            {snapshot.unread > 99 ? "99+" : snapshot.unread}
          </span>
        ) : null}
      </span>
      {open ? (
        <div
          aria-label={t("notifications.center.title")}
          className="orbit-notifications__panel"
          data-testid="orbit-notifications"
          role="dialog"
        >
          <header className="orbit-notifications__head">
            <p className="orbit-notifications__title">{t("notifications.center.title")}</p>
            <div className="orbit-notifications__tools">
              <button
                className="orbit-notifications__tool"
                disabled={snapshot.unread === 0}
                onClick={() => markCenterRead("all")}
                type="button"
              >
                {t("notifications.center.markAllRead")}
              </button>
              <button
                className="orbit-notifications__tool"
                disabled={snapshot.records.length === 0}
                onClick={() => clearCenter()}
                type="button"
              >
                {t("notifications.center.clear")}
              </button>
            </div>
          </header>
          {snapshot.records.length === 0 ? (
            <p className="orbit-notifications__empty">{t("notifications.center.empty")}</p>
          ) : (
            <ul className="orbit-notifications__list">
              {snapshot.records.map((record) => (
                <li key={record.id}>
                  <button
                    className={[
                      "orbit-notifications__record",
                      `orbit-notifications__record--${record.severity}`,
                      record.unread ? "is-unread" : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => onRecordClick(record)}
                    type="button"
                  >
                    <span className="orbit-notifications__dot" aria-hidden="true" />
                    <span className="orbit-notifications__body">
                      <span className="orbit-notifications__record-title">{title(record)}</span>
                      {text(record) ? (
                        <span className="orbit-notifications__text">{text(record)}</span>
                      ) : null}
                      {record.concreteCause ? (
                        <span className="orbit-notifications__cause">{record.concreteCause}</span>
                      ) : null}
                    </span>
                    <span className="orbit-notifications__time">{formatTime(record.occurredAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
