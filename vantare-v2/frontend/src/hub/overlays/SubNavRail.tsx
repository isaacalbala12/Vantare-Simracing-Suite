import type { SubNavSection } from './sub-nav-config';

type SubNavRailProps = {
  widgetName: string;
  widgetEnabled: boolean;
  sections: SubNavSection[];
  activeSectionId: string;
  onSelectSection: (id: string) => void;
  onToggleVisibility: () => void;
  dirty: boolean;
  onReset: () => void;
};

export function SubNavRail({
  widgetName,
  widgetEnabled,
  sections,
  activeSectionId,
  onSelectSection,
  onToggleVisibility,
  dirty,
  onReset,
}: SubNavRailProps) {
  return (
    <div className="sn-rail" data-testid="sub-nav-rail">
      {/* Header: widget name + status + visibility toggle */}
      <div className="sn-rail-header">
        <div className="sn-rail-header-name">{widgetName}</div>
        <div className="sn-rail-header-status">{widgetEnabled ? '● Activo' : '● Oculto'}</div>
        <button
          type="button"
          className={`sn-rail-visibility ${widgetEnabled ? 'on' : ''}`}
          onClick={onToggleVisibility}
          aria-label="Toggle widget visibility"
        />
      </div>

      {/* Section items with mini-previews */}
      <div className="sn-items">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`sn-item ${activeSectionId === section.id ? 'active' : ''}`}
            data-accent={section.accent}
            data-testid={`sn-item-${section.id}`}
            onClick={() => onSelectSection(section.id)}
          >
            <div className="sn-preview">
              <SectionMiniPreview sectionId={section.id} />
            </div>
            <span className="sn-tip">{section.label}</span>
          </button>
        ))}
      </div>

      {/* Footer: dirty state + reset */}
      <div className="sn-footer">
        <span className={`sn-footer-dot ${dirty ? 'dirty' : ''}`} />
        <span>{dirty ? 'Cambios' : 'Guardado'}</span>
        {dirty && (
          <button type="button" className="sn-footer-btn" onClick={onReset}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function SectionMiniPreview({ sectionId }: { sectionId: string }) {
  switch (sectionId) {
    case 'diseno':
      return (
        <div className="flex gap-0.5 w-full px-1.5">
          <div
            className="h-2.5 flex-1 rounded-sm"
            style={{ background: 'linear-gradient(135deg, #1a3a5c, #0a1a2c)' }}
          />
          <div
            className="h-2.5 flex-1 rounded-sm"
            style={{ background: 'linear-gradient(135deg, #4a0012, #2a000a)' }}
          />
          <div
            className="h-2.5 flex-1 rounded-sm"
            style={{ background: 'linear-gradient(135deg, #1f2937, #111827)' }}
          />
        </div>
      );
    case 'apariencia':
      return (
        <div className="w-full px-1.5 space-y-0.5">
          <div className="h-1 w-full bg-white/15 rounded-full relative overflow-hidden">
            <div className="absolute left-0 top-0 h-full w-1/2 bg-white/60 rounded-full" />
          </div>
          <div className="h-1 w-full bg-white/15 rounded-full relative overflow-hidden">
            <div className="absolute left-0 top-0 h-full w-3/4 bg-white/60 rounded-full" />
          </div>
        </div>
      );
    case 'columnas':
    case 'slots':
      return (
        <div className="flex flex-col gap-0.5 w-full px-2">
          <div className="flex items-center gap-0.5">
            <div className="w-2 h-1 rounded-full bg-blue-400" />
            <div className="flex-1 h-0.5 bg-white/20 rounded" />
          </div>
          <div className="flex items-center gap-0.5">
            <div className="w-2 h-1 rounded-full bg-blue-400" />
            <div className="flex-1 h-0.5 bg-white/20 rounded" />
          </div>
          <div className="flex items-center gap-0.5">
            <div className="w-2 h-1 rounded-full bg-white/10" />
            <div className="flex-1 h-0.5 bg-white/10 rounded" />
          </div>
        </div>
      );
    case 'colores':
      return (
        <div className="flex items-center justify-center w-full h-full">
          <svg
            className="w-3 h-3 text-amber-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
            />
          </svg>
        </div>
      );
    case 'visibilidad':
      return (
        <div className="flex items-center justify-center w-full h-full">
          <svg
            className="w-3 h-3 text-amber-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        </div>
      );
    case 'general':
      return (
        <div className="flex items-center justify-center w-full h-full">
          <svg
            className="w-3 h-3 text-cyan-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <circle cx="12" cy="12" r="3" strokeWidth={2} />
          </svg>
        </div>
      );
    default:
      return null;
  }
}
