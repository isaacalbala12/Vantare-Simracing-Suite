import type { AccessContext } from "../../../lib/access-policy";
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

function lockMessage(entry: StudioCatalogEntry, access: AccessContext): string {
  const gate = getCatalogAddGate(access, entry);
  if (gate.reason === "blocked-license") {
    return "Licencia bloqueada. Renueva tu acceso para añadir este widget.";
  }
  if (entry.requiredFeature === "overlays.advanced") {
    return "Requiere licencia Overlays avanzados. Puedes previsualizarlo en el lienzo.";
  }
  return "Requiere una licencia superior para añadir este widget.";
}

export function AddWidgetDialog(props: AddWidgetDialogProps): React.ReactElement | null {
  const { open, access, catalog = deriveStudioCatalog(), onClose, onAdd } = props;
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
          Añadir widget
        </h2>
        <p className="osv3-dialog-panel__body">
          El catálogo se deriva del registro V3. Los widgets premium siguen visibles para previsualizar.
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
                    {entry.defaultSize.width}×{entry.defaultSize.height} · {entry.compatibleSystems.length} sistemas
                  </span>
                </div>
                {canAdd ? (
                  <button
                    type="button"
                    data-testid={`studio-catalog-add-${entry.type}`}
                    className="osv3-dialog-panel__button osv3-dialog-panel__button--primary"
                    onClick={() => onAdd(entry.type)}
                  >
                    Añadir
                  </button>
                ) : (
                  <div className="osv3-catalog-dialog__locked" data-testid={`studio-catalog-lock-${entry.type}`}>
                    <span className="osv3-catalog-dialog__lock-label">Bloqueado</span>
                    <span className="osv3-catalog-dialog__lock-hint">{lockMessage(entry, access)}</span>
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
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}