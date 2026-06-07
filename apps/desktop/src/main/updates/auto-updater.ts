import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateInfo } from '@shared/types';

export class AutoUpdater {
  private initialized = false;

  init(): void {
    if (!app.isPackaged) return; // no-op en dev
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    this.initialized = true;
  }

  async checkForUpdates(): Promise<UpdateInfo | null> {
    if (!app.isPackaged || !this.initialized) return null;
    try {
      const result = await autoUpdater.checkForUpdates();
      if (!result || !result.updateInfo) return null;
      return {
        version: result.updateInfo.version,
        downloadUrl: '',
        releaseDate: result.updateInfo.releaseDate,
        releaseNotes: typeof result.updateInfo.releaseNotes === 'string' ? result.updateInfo.releaseNotes : undefined,
      };
    } catch {
      return null; // Graceful: network error, 404, etc.
    }
  }

  installUpdate(): void {
    if (!app.isPackaged) return;
    autoUpdater.quitAndInstall();
  }
}

export const autoUpdaterInstance = new AutoUpdater();
