import { app, ipcMain, BrowserWindow, globalShortcut } from 'electron';
import { AuthService } from '@vantare/auth';
import { builtInThemes } from '@vantare/ui-core/themes';
import type { Profile, Theme, Settings, UpdateInfo } from '@shared/types';
import { setupAuth } from '../auth/setup';
import { getStore } from '../store';
import type { SimManager } from '../sim/sim-manager';
import type { OverlayManager } from '../windows/overlay-manager';
import type { HttpServer } from '../server/http-server';
import { MockSimFactory } from '@vantare/sim-core';
import type { SimInfo, SimType, Telemetry } from '@vantare/sim-core';
import { ProfileSchema } from '@vantare/ui-core/schemas';

function getAllThemes(): Theme[] {
  const store = getStore();
  const custom = store.get('themes');
  const builtInIds = new Set(builtInThemes.map((theme) => theme.id));
  const customThemes = custom.filter((theme) => !builtInIds.has(theme.id));
  return [...builtInThemes, ...customThemes];
}

let simManagerRef: SimManager | null = null;
export function setSimManager(mgr: SimManager | null): void {
  simManagerRef = mgr;
}

let overlayManagerRef: OverlayManager | null = null;
export function setOverlayManager(mgr: OverlayManager | null): void {
  overlayManagerRef = mgr;
}

let httpServerRef: HttpServer | null = null;
export function setHttpServerRef(server: HttpServer | null): void {
  httpServerRef = server;
}

