import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';

type Handler = (event: { data: unknown }) => void;

const runtimeMock = vi.hoisted(() => ({
  handlers: new Map<string, Handler[]>(),
  emit: vi.fn(),
}));

vi.mock('@wailsio/runtime', () => ({
  Events: {
    On: (name: string, handler: Handler) => {
      runtimeMock.handlers.set(name, [...(runtimeMock.handlers.get(name) ?? []), handler]);
      return () =>
        runtimeMock.handlers.set(
          name,
          (runtimeMock.handlers.get(name) ?? []).filter((h) => h !== handler),
        );
    },
    Emit: runtimeMock.emit,
  },
}));

vi.mock('../../lib/license', () => ({
  useLicense: () => ({
    result: {
      email: 'test@example.com',
      state: 'active',
      entitlements: ['overlays', 'engineer'],
      capabilities: ['vantare.channel.nightly'],
    },
    loading: false,
    refresh: vi.fn(),
  }),
  LicenseProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../lib/supabase-auth', () => ({
  signOut: vi.fn(),
  getSession: vi.fn().mockResolvedValue(null),
}));

vi.mock('../settings/diagnostics/WailsDiagnosticsPanel', () => ({
  WailsDiagnosticsPanel: () => (
    <section data-testid="diagnostics-panel">
      <h2>Inspector y paquete de diagnóstico</h2>
    </section>
  ),
}));

function dispatch(name: string, data: unknown) {
  act(() => {
    for (const handler of runtimeMock.handlers.get(name) ?? []) {
      handler({ data });
    }
  });
}

const release = {
  tag_name: 'v0.1.5-prealpha',
  name: 'v0.1.5',
  body: 'Bugfixes.',
  prerelease: true,
  published_at: '2026-06-15T00:00:00Z',
  html_url: 'https://github.com/example',
  assets: [
    {
      name: 'vantare-amd64-installer.exe',
      size: 6624510,
      browser_download_url: 'https://example.com/installer.exe',
    },
    {
      name: 'vantare-amd64-installer.exe.sha256',
      size: 100,
      browser_download_url: 'https://example.com/installer.exe.sha256',
    },
  ],
};

function clickTab(tabLabel: string) {
  fireEvent.click(screen.getByRole('tab', { name: tabLabel }));
}

