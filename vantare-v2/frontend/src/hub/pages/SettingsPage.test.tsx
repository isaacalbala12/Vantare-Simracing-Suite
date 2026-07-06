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
    expect(screen.getByLabelText('Solo releases estables')).toBeDefined();
    expect(screen.getByLabelText('Incluir pre-releases')).toBeDefined();
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
    expect(screen.getByRole('heading', { name: 'Soporte Técnico y Diagnósticos' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Copiar paquete de diagnóstico' })).toBeDefined();
  });

  it('shows Condiciones and Información when clicking Avanzado tab', () => {
    render(<SettingsPage />);
    clickTab('Avanzado');
    expect(screen.getByRole('heading', { name: 'Condiciones' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Información' })).toBeDefined();
    expect(screen.getByText('Modo delta')).toBeDefined();
    expect(screen.getByText('Monitorizar uso de CPU')).toBeDefined();
    expect(screen.getByText(/Versión actual:/)).toBeDefined();
    expect(screen.getByText(/Canal:/)).toBeDefined();
  });

  it('avanzado does not show old headings (Rendimiento, Modo delta as heading)', () => {
    render(<SettingsPage />);
    clickTab('Avanzado');
    expect(screen.queryByRole('heading', { name: 'Rendimiento' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Modo delta' })).toBeNull();
  });

  it('emits settings save when channel changes', () => {
    render(<SettingsPage />);
    dispatch('updater:settings', { settings: { channel: 'stable' } });
    clickTab('Actualizaciones');

    fireEvent.click(screen.getByLabelText('Incluir pre-releases'));

    expect(runtimeMock.emit).toHaveBeenCalledWith('updater:settings:save', {
      channel: 'prerelease',
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
    expect(screen.getByRole('heading', { name: 'Soporte Técnico y Diagnósticos' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Copiar paquete de diagnóstico' })).toBeDefined();
  });

  it('emits diagnostics:get when diagnostics button is clicked and shows success feedback on success', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<SettingsPage />);
    clickTab('Diagnóstico');

    const button = screen.getByRole('button', { name: 'Copiar paquete de diagnóstico' });
    fireEvent.click(button);

    expect(runtimeMock.emit).toHaveBeenCalledWith('diagnostics:get');

    act(() => {
      dispatch('diagnostics', { appVersion: 'v0.3.10.0', os: 'windows' });
    });

    expect(writeTextMock).toHaveBeenCalledWith(JSON.stringify({ appVersion: 'v0.3.10.0', os: 'windows' }, null, 2));
    expect(await screen.findByText('✓ ¡Copiado al Portapapeles!')).toBeDefined();
  });

  it('shows error feedback when diagnostics request fails', () => {
    render(<SettingsPage />);
    clickTab('Diagnóstico');

    const button = screen.getByRole('button', { name: 'Copiar paquete de diagnóstico' });
    fireEvent.click(button);

    act(() => {
      dispatch('diagnostics:error', { message: 'Failed to retrieve diagnostics' });
    });

    expect(screen.getByText('Failed to retrieve diagnostics')).toBeDefined();
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
    expect(tabs.length).toBeGreaterThanOrEqual(5);
    expect(tabs[0].textContent).toBe('Cuenta');
    expect(tabs[1].textContent).toBe('Actualizaciones');
    expect(tabs[2].textContent).toBe('Hotkeys');
    expect(tabs[3].textContent).toBe('Diagnóstico');
    expect(tabs[4].textContent).toBe('Avanzado');
  });

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

  it('preserves activeOverlayProfileId when changing delta mode (anti TD-041)', () => {
    render(<SettingsPage />);
    dispatch('settings', {
      deltaMode: 'self',
      cpuSampling: true,
      hotkeys: { toggleOverlay: 'ctrl+shift+v' },
      activeOverlayProfileId: 'must-survive-delta',
    });
    clickTab('Avanzado');
    fireEvent.click(screen.getByLabelText('Sesion (mejor vuelta de la sesion)'));
    const saveCalls = runtimeMock.emit.mock.calls.filter(
      (call: unknown[]) => call[0] === 'settings:save',
    );
    expect(saveCalls.length).toBeGreaterThanOrEqual(1);
    const payload = saveCalls[saveCalls.length - 1][1] as Record<string, unknown>;
    expect(payload.activeOverlayProfileId).toBe('must-survive-delta');
  });

  it('preserves activeOverlayProfileId when toggling cpuSampling (anti TD-041)', () => {
    render(<SettingsPage />);
    dispatch('settings', {
      deltaMode: 'self',
      cpuSampling: true,
      hotkeys: { toggleOverlay: 'ctrl+shift+v' },
      activeOverlayProfileId: 'must-survive-cpu',
    });
    clickTab('Avanzado');
    fireEvent.click(screen.getByText('Monitorizar uso de CPU'));
    const saveCalls = runtimeMock.emit.mock.calls.filter(
      (call: unknown[]) => call[0] === 'settings:save',
    );
    expect(saveCalls.length).toBeGreaterThanOrEqual(1);
    const payload = saveCalls[saveCalls.length - 1][1] as Record<string, unknown>;
    expect(payload.activeOverlayProfileId).toBe('must-survive-cpu');
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
