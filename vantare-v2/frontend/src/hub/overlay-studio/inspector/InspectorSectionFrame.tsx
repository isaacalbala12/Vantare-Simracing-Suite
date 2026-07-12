import type { InspectorSectionId } from "../../../overlay/core/widget-definition";
import { useI18n } from "../../../i18n/I18nProvider";
import { INSPECTOR_SECTION_ACCENTS, resolveInspectorSectionTitle } from "./inspector-section-labels";
import type { ResolvedInspectorSection } from "./inspector-sections";

const RESETTABLE_SECTIONS = new Set<InspectorSectionId>([
  "design",
  "appearance",
  "content",
  "behavior",
  "layout",
]);

export type InspectorSectionFrameProps = {
  section: ResolvedInspectorSection;
  children: React.ReactNode;
  onResetSection?(): void;
};

export function InspectorSectionFrame(props: InspectorSectionFrameProps): React.ReactElement {
  const { section, children, onResetSection } = props;
  const { t } = useI18n();
  const titleKey = resolveInspectorSectionTitle(section.id, section.labelKey);
  const title = titleKey.startsWith("studio.v3.") ? t(titleKey) : titleKey;
  const accent = INSPECTOR_SECTION_ACCENTS[section.id];
  const canReset =
    Boolean(onResetSection)
    && RESETTABLE_SECTIONS.has(section.id)
    && section.labelKey !== "overlay.studio.inspector.sections.unsupported";

  return (
    <section
      className="osv3-inspector-section-frame"
      data-testid="studio-inspector-section-frame"
      data-section-id={section.id}
    >
      <header className="osv3-inspector-section-frame__header">
        <div className="osv3-inspector-section-frame__title">
          <span
            className="osv3-inspector-section-frame__title-dot"
            data-accent={accent}
            aria-hidden="true"
          />
          <span className="osv3-inspector-section-frame__title-text">{title}</span>
        </div>
        {canReset ? (
          <button
            type="button"
            data-testid="studio-inspector-section-reset"
            className="osv3-inspector-section-frame__reset"
            aria-label={`${t("studio.v3.inspector.section.reset")} ${title}`}
            onClick={onResetSection}
          >
            {t("studio.v3.inspector.section.reset")}
          </button>
        ) : null}
      </header>
      <div className="osv3-inspector-section-frame__body">{children}</div>
    </section>
  );
}
