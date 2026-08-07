import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyTheme, getStoredThemeId, persistThemeId, type VantareTheme } from '../../lib/theme';
import vantareV5 from '../../themes/vantare-v5.json';
import vantareLite from '../../themes/vantare-lite.json';
import { NAV_ITEMS, type Section } from '../navigation';
import { useAccess } from '../../lib/access';
import { canSeeSection, type SectionId } from '../../lib/access-policy';
import type { TelemetrySourceStatus } from '../../telemetry-transport/source-status';
import type { TestingCenterChannel } from '../testing-center/contracts';

const v5Theme = vantareV5 as unknown as VantareTheme;
const liteTheme = vantareLite as unknown as VantareTheme;

type TopbarProps = {
  activeSection: Section;
  onNavigate: (id: Section) => void;
  version?: string | null;
  sourceStatus?: TelemetrySourceStatus | null;
  testingCenterChannel?: TestingCenterChannel | null;
};

const SECTION_TO_FEATURE: Record<string, SectionId> = {
  dashboard: "dashboard",
  profiles: "overlays",
  launcher: "launcher",
  calendar: "calendar",
  engineer: "engineer",
  strategy: "strategy",
  telemetry: "telemetry",
  roadmap: "roadmap",
  setup: "settings",
};

export function Topbar({ activeSection, onNavigate, version, sourceStatus, testingCenterChannel }: TopbarProps) {
  const access = useAccess();

  const navItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => item.id !== "testing-center" || testingCenterChannel).map((item) => ({
        ...item,
        allowed: item.id === "testing-center"
          ? Boolean(testingCenterChannel)
          : canSeeSection(access, SECTION_TO_FEATURE[item.id] ?? item.id),
      })),
    [access, testingCenterChannel],
  );
  const [liteMode, setLiteMode] = useState(() => getStoredThemeId() === 'vantare-lite');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const theme = liteMode ? liteTheme : v5Theme;
    applyTheme(theme);
    persistThemeId(theme.id === 'vantare-lite' ? 'vantare-lite' : 'vantare-v5');
  }, [liteMode]);

  const sourceLabel = !sourceStatus
    ? 'Fuente pendiente'
    : sourceStatus.live
    ? sourceStatus.available
      ? 'LMU conectado'
      : 'Esperando LMU'
    : 'Mock';

  const sourceColor = sourceStatus?.live && sourceStatus.available
    ? 'text-green-400'
    : 'text-vantare-textMuted';

  const handleNav = useCallback(
    (id: Section) => (e: React.MouseEvent) => {
      e.preventDefault();
      setMobileMenuOpen(false);
      onNavigate(id);
    },
    [onNavigate],
  );

  function toggleLiteMode() {
    setLiteMode((current) => !current);
  }

  const navigationItems = navItems.map((item) =>
    item.allowed ? (
      <a
        key={item.id}
        href="#"
        data-testid={`topbar-nav-${item.id}`}
        aria-current={activeSection === item.id ? "page" : undefined}
        onClick={handleNav(item.id)}
        className={`nav-item whitespace-nowrap ${activeSection === item.id ? 'active text-vantare-text' : ''}`}
      >
        {item.label}
      </a>
    ) : (
      <button
        key={item.id}
        type="button"
        disabled
        data-testid={`topbar-nav-${item.id}`}
        className="nav-item whitespace-nowrap opacity-40 cursor-not-allowed"
        title="Disponible para testers y planes de pago"
      >
        {item.label}
      </button>
    ),
  );

  return (
    <nav className="sticky top-0 z-50 glass-panel border-b border-white/5">
      <div className="max-w-[1920px] mx-auto px-3 sm:px-6 py-2 xl:h-14 xl:py-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 xl:flex-nowrap xl:gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <svg
              className="w-8 h-8"
              viewBox="0 0 40 40"
              fill="none"
              style={{ filter: 'drop-shadow(0 0 10px rgba(255, 59, 59, 0.5))' }}
            >
              <defs>
                <linearGradient id="logoGradTop" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ff4d4d" />
                  <stop offset="55%" stopColor="#e21b1b" />
                  <stop offset="100%" stopColor="#9a0606" />
                </linearGradient>
              </defs>
              <path
                d="M20 2 L38 38 L28 38 L20 18 L12 38 L2 38 Z"
                fill="url(#logoGradTop)"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="0.5"
              />
              <path
                d="M20 8 L32 34 L26 34 L20 20 L14 34 L8 34 Z"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="0.5"
              />
            </svg>
            <span className="font-sans font-bold text-base sm:text-xl tracking-wider text-white">
              VANTARE
            </span>
            {version && (
              <span className="hidden sm:inline text-[10px] text-vantare-textMuted font-mono px-2 py-0.5 rounded bg-white/5 border border-white/5">
                {version}
              </span>
            )}
            <span
              className={`hidden sm:inline text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/5 ${sourceColor}`}
              title={sourceStatus?.name ?? "Fuente pendiente"}
              aria-label={`Fuente de telemetría: ${sourceLabel}`}
            >
              {sourceLabel}
            </span>
          </div>
          <button
            type="button"
            data-testid="topbar-mobile-menu-toggle"
            aria-expanded={mobileMenuOpen}
            aria-controls="topbar-mobile-navigation"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="md:hidden shrink-0 btn-secondary px-3 py-1.5 rounded-lg text-xs font-bold text-vantare-textMuted hover:text-white"
          >
            Menú
          </button>

          <div className="ml-auto flex items-center gap-3 shrink-0 xl:order-3 xl:ml-0 xl:gap-4">
          <button
            type="button"
            onClick={toggleLiteMode}
            className="hidden sm:inline-flex btn-secondary px-3 py-1.5 rounded-lg text-xs font-bold text-vantare-textMuted hover:text-white"
          >
            {liteMode ? 'Lite ON' : 'Lite OFF'}
          </button>
          <div className="flex items-center gap-2 pl-3 sm:pl-4 border-l border-white/5">
            <div className="lite-motion w-8 h-8 rounded-full bg-gradient-to-br from-vantare-red-600 to-vantare-burgundy flex items-center justify-center text-xs font-bold">
              U
            </div>
          </div>
        </div>
        <div className="order-3 hidden w-full md:flex md:flex-wrap md:justify-center md:gap-x-5 md:gap-y-2 md:border-t md:border-white/5 md:pt-2 text-xs lg:text-sm font-medium text-vantare-textMuted xl:order-2 xl:w-auto xl:flex-1 xl:flex-nowrap xl:justify-start xl:border-0 xl:pt-0">
          {navigationItems}
        </div>
        {mobileMenuOpen && (
          <div
            id="topbar-mobile-navigation"
            className="order-3 flex w-full flex-col gap-3 border-t border-white/5 pt-3 text-sm font-medium text-vantare-textMuted md:hidden"
          >
            <button
              type="button"
              onClick={toggleLiteMode}
              className="btn-secondary w-fit px-3 py-1.5 rounded-lg text-xs font-bold text-vantare-textMuted hover:text-white"
            >
              {liteMode ? 'Lite ON' : 'Lite OFF'}
            </button>
            <div className="flex flex-wrap gap-x-5 gap-y-3">{navigationItems}</div>
          </div>
        )}
        </div>
      </div>
    </nav>
  );
}
