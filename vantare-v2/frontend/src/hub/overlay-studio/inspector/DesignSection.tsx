import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccessContext } from "../../../lib/access-policy";
import {
  listOfficialDesigns,
  OFFICIAL_DESIGNS_SECTION_LABEL,
} from "../../../overlay/design-systems/official-designs";
import type { SessionLayoutType, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { WidgetDesignV1 } from "../../../overlay/core/widget-design";
import { getStudioMutationGate } from "../access/studio-access";
import { SaveDesignDialog } from "../designs/SaveDesignDialog";
import {
  buildUserDesignFromWidget,
  isActiveDesign,
  isDesignCompatibleWithWidget,
  partitionApplyAllTargets,
} from "../designs/design-utils";
import type { WidgetDesignClient } from "../designs/widget-design-client";
import type { StudioCommand } from "../state/studio-command";

export type DesignSectionProps = {
  widget: WidgetInstanceV3;
  session: SessionLayoutType;
  widgets: readonly WidgetInstanceV3[];
  access: AccessContext;
  dispatch(command: StudioCommand): void;
  designClient: WidgetDesignClient;
  confirmApplyAll?: (message: string) => boolean;
  confirmDelete?: (message: string) => boolean;
  promptRename?: (currentName: string) => string | null;
};

function designLockMessage(design: WidgetDesignV1): string {
  if (design.requiredFeature === "overlays.advanced") {
    return "Requiere licencia Overlays avanzados.";
  }
  return "No tienes acceso para aplicar este diseño.";
}

export function DesignSection(props: DesignSectionProps): React.ReactElement {
  const {
    widget,
    session,
    widgets,
    access,
    dispatch,
    designClient,
    confirmApplyAll = (message) => window.confirm(message),
    confirmDelete = (message) => window.confirm(message),
    promptRename = (currentName) => window.prompt("Nuevo nombre del diseño", currentName),
  } = props;

  const [userDesigns, setUserDesigns] = useState<WidgetDesignV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [busyDesignId, setBusyDesignId] = useState<string | null>(null);

  const refreshUserDesigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const designs = await designClient.list(widget.type);
      setUserDesigns(designs.filter((design) => design.origin === "user"));
    } catch (refreshError) {
      const message =
        refreshError instanceof Error ? refreshError.message : "No se pudieron cargar los diseños guardados.";
      setError(message);
      setUserDesigns([]);
    } finally {
      setLoading(false);
    }
  }, [designClient, widget.type]);

  useEffect(() => {
    void refreshUserDesigns();
  }, [refreshUserDesigns]);

  const officialDesigns = useMemo(
    () => listOfficialDesigns(widget.type).filter((design) => isDesignCompatibleWithWidget(design, widget)),
    [widget],
  );
  const compatibleUserDesigns = useMemo(
    () => userDesigns.filter((design) => isDesignCompatibleWithWidget(design, widget)),
    [userDesigns, widget],
  );

  const canApply = getStudioMutationGate({ access, mutation: "apply-design", widget }).allowed;
  const canApplyAll = getStudioMutationGate({ access, mutation: "apply-all", widget }).allowed;
  const canSave = canApply;

  const applyDesign = (design: WidgetDesignV1, widgetIds: readonly string[]) => {
    const gate = getStudioMutationGate({ access, mutation: "apply-design", widget, design });
    if (!gate.allowed) {
      return;
    }
    dispatch({
      type: "widget/apply-design",
      session,
      widgetIds,
      design,
      appliedAt: new Date().toISOString(),
    });
  };

  const handleApply = (design: WidgetDesignV1) => {
    if (!canApply) {
      return;
    }
    applyDesign(design, [widget.id]);
  };

  const handleApplyAllRequest = (design: WidgetDesignV1) => {
    if (!canApplyAll) {
      return;
    }
    const { compatibleIds, skippedCount } = partitionApplyAllTargets(widgets, design);
    if (compatibleIds.length === 0) {
      return;
    }
    const message = `Aplicar "${design.name}" a ${compatibleIds.length} widget(s) compatible(s) en esta sesión${
      skippedCount > 0 ? ` (${skippedCount} omitido(s) por incompatibilidad)` : ""
    }.`;
    if (confirmApplyAll(message)) {
      applyDesign(design, compatibleIds);
    }
  };

  const handleSaveDesign = async (input: { name: string; includesContent: boolean }) => {
    if (!canSave) {
      return;
    }
    const draft = buildUserDesignFromWidget(widget, {
      id: "",
      name: input.name,
      includesContent: input.includesContent,
    });
    setBusyDesignId("save");
    setError(null);
    try {
      const saved = await designClient.save(draft);
      setUserDesigns((current) => {
        const without = current.filter((design) => design.id !== saved.id);
        return [...without, saved];
      });
      setSaveOpen(false);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "No se pudo guardar el diseño.";
      setError(message);
    } finally {
      setBusyDesignId(null);
    }
  };

  const handleDelete = async (design: WidgetDesignV1) => {
    if (!canSave || !confirmDelete(`¿Eliminar el diseño "${design.name}"?`)) {
      return;
    }
    setBusyDesignId(design.id);
    setError(null);
    try {
      await designClient.delete(design.id);
      setUserDesigns((current) => current.filter((entry) => entry.id !== design.id));
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el diseño.";
      setError(message);
    } finally {
      setBusyDesignId(null);
    }
  };

  const handleRename = async (design: WidgetDesignV1) => {
    if (!canSave) {
      return;
    }
    const nextName = promptRename(design.name)?.trim();
    if (!nextName || nextName === design.name) {
      return;
    }
    setBusyDesignId(design.id);
    setError(null);
    try {
      await designClient.rename(design.id, nextName);
      setUserDesigns((current) =>
        current.map((entry) => (entry.id === design.id ? { ...entry, name: nextName } : entry)),
      );
    } catch (renameError) {
      const message = renameError instanceof Error ? renameError.message : "No se pudo renombrar el diseño.";
      setError(message);
    } finally {
      setBusyDesignId(null);
    }
  };

  const renderDesignRow = (design: WidgetDesignV1, section: "official" | "user") => {
    const active = isActiveDesign(widget, design);
    const gate = getStudioMutationGate({ access, mutation: "apply-design", widget, design });
    const locked = !gate.allowed;
    const sameTypeCount = widgets.filter((entry) => entry.type === design.widgetType).length;
    const { compatibleIds } = partitionApplyAllTargets(widgets, design);
    const showApplyAll = sameTypeCount > 1 && compatibleIds.length > 1 && canApplyAll && !locked;

    return (
      <li
        key={`${section}-${design.id}`}
        className="osv3-design-list__item"
        data-testid={`studio-design-item-${design.id}`}
        data-design-origin={design.origin}
        data-design-active={active ? "true" : "false"}
      >
        <div className="osv3-design-list__meta">
          <span className="osv3-design-list__name">{design.name}</span>
          <span className="osv3-design-list__system">{design.systemId}</span>
        </div>
        {active ? (
          <span className="osv3-design-list__active" data-testid={`studio-design-active-${design.id}`}>
            Activo
          </span>
        ) : locked ? (
          <span className="osv3-design-list__lock" data-testid={`studio-design-lock-${design.id}`}>
            {designLockMessage(design)}
          </span>
        ) : (
          <div className="osv3-design-list__actions">
            <button
              type="button"
              data-testid={`studio-design-apply-${design.id}`}
              disabled={busyDesignId !== null}
              onClick={() => handleApply(design)}
            >
              Aplicar
            </button>
            {showApplyAll ? (
              <button
                type="button"
                data-testid={`studio-design-apply-all-${design.id}`}
                disabled={busyDesignId !== null}
                onClick={() => handleApplyAllRequest(design)}
              >
                A todos
              </button>
            ) : null}
          </div>
        )}
        {section === "user" && canSave ? (
          <div className="osv3-design-list__manage">
            <button
              type="button"
              data-testid={`studio-design-rename-${design.id}`}
              disabled={busyDesignId === design.id}
              onClick={() => void handleRename(design)}
            >
              Renombrar
            </button>
            <button
              type="button"
              data-testid={`studio-design-delete-${design.id}`}
              disabled={busyDesignId === design.id}
              onClick={() => void handleDelete(design)}
            >
              Eliminar
            </button>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div data-testid="studio-inspector-section-design" data-widget-id={widget.id}>
      {!canApply ? (
        <p className="osv3-inspector-field__hint osv3-design-section__lock" data-testid="studio-design-access-lock">
          No tienes acceso para aplicar diseños en este widget.
        </p>
      ) : null}
      {error ? (
        <p className="osv3-dialog-panel__error" data-testid="studio-design-error">
          {error}
        </p>
      ) : null}

      <section className="osv3-design-section" data-testid="studio-design-official-section">
        <div className="osv3-design-section__header">
          <h3 className="osv3-design-section__title">{OFFICIAL_DESIGNS_SECTION_LABEL}</h3>
          <span className="osv3-design-section__count">{officialDesigns.length}</span>
        </div>
        <ul className="osv3-design-list">
          {officialDesigns.map((design) => renderDesignRow(design, "official"))}
        </ul>
      </section>

      <section className="osv3-design-section" data-testid="studio-design-user-section">
        <div className="osv3-design-section__header">
          <h3 className="osv3-design-section__title">Mis diseños</h3>
          <button
            type="button"
            data-testid="studio-design-save-open"
            className="osv3-design-section__save"
            disabled={!canSave || busyDesignId !== null}
            onClick={() => setSaveOpen(true)}
          >
            Guardar actual
          </button>
        </div>
        {loading ? (
          <p className="osv3-inspector-field__hint" data-testid="studio-design-user-loading">
            Cargando diseños guardados…
          </p>
        ) : compatibleUserDesigns.length === 0 ? (
          <p className="osv3-inspector-field__hint" data-testid="studio-design-user-empty">
            Aún no tienes diseños guardados para este widget.
          </p>
        ) : (
          <ul className="osv3-design-list">
            {compatibleUserDesigns.map((design) => renderDesignRow(design, "user"))}
          </ul>
        )}
      </section>

      <SaveDesignDialog open={saveOpen} onClose={() => setSaveOpen(false)} onSave={(input) => void handleSaveDesign(input)} />
    </div>
  );
}