export function registerIpcHandlers(): void {
  const store = getStore();
  setupAuth({
    get: async () => store.get('licenseCache'),
    set: async (cache) => store.set('licenseCache', cache),
    clear: async () => store.set('licenseCache', null),
  });

  ipcMain.handle('settings:get', () => store.get('settings'));
  ipcMain.handle('settings:save', (_, settings: Partial<Settings>) => {
    const current = store.get('settings');
    const merged = { ...current, ...settings };
    store.set('settings', merged);

    // Propagate relevant settings changes
    if ('autostart' in settings) {
      app.setLoginItemSettings({
        openAtLogin: settings.autostart,
        path: app.getPath('exe'),
      });
    }
    if ('overlayVisibilityKey' in settings && settings.overlayVisibilityKey) {
      const oldKey = current.overlayVisibilityKey;
      if (oldKey) globalShortcut.unregister(oldKey);
      globalShortcut.register(settings.overlayVisibilityKey, () => {
        BrowserWindow.getAllWindows().forEach((win) => {
          if (win.isVisible()) win.hide();
          else win.show();
        });
      });
    }
    if ('httpServerPort' in settings || 'networkAccess' in settings) {
      httpServerRef?.restart();
    }
  });

  ipcMain.handle('profiles:get', () => store.get('profiles'));
  ipcMain.handle('profiles:get-active', () => {
    const profiles = store.get('profiles');
    const activeId = store.get('activeProfileId');
    return profiles.find((p) => p.id === activeId) || null;
  });
  ipcMain.handle('profiles:save', (_, profile: Profile) => {
    const parsed = ProfileSchema.parse(profile);
    const profiles = [...store.get('profiles')];
    const idx = profiles.findIndex((p) => p.id === parsed.id);
    if (idx >= 0) profiles[idx] = parsed;
    else profiles.push(parsed);
    store.set('profiles', profiles);
  });
  ipcMain.handle('profiles:delete', (_, id: string) => {
    const profiles = store.get('profiles');
    store.set('profiles', profiles.filter((p) => p.id !== id));
  });
  ipcMain.handle('profiles:set-active', (_, id: string) => {
    store.set('activeProfileId', id);
  });
  ipcMain.handle('profiles:import', (_, json: string) => {
    const profile = JSON.parse(json) as Profile;
    const profiles = [...store.get('profiles')];
    profiles.push(profile);
    store.set('profiles', profiles);
    return profile;
  });
  ipcMain.handle('profiles:export', (_, id: string) => {
    const profiles = store.get('profiles');
    const profile = profiles.find((p) => p.id === id);
    return JSON.stringify(profile, null, 2);
  });

  ipcMain.handle('auth:login', async (_, email: string, password: string) => AuthService.login(email, password));
  ipcMain.handle('auth:register', async (_, email: string, password: string) => AuthService.register(email, password));
  ipcMain.handle('auth:logout', async () => { await AuthService.logout(); });
  ipcMain.handle('auth:session', async () => AuthService.getSession());
  ipcMain.handle('auth:license-status', async () => AuthService.getLicenseStatus());

  ipcMain.handle('system:version', () => app.getVersion());

  // Sim detection handlers
  ipcMain.handle('sim:available', (): SimInfo[] => {
    const mgr = simManagerRef;
    if (!mgr) return [];
    const allSims = MockSimFactory.getAvailableSims();
    return allSims.map((s) => ({
      ...s,
      available: mgr.isMockActive || mgr.currentSim === s.id,
    }));
  });

  ipcMain.handle('sim:active', (): SimType | null => {
    const mgr = simManagerRef;
    if (!mgr) return null;
    return mgr.currentSim as SimType | null;
  });

  // Sim switching
  ipcMain.handle('setActiveSim', (_, simId: string) => {
    simManagerRef?.activateSim(simId);
  });

  ipcMain.handle('getAvailableSims', (): string[] => {
    return ['iracing', 'lmu', 'ac'];
  });

  // Recording
  ipcMain.handle('startRecording', (): string | null => {
    const mgr = simManagerRef;
    return mgr?.startRecording() ?? null;
  });

  ipcMain.handle('stopRecording', (): string | null => {
    const mgr = simManagerRef;
    return mgr?.stopRecording() ?? null;
  });

  ipcMain.handle('isRecording', (): boolean => {
    return simManagerRef?.isRecording() ?? false;
  });

  // Inspector
  ipcMain.handle('getInspectorData', (): Telemetry | null => {
    return simManagerRef?.getTelemetry() ?? null;
  });

  // Mock mode handlers
  ipcMain.handle('sim:get-mock-status', () => {
    if (!simManagerRef) return { active: false, simName: null, scenario: null };
    return {
      active: simManagerRef.isMockActive,
      simName: simManagerRef.currentSim,
      scenario: 'race',
    };
  });

  ipcMain.handle('system:open-external', (_, url: string) => {
    import('electron').then(({ shell }) => shell.openExternal(url));
  });
  ipcMain.handle('system:minimize-to-tray', () => {
    BrowserWindow.getAllWindows().forEach((w) => w.hide());
  });

  // Updates
  ipcMain.handle('updates:check', async (): Promise<UpdateInfo | null> => {
    const updater = new (require('../updates/auto-updater').AutoUpdater)();
    return updater.checkForUpdates();
  });
  ipcMain.handle('updates:install', () => {
    const updater = new (require('../updates/auto-updater').AutoUpdater)();
    updater.installUpdate();
  });

  // System - toggle overlay visibility
  ipcMain.handle('system:toggle-visibility', (): boolean => {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows[0];
    const overlayWindows = windows.slice(1);
    const anyOverlayVisible = overlayWindows.some((w) => w.isVisible());
    if (anyOverlayVisible) {
      overlayWindows.forEach((w) => w.hide());
      return false;
    } else {
      mainWindow?.show();
      return true;
    }
  });

  ipcMain.handle('themes:get', () => getAllThemes());
  ipcMain.handle('themes:get-active', () => {
    const activeId = store.get('activeThemeId');
    return getAllThemes().find((t) => t.id === activeId) ?? builtInThemes.find((t) => t.id === 'dark') ?? null;
  });
  ipcMain.handle('themes:save', (_, theme: Theme) => {
    const themes = [...store.get('themes')];
    const idx = themes.findIndex((t) => t.id === theme.id);
    if (idx >= 0) themes[idx] = theme;
    else themes.push(theme);
    store.set('themes', themes);
  });
  ipcMain.handle('themes:set-active', (_, themeId: string) => store.set('activeThemeId', themeId));
  ipcMain.handle('themes:delete', (_, themeId: string) => {
    const themes = store.get('themes');
    store.set('themes', themes.filter((t) => t.id !== themeId));
  });

  // Overlay handlers
  ipcMain.handle('overlays:get-windows', () => {
    const mgr = overlayManagerRef;
    if (!mgr) return [];
    return mgr.getAll();
  });
  ipcMain.handle('overlays:show', (_, id: string) => {
    const mgr = overlayManagerRef;
    if (!mgr) return;
    mgr.show(id);
  });
  ipcMain.handle('overlays:hide', (_, id: string) => {
    const mgr = overlayManagerRef;
    if (!mgr) return;
    mgr.hide(id);
  });
  ipcMain.handle('overlays:set-position', (_, id: string, x: number, y: number) => {
    const mgr = overlayManagerRef;
    if (!mgr) return;
    mgr.setPosition(id, x, y);
  });
  ipcMain.handle('overlays:set-size', (_, id: string, w: number, h: number) => {
    const mgr = overlayManagerRef;
    if (!mgr) return;
    mgr.setSize(id, w, h);
  });
}
