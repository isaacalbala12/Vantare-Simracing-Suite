import { useMemo, useState } from 'react';
import { useI18n } from '../../../i18n/I18nProvider';
import { resolveLayoutViewport } from '../../../overlay/core/layout-viewport';
import type { InspectorSectionId } from '../../../overlay/core/widget-definition';
import { Accordion } from '../../../ui/orbit';
import { executeWidgetAction } from '../canvas/widget-actions';
import { useStudioOverlayRuntimeContext } from '../canvas/studio-telemetry';
import { useDeleteWidgetConfirm } from '../components/studio-confirm';
import { createWailsWidgetDesignClient } from '../designs/widget-design-client';
import { ActionsSection } from '../inspector/ActionsSection';
import { DesignSection } from '../inspector/DesignSection';
import { LayoutSection } from '../inspector/LayoutSection';
import { WidgetPropertyInspectorView } from '../inspector/WidgetPropertyInspectorView';
import { resolveInspectorSections } from '../inspector/inspector-sections';
import { useStudioDocument } from '../state/studio-store';
import {
  appearanceSummary,
  behaviorSummary,
  designSummary,
  inspectorMeta,
  layoutSummary,
  widgetLabel,
} from './studio-orbit-model';

type GroupId = 'design' | 'appearance' | 'behavior' | 'layout';

/**
 * Grupos Orbit ↔ secciones reales de `inspector-sections.ts` (decision D-43).
 *
 * `appearance` salio de `design`: juntas hacian que el primer acordeon fuera el
 * mas largo del panel y todo lo demas quedara debajo del scroll.
 */
const GROUPS: readonly {
  id: GroupId;
  titleKey: string;
  /** Clave literal, no `${titleKey}.help`: el auditor de i18n no ve plantillas. */
  helpKey: string;
  members: readonly InspectorSectionId[];
}[] = [
  {
    id: 'design',
    titleKey: 'studio.inspector.section.design',
    helpKey: 'studio.inspector.section.design.help',
    members: ['design'],
  },
  {
    id: 'appearance',
    titleKey: 'studio.inspector.section.appearance',
    helpKey: 'studio.inspector.section.appearance.help',
    members: ['appearance'],
  },
  {
    id: 'behavior',
    titleKey: 'studio.inspector.section.behavior',
    helpKey: 'studio.inspector.section.behavior.help',
    members: ['behavior', 'content'],
  },
  {
    id: 'layout',
    titleKey: 'studio.inspector.section.layout',
    helpKey: 'studio.inspector.section.layout.help',
    members: ['layout', 'actions'],
  },
];

