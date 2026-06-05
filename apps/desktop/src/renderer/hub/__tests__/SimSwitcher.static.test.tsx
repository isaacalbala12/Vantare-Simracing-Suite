/**
 * QA: SimSwitcher — static render test
 *
 * Verifies:
 * 1. Renders trigger button with sim name when sims loaded
 * 2. Dropdown menu opens on click and shows sim options
 * 3. Calls setActiveSim on option click
 * 4. Connection status indicator (red dot since connected=false by default)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { SimState, SimType } from '@vantare/sim-core';

function setupVantareMock() {
  window.vantare = {
    onTelemetry: () => (() => {}),
    onSessionData: () => (() => {}),
    onSimState: vi.fn(() => (() => {})),
    getSettings: () => Promise.resolve({
      language: 'en', autostart: false, minimizeToTray: true, startMinimized: false,
      overlayVisibilityKey: 'F9', preferredSim: 'auto', alertVolume: 0.8,
      alertEnabled: true, autoUpdate: true, updateChannel: 'stable',
      httpServerPort: 2546, networkAccess: true,
    }),
    saveSettings: () => Promise.resolve(),
    getProfiles: () => Promise.resolve([]),
    getActiveProfile: () => Promise.resolve(null),
    saveProfile: () => Promise.resolve(),
    deleteProfile: () => Promise.resolve(),
    setActiveProfile: () => Promise.resolve(),
    importProfile: (json: string) => Promise.resolve(JSON.parse(json)),
    exportProfile: () => Promise.resolve('{}'),
    login: () => Promise.resolve({ user: null, session: null }) as any,
    register: () => Promise.resolve({ user: null, session: null }) as any,
    logout: () => Promise.resolve(),
    getSession: () => Promise.resolve(null),
    getLicenseStatus: () => Promise.resolve({ tier: 'free', active: true }) as any,
    getOverlayWindows: () => Promise.resolve([]),
    showOverlay: () => Promise.resolve(),
    hideOverlay: () => Promise.resolve(),
    setOverlayPosition: () => Promise.resolve(),
    setOverlaySize: () => Promise.resolve(),
    getAvailableSims: () => Promise.resolve(['iracing', 'ac']),
    getActiveSim: () => Promise.resolve('iracing' as SimType),
    setActiveSim: vi.fn(),
    onSimListChanged: vi.fn(() => (() => {})),
    startRecording: () => Promise.resolve(),
    stopRecording: () => Promise.resolve(null),
    isRecording: () => Promise.resolve(false),
    onRecordingStateChanged: () => (() => {}),
    getInspectorData: () => Promise.resolve(null),
    onInspectorData: () => (() => {}),
    getThemes: () => Promise.resolve([]),
    getActiveTheme: () => Promise.resolve({ id: 'dark', name: 'Dark', description: '', author: '', version: '1.0', tokens: {} }),
    saveTheme: () => Promise.resolve(),
    setActiveTheme: () => Promise.resolve(),
    deleteTheme: () => Promise.resolve(),
    getVersion: () => Promise.resolve('0.1.0'),
    checkForUpdates: () => Promise.resolve(null),
    installUpdate: () => Promise.resolve(),
    openExternal: () => Promise.resolve(),
    toggleOverlayVisibility: () => Promise.resolve(),
    minimizeToTray: () => Promise.resolve(),
  };
}

describe('SimSwitcher — static render QA', () => {
  beforeEach(() => {
    setupVantareMock();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders trigger button with iRacing label when sims loaded', async () => {
    const SimSwitcher = (await import('../components/SimSwitcher')).default;
    const { container } = render(<SimSwitcher />);

    const trigger = await screen.findByTestId('sim-switcher-trigger');
    expect(trigger).not.toBeNull();
    expect(trigger.textContent).toContain('iRacing');
  });

  it('opens dropdown on trigger click showing sim options', async () => {
    const SimSwitcher = (await import('../components/SimSwitcher')).default;
    render(<SimSwitcher />);

    const trigger = await screen.findByTestId('sim-switcher-trigger');
    fireEvent.click(trigger);

    const dropdown = await screen.findByTestId('sim-switcher-dropdown');
    expect(dropdown).not.toBeNull();
    expect(dropdown.textContent).toContain('iRacing');
    expect(dropdown.textContent).toContain('Assetto Corsa');
  });

  it('calls setActiveSim on option click', async () => {
    const SimSwitcher = (await import('../components/SimSwitcher')).default;
    render(<SimSwitcher />);

    const trigger = await screen.findByTestId('sim-switcher-trigger');
    fireEvent.click(trigger);

    const acOption = await screen.findByTestId('sim-option-ac');
    fireEvent.click(acOption);

    expect(window.vantare.setActiveSim).toHaveBeenCalledWith('ac');
  });

  it('shows status indicator dot in trigger', async () => {
    const SimSwitcher = (await import('../components/SimSwitcher')).default;
    const { container } = render(<SimSwitcher />);

    const trigger = await screen.findByTestId('sim-switcher-trigger');
    // Should have at least one inline-block span (status dot)
    const inlineBlockSpans = trigger.querySelectorAll('span.inline-block');
    expect(inlineBlockSpans.length).toBeGreaterThanOrEqual(1);
  });
});