describe('SettingsPage', () => {
  beforeEach(() => {
    runtimeMock.handlers.clear();
    runtimeMock.emit.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders header and shows Cuenta tab by default', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { name: 'Ajustes' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Cuenta' })).toBeDefined();
    expect(screen.getByRole('tabpanel', { name: 'Cuenta' })).toBeDefined();
  });

  it('renders AccountSettings inside the Cuenta tab', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { name: 'Cuenta' })).toBeDefined();
  });

  it('shows channel options when clicking Actualizaciones tab', () => {
    render(<SettingsPage />);
    clickTab('Actualizaciones');
    expect(screen.getByLabelText('Stable')).toBeDefined();
    expect(screen.getByLabelText('Testers')).toBeDefined();
    expect(screen.getByLabelText('Nightly')).toBeDefined();
  });

  it('shows hotkeys when clicking Hotkeys tab', () => {
    render(<SettingsPage />);
    clickTab('Hotkeys');
    expect(screen.getByRole('heading', { name: 'Atajos de teclado globales' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Guardar atajos' })).toBeDefined();
    expect(screen.getByText('Toggle overlay')).toBeDefined();
    expect(screen.getByText('Siguiente perfil')).toBeDefined();
    expect(screen.getByText('Perfil anterior')).toBeDefined();
  });

  function clickFirstHotkeyButton() {
    const buttons = screen.getAllByRole('button', { name: /Cambiar/ });
    fireEvent.click(buttons[0]);
  }

  it('enters capture mode when clicking a hotkey row', () => {
    render(<SettingsPage />);
    clickTab('Hotkeys');
    clickFirstHotkeyButton();
    expect(screen.getByText('Pulsa una combinación...')).toBeDefined();
    expect(screen.getByText('Cancelar')).toBeDefined();
  });

  it('captures Ctrl+Shift+E and updates the value', async () => {
    render(<SettingsPage />);
    clickTab('Hotkeys');
    clickFirstHotkeyButton();
    const event = new KeyboardEvent('keydown', {
      key: 'e',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => { document.dispatchEvent(event); });
    await waitFor(() => {
      expect(screen.queryByText('Pulsa una combinación...')).toBeNull();
    });
    expect(screen.getByText('ctrl+shift+e')).toBeDefined();
  });

  it('cancels capture on Escape and preserves previous value', async () => {
    render(<SettingsPage />);
    dispatch('settings', {
      deltaMode: 'self',
      cpuSampling: true,
      hotkeys: { toggleOverlay: 'ctrl+shift+v' },
    });
    clickTab('Hotkeys');
    clickFirstHotkeyButton();
    const esc = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    act(() => { document.dispatchEvent(esc); });
    await waitFor(() => {
      expect(screen.queryByText('Pulsa una combinación...')).toBeNull();
    });
    expect(screen.getByText('ctrl+shift+v')).toBeDefined();
  });

  it('does not change value when pressing only Ctrl', () => {
    render(<SettingsPage />);
    dispatch('settings', {
      deltaMode: 'self',
      cpuSampling: true,
      hotkeys: { toggleOverlay: 'ctrl+shift+v' },
    });
    clickTab('Hotkeys');
    clickFirstHotkeyButton();
    const ctrl = new KeyboardEvent('keydown', {
      key: 'Control',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(ctrl);
    expect(screen.getByText('Pulsa una combinación...')).toBeDefined();
  });

  it('shows diagnostics when clicking Diagnóstico tab', () => {
    render(<SettingsPage />);
    clickTab('Diagnóstico');
    expect(screen.getByRole('heading', { name: 'Inspector y paquete de diagnóstico' })).toBeDefined();
    expect(screen.getByTestId('diagnostics-panel')).toBeDefined();
  });

  // The Avanzado tab is gone. Nothing in Go or in the frontend read deltaMode
  // or cpuSampling to change behaviour, so it offered two controls that did
  // nothing. Its Información card was the part worth keeping and now sits
  // beside the diagnostics panel.
  it('no longer offers an Avanzado tab or its inert controls', () => {
    render(<SettingsPage />);
    expect(screen.queryByRole('tab', { name: 'Avanzado' })).toBeNull();
    expect(screen.queryByText('Modo delta')).toBeNull();
    expect(screen.queryByText('Monitorizar uso de CPU')).toBeNull();
  });

  it('shows the Información card inside the Diagnóstico tab', () => {
    render(<SettingsPage />);
    clickTab('Diagnóstico');
    expect(screen.getByRole('heading', { name: 'Información' })).toBeDefined();
    expect(screen.getByText(/Versión actual:/)).toBeDefined();
    expect(screen.getByText(/Canal:/)).toBeDefined();
  });

  it('emits settings save when channel changes', () => {
    render(<SettingsPage />);
    dispatch('updater:settings', { settings: { channel: 'stable' } });
    clickTab('Actualizaciones');

    fireEvent.click(screen.getByLabelText('Nightly'));

    expect(runtimeMock.emit).toHaveBeenCalledWith('updater:settings:save', {
      channel: 'nightly',
    });
  });

  it('displays available releases and marks current version', () => {
    render(<SettingsPage />);
    clickTab('Actualizaciones');
    dispatch('updater:available', {
      info: {
        currentVersion: 'v0.1.4-prealpha',
        releases: [{ ...release, tag_name: 'v0.1.4-prealpha' }, release],
      },
    });

    expect(screen.getByText('v0.1.5-prealpha')).toBeDefined();
    expect(screen.getByText('Instalada')).toBeDefined();
  });

  it('emits ignore event when skipping a version', () => {
    render(<SettingsPage />);
    clickTab('Actualizaciones');
    dispatch('updater:available', {
      info: {
        currentVersion: 'v0.1.4-prealpha',
        releases: [release],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }));
    expect(runtimeMock.emit).toHaveBeenCalledWith('updater:ignore', { version: 'v0.1.5-prealpha' });
  });

  it('shows changelog when clicking Ver cambios', () => {
    render(<SettingsPage />);
    clickTab('Actualizaciones');
    dispatch('updater:available', {
      info: {
        currentVersion: 'v0.1.4-prealpha',
        releases: [release],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ver cambios' }));
    expect(screen.getByText('Bugfixes.')).toBeDefined();
  });

  it('shows downgrade confirmation when installing an older version', () => {
    render(<SettingsPage />);
    clickTab('Actualizaciones');
    dispatch('updater:available', {
      info: {
        currentVersion: 'v0.1.5-prealpha',
        releases: [{ ...release, tag_name: 'v0.1.4-prealpha' }],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Downgrade' }));
    expect(screen.getByText('Confirmar downgrade')).toBeDefined();
  });

  it('renders technical support section and diagnostics button', () => {
    render(<SettingsPage />);
    clickTab('Diagnóstico');
    expect(screen.getByRole('heading', { name: 'Inspector y paquete de diagnóstico' })).toBeDefined();
  });

  it('does not retain the legacy immediate diagnostics copy flow', () => {
    render(<SettingsPage />);
    clickTab('Diagnóstico');
    expect(runtimeMock.emit).not.toHaveBeenCalledWith('diagnostics:get');
    expect(runtimeMock.handlers.has('diagnostics')).toBe(false);
  });

  it('emits updater:install:verified (never legacy updater:install) when installing', () => {
    render(<SettingsPage />);
    clickTab('Actualizaciones');
    dispatch('updater:available', {
      info: {
        currentVersion: 'v0.1.4-prealpha',
        releases: [release],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Instalar' }));

    const legacyCalls = runtimeMock.emit.mock.calls.filter(
      (call: unknown[]) => call[0] === 'updater:install',
    );
    expect(legacyCalls).toHaveLength(0);

    expect(runtimeMock.emit).toHaveBeenCalledWith('updater:install:verified', release);
  });

  it('renders horizontal tab bar (no internal sidebar)', () => {
    render(<SettingsPage />);
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeDefined();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Cuenta',
      'Actualizaciones',
      'Hotkeys',
      'Diagnóstico',
    ]);
  });

  // TD-041: saving one setting must not wipe unrelated fields. The delta-mode
  // and cpuSampling variants of this test went with the Avanzado tab; saving
  // hotkeys is now the surviving path and carries the invariant alone -- it is
  // also the strongest case, because it writes the whole settings object.
  it('preserves activeOverlayProfileId when saving hotkeys (anti TD-041)', () => {
    render(<SettingsPage />);
    dispatch('settings', {
      deltaMode: 'self',
      cpuSampling: true,
      hotkeys: { toggleOverlay: 'ctrl+shift+v' },
      activeOverlayProfileId: 'must-survive-hotkeys',
    });
    clickTab('Hotkeys');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar atajos' }));
    const saveCalls = runtimeMock.emit.mock.calls.filter(
      (call: unknown[]) => call[0] === 'settings:save',
    );
    expect(saveCalls.length).toBeGreaterThanOrEqual(1);
    const payload = saveCalls[saveCalls.length - 1][1] as Record<string, unknown>;
    expect(payload.activeOverlayProfileId).toBe('must-survive-hotkeys');
  });

});
describe('SettingsPage i18n', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
    runtimeMock.handlers.clear();
    dispatch('settings', { deltaMode: 'lap', hotkeys: { toggleOverlay: '' } });
    dispatch('updater:settings', { settings: { channel: 'stable' } });
    dispatch('updater:available', { info: { currentVersion: '0.1.0', latestVersion: '0.1.1', available: false } });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('shows language selector in settings', () => {
    render(<SettingsPage />);
    expect(screen.getByTestId('language-selector')).toBeTruthy();
  });

  it('displays settings title in Spanish by default', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Ajustes')).toBeTruthy();
  });

  it('changes visible text when language is switched to Portuguese', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Ajustes')).toBeTruthy();
    const select = screen.getByTestId('language-selector') as HTMLSelectElement;
    select.value = 'pt';
    fireEvent.change(select);
    expect(screen.getByText('Configurações')).toBeTruthy();
  });

  it('persists language choice in localStorage', () => {
    render(<SettingsPage />);
    const select = screen.getByTestId('language-selector') as HTMLSelectElement;
    select.value = 'it';
    fireEvent.change(select);
    expect(localStorage.getItem('vantare.locale')).toBe('it');
  });
});
