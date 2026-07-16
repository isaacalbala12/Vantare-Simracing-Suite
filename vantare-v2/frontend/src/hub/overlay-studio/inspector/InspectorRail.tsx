import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import { useI18n } from "../../../i18n/I18nProvider";
import type { InspectorSectionId } from "../../../overlay/core/widget-definition";
import {
  INSPECTOR_SECTION_ACCENTS,
  INSPECTOR_SECTION_DISPLAY_LABELS,
  resolveInspectorSectionTitle,
} from "./inspector-section-labels";
import type { ResolvedInspectorSection } from "./inspector-sections";

function widgetDisplayName(widget: WidgetInstanceV3): string {
  return widget.name?.trim() || widget.id;
}

export type InspectorRailProps = {
  widget: WidgetInstanceV3;
  sections: readonly ResolvedInspectorSection[];
  activeSectionId: InspectorSectionId;
  dirty: boolean;
  onSelectSection(sectionId: InspectorSectionId): void;
  onToggleVisibility(): void;
};

export function InspectorRail(props: InspectorRailProps): React.ReactElement {
  const { widget, sections, activeSectionId, dirty, onSelectSection, onToggleVisibility } = props;
  const { t } = useI18n();
  const sectionLabel = (value: string) => value.startsWith("studio.v3.") ? t(value) : value;

  return (
    <nav className="osv3-inspector-rail" data-testid="studio-inspector-rail" aria-label={t("studio.v3.inspector.rail.aria")}>
      <div className="osv3-inspector-rail__header" data-testid="studio-inspector-rail-header">
        <div className="osv3-inspector-rail__name">{widgetDisplayName(widget)}</div>
        <div
          className={
            widget.behavior.enabled
              ? "osv3-inspector-rail__status osv3-inspector-rail__status--active"
              : "osv3-inspector-rail__status"
          }
        >
          {widget.behavior.enabled ? t("studio.v3.inspector.rail.status.active") : t("studio.v3.inspector.rail.status.hidden")}
        </div>
        <button
          type="button"
          data-testid="studio-inspector-visibility-toggle"
          className={
            widget.behavior.enabled
              ? "osv3-inspector-visibility osv3-inspector-visibility--on"
              : "osv3-inspector-visibility"
          }
          aria-pressed={widget.behavior.enabled}
          aria-label={widget.behavior.enabled ? t("studio.v3.inspector.rail.hideWidgetAria") : t("studio.v3.inspector.rail.showWidgetAria")}
          onClick={onToggleVisibility}
        />
      </div>

      <div className="osv3-inspector-rail__items" data-testid="studio-inspector-rail-items">
        {sections.map((section) => {
          const accent = INSPECTOR_SECTION_ACCENTS[section.id];
          const label = sectionLabel(resolveInspectorSectionTitle(section.id, section.labelKey));
          const active = section.id === activeSectionId;
          return (
            <button
              key={section.id}
              type="button"
              data-testid={`studio-inspector-rail-item-${section.id}`}
              data-accent={accent}
              className={active ? "osv3-inspector-rail__item osv3-inspector-rail__item--active" : "osv3-inspector-rail__item"}
              aria-current={active ? "true" : undefined}
              aria-label={label}
              title={label}
              onClick={() => onSelectSection(section.id)}
            >
              <span className="osv3-inspector-rail__preview" aria-hidden="true">
                <span className="osv3-inspector-rail__preview-mark" data-section={section.id} />
                {section.badge ? (
                  <span className="osv3-inspector-rail__badge">{section.badge}</span>
                ) : null}
              </span>
              <span className="osv3-inspector-rail__tip">{sectionLabel(INSPECTOR_SECTION_DISPLAY_LABELS[section.id] ?? label)}</span>
            </button>
          );
        })}
      </div>

      <footer className="osv3-inspector-rail__footer" data-testid="studio-inspector-footer" data-dirty={dirty ? "true" : "false"}>
        <span
          className={dirty ? "osv3-inspector-rail__dirty-dot osv3-inspector-rail__dirty-dot--dirty" : "osv3-inspector-rail__dirty-dot"}
          aria-hidden="true"
        />
        <span data-testid="studio-inspector-dirty-indicator">
          {dirty ? t("studio.v3.inspector.rail.dirty") : t("studio.v3.inspector.rail.clean")}
        </span>
      </footer>
    </nav>
  );
}
