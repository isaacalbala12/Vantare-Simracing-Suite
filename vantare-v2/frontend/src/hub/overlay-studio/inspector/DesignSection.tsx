import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../../i18n/I18nProvider';
import type { AccessContext } from '../../../lib/access-policy';
import { listOfficialDesigns } from '../../../overlay/design-systems/official-designs';
import type {
  DesignSystemId,
  SessionLayoutType,
  WidgetInstanceV3,
} from '../../../overlay/core/profile-document';
import type { WidgetDesignV1 } from '../../../overlay/core/widget-design';
import { getStudioMutationGate } from '../access/studio-access';
import { useStudioConfirm } from '../components/studio-confirm';
import { SaveDesignDialog } from '../designs/SaveDesignDialog';
import {
  buildUserDesignFromWidget,
  isDesignCompatibleWithWidget,
  partitionApplyAllTargets,
  resolveEffectiveDesign,
} from '../designs/design-utils';
import type { WidgetDesignClient } from '../designs/widget-design-client';
import type { StudioCommand } from '../state/studio-command';
import { Button, Field, Select } from '../../../ui/orbit';

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

const VISUAL_SYSTEM_OPTIONS: readonly { id: DesignSystemId; labelKey: string }[] = [
  { id: 'vantare-original', labelKey: 'studio.v3.design.system.original' },
  { id: 'vantare-crystal', labelKey: 'studio.v3.design.system.crystal' },
  { id: 'vantare-endurance', labelKey: 'studio.v3.design.system.endurance' },
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
  } = props;
  const { t } = useI18n();
  const studioConfirm = useStudioConfirm();
  const [userDesigns, setUserDesigns] = useState<WidgetDesignV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [busyDesignId, setBusyDesignId] = useState<string | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<{
    widgetId: string;
    systemId: DesignSystemId;
  }>({
    widgetId: widget.id,
    systemId: widget.visual.systemId,
  });
  const selectedSystemId =
    selectedSystem.widgetId === widget.id ? selectedSystem.systemId : widget.visual.systemId;
  const selectSystem = (systemId: DesignSystemId) =>
    setSelectedSystem({ widgetId: widget.id, systemId });

  const refreshUserDesigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const designs = await designClient.list(widget.type);
      setUserDesigns(designs.filter((design) => design.origin === 'user'));
    } catch (refreshError) {
      const message =
        refreshError instanceof Error ? refreshError.message : t('studio.v3.design.loadFailed');
      setError(message);
      setUserDesigns([]);
    } finally {
      setLoading(false);
    }
  }, [designClient, t, widget.type]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshUserDesigns(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshUserDesigns]);

  const officialDesigns = useMemo(
    () =>
      listOfficialDesigns(widget.type).filter(
        (design) =>
          design.systemId === selectedSystemId && isDesignCompatibleWithWidget(design, widget),
      ),
    [selectedSystemId, widget],
  );
  const compatibleUserDesigns = useMemo(
    () =>
      userDesigns.filter(
        (design) =>
          design.systemId === selectedSystemId && isDesignCompatibleWithWidget(design, widget),
      ),
    [selectedSystemId, userDesigns, widget],
  );

  const canApply = getStudioMutationGate({ access, mutation: 'apply-design', widget }).allowed;
  const canApplyAll = getStudioMutationGate({ access, mutation: 'apply-all', widget }).allowed;
  const canSave = canApply;

  const applyDesign = (design: WidgetDesignV1, widgetIds: readonly string[]) => {
    const gate = getStudioMutationGate({ access, mutation: 'apply-design', widget, design });
    if (!gate.allowed) {
      return;
    }
    dispatch({
      type: 'widget/apply-design',
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
    const message = t('studio.v3.design.applyAll.confirm')
      .replace('{name}', design.name)
      .replace('{count}', String(compatibleIds.length))
      .replace(
        '{skipped}',
        skippedCount > 0
          ? ` ${t('studio.v3.design.applyAll.skippedSuffix').replace('{count}', String(skippedCount))}`
          : '',
      )
      .replace(/\s*$/, '.');

    if (studioConfirm) {
      studioConfirm.request({
        title: t('studio.v3.design.applyAllDialog.title'),
        body: message,
        hint: t('studio.v3.design.applyAllDialog.hint'),
        confirmLabel: t('studio.v3.design.apply'),
        cancelLabel: t('studio.v3.confirm.cancel'),
        tone: 'primary',
        testIdPrefix: 'studio-design-apply-all',
        commit: () => applyDesign(design, compatibleIds),
      });
      return;
    }

    if (confirmApplyAll(message)) {
      applyDesign(design, compatibleIds);
    }
  };

  const handleSaveDesign = async (input: { name: string; includesContent: boolean }) => {
    if (!canSave) {
      return;
    }
    const draft = buildUserDesignFromWidget(widget, {
      id: '',
      name: input.name,
      includesContent: input.includesContent,
    });
    setBusyDesignId('save');
    setError(null);
    try {
      const saved = await designClient.save(draft);
      setUserDesigns((current) => {
        const without = current.filter((design) => design.id !== saved.id);
        return [...without, saved];
      });
      setSaveOpen(false);
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : t('studio.v3.design.saveFailed');
      setError(message);
    } finally {
      setBusyDesignId(null);
    }
  };

  {
    // Catalogo plano (oficiales + del usuario) sin los bloqueados por plan: el
    // `Select` no puede ofrecer algo que el gate va a rechazar.
    const catalogue = [...officialDesigns, ...compatibleUserDesigns].filter(
      (design) =>
        getStudioMutationGate({ access, mutation: 'apply-design', widget, design }).allowed,
    );
    const lockedCount = officialDesigns.length + compatibleUserDesigns.length - catalogue.length;
    // El valor del `Select` es el diseno que el widget lleva puesto, no solo el
    // que alguien aplico a mano: sin procedencia el widget se pinta con el
    // diseno por defecto de su sistema y eso es lo que hay que mostrar.
    const activeDesign = resolveEffectiveDesign(widget, catalogue);
    const applyAllTargets = activeDesign
      ? partitionApplyAllTargets(widgets, activeDesign).compatibleIds.length
      : 0;

    return (
      <div
        className="orbit-studio-ins__body"
        data-testid="studio-inspector-section-design"
        data-widget-id={widget.id}
      >
        {!canApply ? (
          <p className="orbit-studio-ins__hint" data-testid="studio-design-access-lock">
            {t('studio.v3.design.accessLock')}
          </p>
        ) : null}
        {error ? (
          <p className="orbit-studio-ins__error" data-testid="studio-design-error">
            {error}
          </p>
        ) : null}

        <div className="orbit-studio-ins__grid2">
          <Field htmlFor="orbit-design-system" label={t('studio.inspector.design.system')}>
            <Select
              disabled={!canApply}
              id="orbit-design-system"
              label={t('studio.inspector.design.system')}
              onChange={(next) => selectSystem(next as DesignSystemId)}
              options={VISUAL_SYSTEM_OPTIONS.map((option) => ({
                value: option.id,
                label: t(option.labelKey),
              }))}
              value={selectedSystemId}
            />
          </Field>
          <Field htmlFor="orbit-design-variant" label={t('studio.inspector.design.variant')}>
            <Select
              disabled={!canApply || catalogue.length === 0}
              id="orbit-design-variant"
              label={t('studio.inspector.design.variant')}
              onChange={(next) => {
                const design = catalogue.find((entry) => entry.id === next);
                if (design) handleApply(design);
              }}
              options={[
                ...(activeDesign ? [] : [{ value: '', label: t('studio.inspector.design.none') }]),
                ...catalogue.map((design) => ({ value: design.id, label: design.name })),
              ]}
              value={activeDesign?.id ?? ''}
            />
          </Field>
        </div>

        {loading ? (
          <p className="orbit-studio-ins__hint" data-testid="studio-design-user-loading">
            {t('studio.v3.design.userSection.loading')}
          </p>
        ) : null}
        {lockedCount > 0 ? (
          <p className="orbit-studio-ins__hint" data-testid="studio-design-locked-hint">
            {t('studio.v3.design.lock.generic')}
          </p>
        ) : null}

        <div className="orbit-studio-ins__row">
          <Button
            data-testid="studio-design-apply-all"
            disabled={
              !canApplyAll || !activeDesign || applyAllTargets <= 1 || busyDesignId !== null
            }
            onClick={() => {
              if (activeDesign) handleApplyAllRequest(activeDesign);
            }}
            size="sm"
            variant="ghost"
          >
            {t('studio.inspector.design.applyAll')}
          </Button>
          <Button
            data-testid="studio-design-save-open"
            disabled={!canSave || busyDesignId !== null}
            onClick={() => setSaveOpen(true)}
            size="sm"
            variant="ghost"
          >
            {t('studio.inspector.design.saveAs')}
          </Button>
        </div>

        <SaveDesignDialog
          onClose={() => setSaveOpen(false)}
          onSave={(input) => void handleSaveDesign(input)}
          open={saveOpen}
        />
      </div>
    );
  }
}