function HeaderAction(props: {
  label: string;
  danger?: boolean;
  pressed?: boolean;
  testId: string;
  onClick(): void;
  children: React.ReactNode;
}) {
  const { label, danger, pressed, testId, onClick, children } = props;
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className={['orbit-icon-btn', 'orbit-icon-btn--28', danger ? 'orbit-icon-btn--danger' : null]
        .filter(Boolean)
        .join(' ')}
      data-testid={testId}
      data-tip={label}
      data-tip-side="top"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/**
 * Inspector Orbit: misma cabecera y mismos controles reales del Studio V3,
 * agrupados en tres acordeones. Las secciones que `resolveInspectorSections`
 * no devuelve para el widget (por ejemplo `appearance` en un sistema sin
 * controles de apariencia) no se pintan: la resolucion sigue siendo suya.
 */
export function StudioOrbitInspector(): React.ReactElement {
  const {
    access,
    activeLayout,
    activeSession,
    selectedWidgetId,
    document,
    savedDocument,
    dispatch,
    selectWidget,
    discardAll,
  } = useStudioDocument();
  const { t } = useI18n();
  const runtimeContext = useStudioOverlayRuntimeContext();
  const deleteConfirm = useDeleteWidgetConfirm();
  const designClient = useMemo(() => createWailsWidgetDesignClient(), []);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const widget = useMemo(() => {
    if (!selectedWidgetId || !activeLayout) return null;
    return activeLayout.widgets.find((entry) => entry.id === selectedWidgetId) ?? null;
  }, [activeLayout, selectedWidgetId]);

  const sections = useMemo(() => (widget ? resolveInspectorSections(widget) : []), [widget]);

  if (!widget || !activeLayout) {
    return (
      <p className="orbit-studio-inspector__empty" data-testid="orbit-studio-inspector-empty">
        {t('studio.inspector.empty')}
      </p>
    );
  }

  const unsupported = sections.some(
    (section) => section.labelKey === 'overlay.studio.inspector.sections.unsupported',
  );
  const has = (id: InspectorSectionId) =>
    !unsupported && sections.some((section) => section.id === id);
  const layoutViewport = resolveLayoutViewport(document ?? {});

  const runAction = (actionId: 'duplicate' | 'delete') => {
    if (!savedDocument) return;
    executeWidgetAction({
      actionId,
      session: activeSession,
      widgetIds: [widget.id],
      widgets: activeLayout.widgets,
      savedDocument,
      layoutViewport,
      dispatch,
      selectWidget,
      confirmDelete: (message) => window.confirm(message),
      requestDeleteConfirm: deleteConfirm?.request,
      deleteMessage: t('studio.v3.widgetActions.deleteConfirm'),
    });
  };

  const summaries: Record<GroupId, string> = {
    design: designSummary(widget, t),
    appearance: appearanceSummary(widget, t),
    behavior: behaviorSummary(widget, t),
    layout: layoutSummary(widget, t),
  };

  const body = (id: GroupId) => {
    if (id === 'design') {
      return (
        <DesignSection
          access={access}
          designClient={designClient}
          dispatch={dispatch}
          session={activeSession}
          widget={widget}
          widgets={activeLayout.widgets}
        />
      );
    }
    if (id === 'appearance') {
      return (
        <WidgetPropertyInspectorView
          access={access}
          dispatch={dispatch}
          sectionId="appearance"
          session={activeSession}
          runtimeContext={runtimeContext}
          widget={widget}
        />
      );
    }
    if (id === 'behavior') {
      return (
        <>
          {has('behavior') ? (
            <WidgetPropertyInspectorView
              access={access}
              dispatch={dispatch}
              sectionId="behavior"
              session={activeSession}
              runtimeContext={runtimeContext}
              widget={widget}
            />
          ) : null}
          {has('content') ? (
            <WidgetPropertyInspectorView
              access={access}
              dispatch={dispatch}
              sectionId="content"
              session={activeSession}
              runtimeContext={runtimeContext}
              widget={widget}
            />
          ) : null}
        </>
      );
    }
    return (
      <>
        {has('layout') && savedDocument ? (
          <LayoutSection
            dispatch={dispatch}
            layoutViewport={layoutViewport}
            savedDocument={savedDocument}
            selectWidget={selectWidget}
            session={activeSession}
            widget={widget}
            widgets={activeLayout.widgets}
          />
        ) : null}
        {has('actions') && savedDocument ? (
          <ActionsSection
            discardAll={discardAll}
            dispatch={dispatch}
            savedDocument={savedDocument}
            selectWidget={selectWidget}
            session={activeSession}
            widget={widget}
            widgets={activeLayout.widgets}
          />
        ) : null}
      </>
    );
  };

  return (
    <div
      aria-label={t('studio.inspector.aria')}
      className="orbit-studio-inspector"
      data-testid="orbit-studio-inspector"
      data-widget-id={widget.id}
    >
      <header className="orbit-studio-inspector__head">
        <div className="orbit-studio-inspector__id">
          <span className="orbit-eyebrow">{t('studio.inspector.kind')}</span>
          <h2 data-testid="orbit-studio-inspector-name">{widgetLabel(widget)}</h2>
          <p data-testid="orbit-studio-inspector-meta">{inspectorMeta(widget, t)}</p>
        </div>
        <div className="orbit-studio-inspector__actions">
          <HeaderAction
            label={
              widget.behavior.enabled ? t('studio.inspector.hide') : t('studio.inspector.show')
            }
            onClick={() =>
              dispatch({
                type: 'widget/behavior',
                session: activeSession,
                widgetIds: [widget.id],
                patch: { enabled: !widget.behavior.enabled },
              })
            }
            pressed={!widget.behavior.enabled}
            testId="orbit-studio-inspector-visibility"
          >
            <svg
              aria-hidden="true"
              fill="none"
              focusable="false"
              height={15}
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.4}
              viewBox="0 0 16 16"
              width={15}
            >
              <path d="M1.8 8s2.2-4 6.2-4 6.2 4 6.2 4-2.2 4-6.2 4-6.2-4-6.2-4Z" />
              <circle cx="8" cy="8" r="1.8" />
              {widget.behavior.enabled ? null : <path d="M3 13 13 3" />}
            </svg>
          </HeaderAction>
          <HeaderAction
            label={t('studio.inspector.duplicate')}
            onClick={() => runAction('duplicate')}
            testId="orbit-studio-inspector-duplicate"
          >
            <svg
              aria-hidden="true"
              fill="none"
              focusable="false"
              height={15}
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth={1.4}
              viewBox="0 0 16 16"
              width={15}
            >
              <rect height="8.5" rx="1.5" width="8.5" x="5" y="5" />
              <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
            </svg>
          </HeaderAction>
          <HeaderAction
            danger
            label={t('studio.inspector.delete')}
            onClick={() => runAction('delete')}
            testId="orbit-studio-inspector-delete"
          >
            <svg
              aria-hidden="true"
              fill="none"
              focusable="false"
              height={15}
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth={1.4}
              viewBox="0 0 16 16"
              width={15}
            >
              <path d="M3 4.5h10M6.5 4.5v-1a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1M4.5 4.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8" />
            </svg>
          </HeaderAction>
        </div>
      </header>

      <div className="orbit-studio-inspector__body">
        {unsupported ? (
          <p className="orbit-studio-inspector__empty" role="alert">
            {t('studio.inspector.unsupported')}
          </p>
        ) : null}
        {GROUPS.filter((group) => group.members.some((member) => has(member))).map((group) => (
          <Accordion
            className="orbit-studio-acc"
            key={group.id}
            onToggle={(open) => setCollapsed((state) => ({ ...state, [group.id]: !open }))}
            open={!collapsed[group.id]}
            summary={summaries[group.id]}
            tip={t(group.helpKey)}
            title={t(group.titleKey)}
          >
            <div data-testid={`orbit-studio-acc-${group.id}`}>{body(group.id)}</div>
          </Accordion>
        ))}
      </div>
    </div>
  );
}
