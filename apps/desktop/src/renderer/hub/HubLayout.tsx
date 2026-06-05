import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useProfileStore } from '../shared/stores/profile-store';
import SimSwitcher from './components/SimSwitcher';
import type { Theme } from '@vantare/types';

interface NavItem {
  label: string;
  to: string;
  testId: string;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/', testId: 'sidebar-dashboard' },
  { label: 'Overlays', to: '/overlays', testId: 'sidebar-overlays' },
  { label: 'Profiles', to: '/profiles', testId: 'sidebar-profiles' },
  { label: 'Inspector', to: '/inspector', testId: 'sidebar-inspector' },
  { label: 'Settings', to: '/settings', testId: 'sidebar-settings' },
];

export default function HubLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTheme, setActiveTheme] = useState<Theme | null>(null);
  const [recording, setRecording] = useState(false);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const navigate = useNavigate();

  // Fetch the active theme from IPC on mount (graceful degradation if IPC fails)
  useEffect(() => {
    window.vantare.getActiveTheme().then((t) => {
      setActiveTheme(t);
    }).catch(() => {
      // Graceful degradation — keep null
    });
  }, []);

  // Subscribe to recording state changes
  useEffect(() => {
    const unsub = window.vantare.onRecordingStateChanged((rec) => {
      setRecording(rec);
    });
    return unsub;
  }, []);

  return (
    <div className="flex w-screen h-screen bg-[#0a0a0a] text-white overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        data-testid="hub-sidebar"
        className={`
          fixed inset-y-0 left-0 z-50 w-64
          flex flex-col
          bg-[#1e1e1e] border-r border-white/10
          transform transition-transform duration-200
          lg:relative lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-3 h-14 border-b border-white/10 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-white/70 tracking-wide uppercase shrink-0">
              Vantare
            </span>
            <SimSwitcher />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {activeTheme && (
              <span data-testid="hub-theme-display" className="text-[10px] text-white/30 hidden lg:inline">
                {activeTheme.name}
              </span>
            )}
            <button
              className="lg:hidden p-1 text-white/50 hover:text-white"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              data-testid={item.testId}
              end={item.to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="px-4 py-3 border-t border-white/10">
          <span className="text-xs text-white/30">Vantare Overlays v0.1.0</span>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile hamburger) */}
        <div className="flex items-center h-14 px-4 border-b border-white/10 lg:hidden bg-[#1e1e1e]">
          <button
            className="p-1 text-white/50 hover:text-white"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto">
          {activeProfile ? (
            <Outlet />
          ) : (
            <EmptyState onCreateProfile={() => navigate('/profiles')} />
          )}
        </div>
      </main>
    </div>
  );
}

function EmptyState({ onCreateProfile }: { onCreateProfile: () => void }) {
  return (
    <div
      data-testid="no-profiles-empty-state"
      className="flex flex-col items-center justify-center h-full px-4"
    >
      <div className="glass-panel p-8 max-w-md text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-white/5 flex items-center justify-center">
          <svg className="w-6 h-6 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-white/80">No Profile Selected</h2>
        <p className="text-sm text-white/50 leading-relaxed">
          Create a profile to configure your overlays, themes, and alerts.
          Profiles let you quickly switch between different setups.
        </p>
        <button
          onClick={onCreateProfile}
          className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors"
        >
          Create profile
        </button>
      </div>
    </div>
  );
}
