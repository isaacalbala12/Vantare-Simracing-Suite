import { useCallback, useEffect, useState } from 'react';
import { applyTheme, getStoredThemeId, persistThemeId, type VantareTheme } from '../../lib/theme';
import vantareV5 from '../../themes/vantare-v5.json';
import vantareLite from '../../themes/vantare-lite.json';
import { NAV_ITEMS, type Section } from '../navigation';

const v5Theme = vantareV5 as unknown as VantareTheme;
const liteTheme = vantareLite as unknown as VantareTheme;

type SourceStatus = {
  kind: string;
  name: string;
  live: boolean;
  available: boolean;
};

type TopbarProps = {
  activeSection: Section;
  onNavigate: (id: Section) => void;
  version?: string | null;
  sourceStatus?: SourceStatus | null;
};

export function Topbar({ activeSection, onNavigate, version, sourceStatus }: TopbarProps) {
  const [liteMode, setLiteMode] = useState(() => getStoredThemeId() === 'vantare-lite');

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
      onNavigate(id);
    },
    [onNavigate],
  );

  function toggleLiteMode() {
    setLiteMode((current) => !current);
  }

  return (
    <nav className="sticky top-0 z-50 glass-panel border-b border-white/5">
      <div className="max-w-[1920px] mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <svg
              className="w-8 h-8"
              viewBox="0 0 40 40"
              fill="none"
              style={{ filter: 'drop-shadow(0 0 10px rgba(139, 0, 0, 0.6))' }}
            >
              <defs>
                <linearGradient id="logoGradTop" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FF6B6B" />
                  <stop offset="50%" stopColor="#C1121F" />
                  <stop offset="100%" stopColor="#800020" />
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
            <span className="font-sans font-bold text-xl tracking-wider text-white">
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

          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-vantare-textMuted">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                href="#"
                onClick={handleNav(item.id)}
                className={`nav-item ${activeSection === item.id ? 'active text-vantare-text' : ''}`}
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={toggleLiteMode}
            className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-bold text-vantare-textMuted hover:text-white"
          >
            {liteMode ? 'Lite ON' : 'Lite OFF'}
          </button>
          <button
            type="button"
            className="lite-motion btn-secondary px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all hover:scale-105"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            <span className="hidden sm:inline">Notificaciones</span>
          </button>
          <div className="flex items-center gap-2 pl-4 border-l border-white/5">
            <div className="lite-motion w-8 h-8 rounded-full bg-gradient-to-br from-vantare-red-600 to-vantare-burgundy flex items-center justify-center text-xs font-bold">
              U
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
