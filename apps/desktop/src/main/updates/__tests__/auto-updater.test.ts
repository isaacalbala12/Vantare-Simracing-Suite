import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- hoisted mocks (vi.mock factories are hoisted, so these must be too) ----
const mockIsPackaged = vi.hoisted(() => ({ value: false }));

const mockAutoUpdater = vi.hoisted(() => ({
  autoDownload: false,
  autoInstallOnAppQuit: false,
  checkForUpdates: vi.fn<() => Promise<unknown>>(),
  quitAndInstall: vi.fn(),
}));

// ---- module-level mocks ----
vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn().mockReturnValue('1.0.0'),
    get isPackaged() {
      return mockIsPackaged.value;
    },
  },
}));

vi.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater,
}));

// ---- import after mocks ----
import { AutoUpdater } from '../auto-updater';

describe('AutoUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPackaged.value = false;
    mockAutoUpdater.autoDownload = false;
    mockAutoUpdater.autoInstallOnAppQuit = false;
  });

  // ---- init() ----

  it('init() is no-op when app.isPackaged is false', () => {
    const updater = new AutoUpdater();
    updater.init();
    expect(mockAutoUpdater.autoDownload).toBe(false);
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(false);
  });

  // ---- checkForUpdates() ----

  it('checkForUpdates() returns null in dev mode (no network call)', async () => {
    const updater = new AutoUpdater();
    const result = await updater.checkForUpdates();
    expect(result).toBeNull();
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('checkForUpdates() returns null on network errors (graceful)', async () => {
    mockIsPackaged.value = true;
    mockAutoUpdater.checkForUpdates.mockRejectedValue(new Error('Network error'));
    const updater = new AutoUpdater();
    updater.init(); // required to set this.initialized = true
    const result = await updater.checkForUpdates();
    expect(result).toBeNull();
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('checkForUpdates() returns UpdateInfo when successful', async () => {
    mockIsPackaged.value = true;
    const mockUpdateInfo = {
      version: '2.0.0',
      releaseDate: '2025-06-01T00:00:00Z',
      releaseNotes: 'Bug fixes and improvements',
    };
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      updateInfo: mockUpdateInfo,
    });
    const updater = new AutoUpdater();
    updater.init();
    const result = await updater.checkForUpdates();
    expect(result).toEqual({
      version: '2.0.0',
      downloadUrl: '',
      releaseDate: '2025-06-01T00:00:00Z',
      releaseNotes: 'Bug fixes and improvements',
    });
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  // ---- installUpdate() ----

  it('installUpdate() calls autoUpdater.quitAndInstall()', () => {
    mockIsPackaged.value = true;
    const updater = new AutoUpdater();
    updater.installUpdate();
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('installUpdate() is no-op in dev mode', () => {
    const updater = new AutoUpdater();
    updater.installUpdate();
    expect(mockAutoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });
});
