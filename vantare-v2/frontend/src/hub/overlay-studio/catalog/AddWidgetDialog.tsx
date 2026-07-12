import type { AccessContext } from "../../../lib/access-policy";
import { useI18n } from "../../../i18n/I18nProvider";
import type { CoreWidgetType } from "../../../overlay/core/profile-document";
import {
  canAddCatalogEntry,
  deriveStudioCatalog,
  getCatalogAddGate,
  type StudioCatalogEntry,
} from "./studio-catalog";

export type AddWidgetDialogProps = {
  open: boolean;
  access: AccessContext;
  catalog?: readonly StudioCatalogEntry[];
  onClose(): void;
  onAdd(type: CoreWidgetType): void;
};

function lockMessage(entry: StudioCatalogEntry, access: AccessContext, t: (key: string) => string): string {
  const gate = getCatalogAddGate(access, entry);
  if (gate.reason === "blocked-license") {
    return t("studio.v3.catalog.lock.blockedLicense");
  }
  if (entry.requiredFeature === "overlays.advanced") {
    return t("studio.v3.catalog.lock.advancedOverlays");
  }
  return t("studio.v3.catalog.lock.generic");
}

export function AddWidgetDialog(props: AddWidgetDialogProps): React.ReactElement | null {
  const { open, access, catalog = deriveStudioCatalog(), onClose, onAdd } = props;
  const { t } = useI18n();
  if (!open) {
    return null;
  }

  return (
    <div
      className="osv3-dialog-backdrop"
      data-testid="studio-add-widget-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-add-widget-dialog-title"
    >
      <div className="osv3-dialog-panel osv3-catalog-dialog">
        <h2 id="studio-add-widget-dialog-title" className="osv3-dialog-panel__title">
          {t("studio.v3.catalog.title")}
        </h2>
        <p className="osv3-dialog-panel__body">
          {t("studio.v3.catalog.description")}
        </p>
        <div className="osv3-catalog-dialog__list">
          {catalog.map((entry) => {
            const canAdd = canAddCatalogEntry(access, entry);
            return (
              <div
                key={entry.type}
                className="osv3-catalog-dialog__entry"
                data-testid={`studio-catalog-entry-${entry.type}`}
              >
                <div className="osv3-catalog-dialog__entry-main">
                  <span className="osv3-catalog-dialog__entry-type">{entry.type}</span>
                  <span className="osv3-catalog-dialog__entry-meta">
                    {t("studio.v3.catalog.entryMeta")
                      .replace("{width}", String(entry.defaultSize.width))
                      .replace("{height}", String(entry.defaultSize.height))
                      .replace("{count}", String(entry.compatibleSystems.length))}
                  </span>
                </div>
                {canAdd ? (
                  <button
                    type="button"
                    data-testid={`studio-catalog-add-${entry.type}`}
                    className="osv3-dialog-panel__button osv3-dialog-panel__button--primary"
                    onClick={() => onAdd(entry.type)}
                  >
                    {t("studio.v3.catalog.add")}
                  </button>
                ) : (
                  <div className="osv3-catalog-dialog__locked" data-testid={`studio-catalog-lock-${entry.type}`}>
                    <span className="osv3-catalog-dialog__lock-label">{t("studio.v3.catalog.locked")}</span>
                    <span className="osv3-catalog-dialog__lock-hint">{lockMessage(entry, access, t)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="osv3-dialog-panel__actions">
          <button
            type="button"
            data-testid="studio-add-widget-cancel"
            className="osv3-dialog-panel__button"
            onClick={onClose}
          >
            {t("studio.v3.catalog.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
