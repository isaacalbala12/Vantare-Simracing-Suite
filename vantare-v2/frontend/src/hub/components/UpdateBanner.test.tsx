import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateBanner } from './UpdateBanner';

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

function dispatch(name: string, data: unknown) {
  act(() => {
    for (const handler of runtimeMock.handlers.get(name) ?? []) {
      handler({ data });
    }
  });
}

const notifyData = {
  tag: 'v0.1.5-prealpha',
  name: 'v0.1.5',
  prerelease: true,
  downloadURL: 'https://example.com/installer.exe',
};

const releaseForTag = {
  tag_name: 'v0.1.5-prealpha',
  name: 'v0.1.5',
  prerelease: true,
  assets: [
    {
      name: 'vantare-amd64-installer.exe',
      browser_download_url: 'https://example.com/installer.exe',
    },
    {
      name: 'vantare-amd64-installer.exe.sha256',
      browser_download_url: 'https://example.com/installer.exe.sha256',
    },
  ],
};

describe('UpdateBanner', () => {
  beforeEach(() => {
    runtimeMock.handlers.clear();
    runtimeMock.emit.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when no notification', () => {
    render(<UpdateBanner />);
    expect(screen.queryByText(/Nueva versión disponible/)).toBeNull();
  });

  it('shows banner on updater:notify', () => {
    render(<UpdateBanner />);
    dispatch('updater:notify', notifyData);

    expect(screen.getByText('v0.1.5-prealpha')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Instalar actualización' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Saltar' })).toBeDefined();
  });

  it('does not render a direct download link', () => {
    render(<UpdateBanner />);
    dispatch('updater:notify', notifyData);

    expect(screen.queryByRole('link', { name: 'Descargar' })).toBeNull();
  });

  it('emits updater:check on install click', () => {
    render(<UpdateBanner />);
    dispatch('updater:notify', notifyData);

    screen.getByRole('button', { name: 'Instalar actualización' }).click();
    expect(runtimeMock.emit).toHaveBeenCalledWith('updater:check');
  });

  it('emits updater:install:verified when updater:available returns matching release', () => {
    render(<UpdateBanner />);
    dispatch('updater:notify', notifyData);

    screen.getByRole('button', { name: 'Instalar actualización' }).click();
    expect(runtimeMock.emit).toHaveBeenCalledWith('updater:check');

    dispatch('updater:available', {
      info: {
        currentVersion: 'v0.1.4',
        latestRelease: releaseForTag,
        releases: [releaseForTag],
      },
    });

    expect(runtimeMock.emit).toHaveBeenCalledWith(
      'updater:install:verified',
      releaseForTag,
    );
  });

  it('does not emit updater:install:legacy at any point', () => {
    render(<UpdateBanner />);
    dispatch('updater:notify', notifyData);

    screen.getByRole('button', { name: 'Instalar actualización' }).click();
    dispatch('updater:available', {
      info: {
        currentVersion: 'v0.1.4',
        latestRelease: releaseForTag,
        releases: [releaseForTag],
      },
    });

    const legacyCalls = runtimeMock.emit.mock.calls.filter(
      (call: unknown[]) => call[0] === 'updater:install',
    );
    expect(legacyCalls).toHaveLength(0);
  });

  it('shows progress when updater:progress fires', () => {
    render(<UpdateBanner />);
    dispatch('updater:notify', notifyData);

    screen.getByRole('button', { name: 'Instalar actualización' }).click();
    dispatch('updater:available', {
      info: {
        currentVersion: 'v0.1.4',
        latestRelease: releaseForTag,
        releases: [releaseForTag],
      },
    });

    dispatch('updater:progress', { percent: 42 });
    const progressElements = screen.getAllByText('42%');
    expect(progressElements.length).toBeGreaterThanOrEqual(1);
    expect(progressElements.some((el) => el.tagName === 'SPAN')).toBe(true);
  });

  it('shows error when updater:error fires', () => {
    render(<UpdateBanner />);
    dispatch('updater:notify', notifyData);

    screen.getByRole('button', { name: 'Instalar actualización' }).click();
    dispatch('updater:error', { message: 'Checksum mismatch' });

    expect(screen.getByText('Checksum mismatch')).toBeDefined();
  });

  it('shows error when updater:available has no matching release', async () => {
    render(<UpdateBanner />);
    dispatch('updater:notify', notifyData);

    act(() => {
      screen.getByRole('button', { name: 'Instalar actualización' }).click();
    });

    act(() => {
      dispatch('updater:available', {
        info: {
          currentVersion: 'v0.1.6',
          releases: [{ ...releaseForTag, tag_name: 'v0.1.6' }],
        },
      });
    });

    expect(await screen.findByText('No se encontró la versión solicitada.')).toBeDefined();
  });

  it('emits updater:ignore when skipping', () => {
    render(<UpdateBanner />);
    dispatch('updater:notify', notifyData);

    screen.getByRole('button', { name: 'Saltar' }).click();
    expect(runtimeMock.emit).toHaveBeenCalledWith('updater:ignore', {
      version: 'v0.1.5-prealpha',
    });
  });

  it('does not install when skipping while update check is pending', () => {
    render(<UpdateBanner />);
    dispatch('updater:notify', notifyData);

    screen.getByRole('button', { name: 'Instalar actualización' }).click();
    screen.getByRole('button', { name: 'Saltar' }).click();

    dispatch('updater:available', {
      info: {
        currentVersion: 'v0.1.4',
        latestRelease: releaseForTag,
        releases: [releaseForTag],
      },
    });

    expect(runtimeMock.emit).toHaveBeenCalledWith('updater:ignore', {
      version: 'v0.1.5-prealpha',
    });
    const verifiedCalls = runtimeMock.emit.mock.calls.filter(
      (call: unknown[]) => call[0] === 'updater:install:verified',
    );
    expect(verifiedCalls).toHaveLength(0);
  });

  it('re-enables install button after error', () => {
    render(<UpdateBanner />);
    dispatch('updater:notify', notifyData);

    screen.getByRole('button', { name: 'Instalar actualización' }).click();
    dispatch('updater:error', { message: 'Download failed' });

    expect(screen.getByRole('button', { name: 'Instalar actualización' })).toBeDefined();
    expect((screen.getByRole('button', { name: 'Instalar actualización' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
