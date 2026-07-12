import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import type { AccessContext } from "../../../lib/access-policy";
import {
  listOfficialDesigns,
} from "../../../overlay/design-systems/official-designs";
import type { DesignSystemId, SessionLayoutType, WidgetInstanceV3 } from "../../../overlay/core/profile-document";
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
    return "studio.v3.design.lock.advanced";
  }
  return "studio.v3.design.lock.generic";
}

const VISUAL_SYSTEM_OPTIONS: readonly { id: DesignSystemId; labelKey: string }[] = [
  { id: "vantare-original", labelKey: "studio.v3.design.system.original" },
  { id: "vantare-crystal", labelKey: "studio.v3.design.system.crystal" },
];

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
    promptRename,
  } = props;
  const { t } = useI18n();
  const requestRename = promptRename ?? ((currentName: string) => window.prompt(t("studio.v3.design.renamePrompt"), currentName));

  const [userDesigns, setUserDesigns] = useState<WidgetDesignV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [busyDesignId, setBusyDesignId] = useState<string | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<{ widgetId: string; systemId: DesignSystemId }>({
    widgetId: widget.id,
    systemId: widget.visual.systemId,
  });
  const selectedSystemId = selectedSystem.widgetId === widget.id ? selectedSystem.systemId : widget.visual.systemId;
  const selectSystem = (systemId: DesignSystemId) => setSelectedSystem({ widgetId: widget.id, systemId });

  const refreshUserDesigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const designs = await designClient.list(widget.type);
      setUserDesigns(designs.filter((design) => design.origin === "user"));
    } catch (refreshError) {
      const message =
        refreshError instanceof Error ? refreshError.message : t("studio.v3.design.loadFailed");
      setError(message);
      setUserDesigns([]);
    } finally {
      setLoading(false);
    }
  }, [designClient, t, widget.type]);

  useEffect(() => {
    void refreshUserDesigns();
  }, [refreshUserDesigns]);

  const officialDesigns = useMemo(
    () =>
      listOfficialDesigns(widget.type).filter(
        (design) => design.systemId === selectedSystemId && isDesignCompatibleWithWidget(design, widget),
      ),
    [selectedSystemId, widget],
  );
  const compatibleUserDesigns = useMemo(
    () =>
      userDesigns.filter(
        (design) => design.systemId === selectedSystemId && isDesignCompatibleWithWidget(design, widget),
      ),
    [selectedSystemId, userDesigns, widget],
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
    const message = t("studio.v3.design.applyAll.confirm")
      .replace("{name}", design.name)
      .replace("{count}", String(compatibleIds.length))
      .replace(
        "{skipped}",
        skippedCount > 0 ? ` ${t("studio.v3.design.applyAll.skippedSuffix").replace("{count}", String(skippedCount))}` : "",
      )
      .replace(/\s*$/, ".");
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
      const message = saveError instanceof Error ? saveError.message : t("studio.v3.design.saveFailed");
      setError(message);
    } finally {
      setBusyDesignId(null);
    }
  };

  const handleDelete = async (design: WidgetDesignV1) => {
    if (!canSave || !confirmDelete(t("studio.v3.design.deleteConfirm").replace("{name}", design.name))) {
      return;
    }
    setBusyDesignId(design.id);
    setError(null);
    try {
      await designClient.delete(design.id);
      setUserDesigns((current) => current.filter((entry) => entry.id !== design.id));
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : t("studio.v3.design.deleteFailed");
      setError(message);
    } finally {
      setBusyDesignId(null);
    }
  };

  const handleRename = async (design: WidgetDesignV1) => {
    if (!canSave) {
      return;
    }
    const nextName = requestRename(design.name)?.trim();
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
      const message = renameError instanceof Error ? renameError.message : t("studio.v3.design.renameFailed");
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
        </div>
        {active ? (
          <span className="osv3-design-list__active" data-testid={`studio-design-active-${design.id}`}>
            Activo
          </span>
        ) : locked ? (
          <span className="osv3-design-list__lock" data-testid={`studio-design-lock-${design.id}`}>
            {t(designLockMessage(design))}
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
          {t("studio.v3.design.accessLock")}
        </p>
      ) : null}
      {error ? (
        <p className="osv3-dialog-panel__error" data-testid="studio-design-error">
          {error}
        </p>
      ) : null}

      <section className="osv3-design-section osv3-design-system-section" data-testid="studio-design-system-section">
        <div className="osv3-design-section__header">
          <h3 className="osv3-design-section__title">{t("studio.v3.design.systemSection.title")}</h3>
        </div>
        <div
          className="osv3-design-system-selector"
          role="group"
          aria-label={t("studio.v3.design.systemSection.aria")}
          data-testid="studio-design-system-selector"
        >
          {VISUAL_SYSTEM_OPTIONS.map((option) => {
            const active = selectedSystemId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                className={`osv3-design-system-selector__option${active ? " osv3-design-system-selector__option--active" : ""}`}
                aria-pressed={active}
                data-testid={`studio-design-system-${option.id}`}
                onClick={() => selectSystem(option.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectSystem(option.id);
                  }
                }}
              >
                {t(option.labelKey)}
              </button>
            );
          })}
        </div>
      </section>

      <section className="osv3-design-section" data-testid="studio-design-official-section">
        <div className="osv3-design-section__header">
          <h3 className="osv3-design-section__title">{t("studio.v3.design.officialSection.title")}</h3>
          <span className="osv3-design-section__count">{officialDesigns.length}</span>
        </div>
        <ul className="osv3-design-list">
          {officialDesigns.map((design) => renderDesignRow(design, "official"))}
        </ul>
      </section>

      <section className="osv3-design-section" data-testid="studio-design-user-section">
        <div className="osv3-design-section__header">
          <h3 className="osv3-design-section__title">{t("studio.v3.design.userSection.title")}</h3>
          <button
            type="button"
            data-testid="studio-design-save-open"
            className="osv3-design-section__save"
            disabled={!canSave || busyDesignId !== null}
            onClick={() => setSaveOpen(true)}
          >
            {t("studio.v3.design.userSection.saveCurrent")}
          </button>
        </div>
        {loading ? (
          <p className="osv3-inspector-field__hint" data-testid="studio-design-user-loading">
            {t("studio.v3.design.userSection.loading")}
          </p>
        ) : compatibleUserDesigns.length === 0 ? (
          <p className="osv3-inspector-field__hint" data-testid="studio-design-user-empty">
            {t("studio.v3.design.userSection.empty")}
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
