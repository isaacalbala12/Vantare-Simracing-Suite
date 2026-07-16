import type { ReactNode } from 'react';
import type { SubNavSection } from './sub-nav-config';

type SubNavContentProps = {
  sections: SubNavSection[];
  activeSectionId: string;
  onResetSection: () => void;
  children: ReactNode;
};

export function SubNavContent({
  sections,
  activeSectionId,
  onResetSection,
  children,
}: SubNavContentProps) {
  const activeSection = sections.find((s) => s.id === activeSectionId);

  return (
    <div className="sn-content" data-testid="sub-nav-content">
      <div className="sn-content-header">
        <div className="sn-content-title">
          <span className="sn-content-title-dot" data-accent={activeSection?.accent ?? ''} />
          <span className="sn-content-title-text">{activeSection?.title ?? ''}</span>
        </div>
        <div className="sn-content-actions">
          <button
            type="button"
            className="sn-action"
            title="Reset sección"
            onClick={onResetSection}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          <button type="button" className="sn-action" title="Más opciones">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>
        </div>
      </div>
      <div className="sn-content-body">{children}</div>
    </div>
  );
}
