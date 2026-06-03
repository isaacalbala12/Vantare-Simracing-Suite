import { app, ipcMain, BrowserWindow } from 'electron';
import Store from 'electron-store';
import { AuthService } from '@vantare/auth';
import type { Profile, Theme, Settings } from '@shared/types';
import type { SimManager } from '../sim/sim-manager';
import type { OverlayManager } from '../windows/overlay-manager';
import { MockSimFactory } from '@vantare/sim-core';
import type { SimInfo, SimType } from '@vantare/sim-core';

interface StoreSchema {
  settings: Settings;
  overlays: Record<string, unknown>;
  profiles: Profile[];
  activeProfileId: string | null;
  themes: Theme[];
  activeThemeId: string;
}

const store = new Store<StoreSchema>({
  defaults: {
    settings: {
      language: 'en',
      autostart: false,
      minimizeToTray: true,
      startMinimized: false,
      overlayVisibilityKey: 'Alt+H',
      preferredSim: 'auto',
      alertVolume: 0.8,
      alertEnabled: true,
      autoUpdate: true,
      updateChannel: 'stable',
      httpServerPort: 3200,
      networkAccess: false,
    },
    overlays: {},
    profiles: [],
    activeProfileId: null,
    themes: [],
    activeThemeId: 'dark',
  },
});

let simManagerRef: SimManager | null = null;
export function setSimManager(mgr: SimManager | null): void {
  simManagerRef = mgr;
}

let overlayManagerRef: OverlayManager | null = null;
export function setOverlayManager(mgr: OverlayManager | null): void {
  overlayManagerRef = mgr;
}

export function registerIpcHandlers(): void {
  ipcMain.handle('settings:get', () => store.get('settings'));
  ipcMain.handle('settings:save', (_, settings: Partial<Settings>) => {
    store.set('settings', { ...store.get('settings'), ...settings });
  });

  ipcMain.handle('profiles:get', () => store.get('profiles'));
  ipcMain.handle('profiles:get-active', () => {
    const profiles = store.get('profiles');
    const activeId = store.get('activeProfileId');
    return profiles.find((p) => p.id === activeId) || null;
  });
  ipcMain.handle('profiles:save', (_, profile: Profile) => {
    const profiles = [...store.get('profiles')];
    const idx = profiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) profiles[idx] = profile;
    else profiles.push(profile);
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

  ipcMain.handle('themes:get', () => store.get('themes'));
  ipcMain.handle('themes:get-active', () => {
    const themes = store.get('themes');
    const activeId = store.get('activeThemeId');
    return themes.find((t) => t.id === activeId) || null;
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
