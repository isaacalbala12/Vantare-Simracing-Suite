import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

describe('SettingsPage', () => {
  beforeEach(() => {
    runtimeMock.handlers.clear();
    runtimeMock.emit.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders header and channel options', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { name: 'Ajustes' })).toBeDefined();
    expect(screen.getByLabelText('Solo releases estables')).toBeDefined();
    expect(screen.getByLabelText('Incluir pre-releases')).toBeDefined();
  });

  it('emits settings save when channel changes', () => {
    render(<SettingsPage />);
    dispatch('updater:settings', { settings: { channel: 'stable' } });

    fireEvent.click(screen.getByLabelText('Incluir pre-releases'));

    expect(runtimeMock.emit).toHaveBeenCalledWith('updater:settings:save', {
      channel: 'prerelease',
    });
  });

  it('displays available releases and marks current version', () => {
    render(<SettingsPage />);
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
    dispatch('updater:available', {
      info: {
        currentVersion: 'v0.1.5-prealpha',
        releases: [{ ...release, tag_name: 'v0.1.4-prealpha' }],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Downgrade' }));
    expect(screen.getByText('Confirmar downgrade')).toBeDefined();
  });

  it('displays the active profile ID in the OBS setup URL and falls back to example-racing.json', () => {
    render(<SettingsPage />);

    // Fallback initially
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    const input = inputs.find((i) => i.readOnly || i.value.includes('/overlay'));
    expect(input).toBeDefined();
    expect(input!.value).toContain('profile=example-racing.json');
    expect(input!.value).not.toContain('profile=v0.1.');
    expect(input!.value).not.toContain('profile=default-racing');

    // Simulate active profile load
    dispatch('profile:loaded', {
      profile: {
        id: 'my-custom-profile',
      },
    });

    const inputsAfter = screen.getAllByRole('textbox') as HTMLInputElement[];
    const inputAfter = inputsAfter.find((i) => i.readOnly || i.value.includes('/overlay'));
    expect(inputAfter).toBeDefined();
    expect(inputAfter!.value).toContain('my-custom-profile');
    expect(inputAfter!.value).not.toContain('profile=example-racing.json');
    expect(inputAfter!.value).not.toContain('profile=default-racing');
  });

  it('renders technical support section and diagnostics button', () => {
    render(<SettingsPage />);
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

    const button = screen.getByRole('button', { name: 'Copiar paquete de diagnóstico' });
    fireEvent.click(button);

    act(() => {
      dispatch('diagnostics:error', { message: 'Failed to retrieve diagnostics' });
    });

    expect(screen.getByText('Failed to retrieve diagnostics')).toBeDefined();
  });

  it('renders AccountSettings inside the settings page', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { name: 'Cuenta' })).toBeDefined();
  });

  it('emits updater:install:verified (never legacy updater:install) when installing', () => {
    render(<SettingsPage />);
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
});
