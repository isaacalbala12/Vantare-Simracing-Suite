import { contextBridge, ipcRenderer } from 'electron';
import type { Telemetry } from '@vantare/sim-core';

contextBridge.exposeInMainWorld('vantare', {
  onTelemetry: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('telemetry', handler);
    return () => ipcRenderer.removeListener('telemetry', handler);
  },
  onSessionData: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('session', handler);
    return () => ipcRenderer.removeListener('session', handler);
  },
  onSimState: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('sim-state', handler);
    return () => ipcRenderer.removeListener('sim-state', handler);
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
  getProfiles: () => ipcRenderer.invoke('profiles:get'),
  getActiveProfile: () => ipcRenderer.invoke('profiles:get-active'),
  saveProfile: (profile: unknown) => ipcRenderer.invoke('profiles:save', profile),
  deleteProfile: (id: string) => ipcRenderer.invoke('profiles:delete', id),
  setActiveProfile: (id: string) => ipcRenderer.invoke('profiles:set-active', id),
  importProfile: (json: string) => ipcRenderer.invoke('profiles:import', json),
  exportProfile: (id: string) => ipcRenderer.invoke('profiles:export', id),
  login: (email: string, password: string) => ipcRenderer.invoke('auth:login', email, password),
  register: (email: string, password: string) => ipcRenderer.invoke('auth:register', email, password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getSession: () => ipcRenderer.invoke('auth:session'),
  getLicenseStatus: () => ipcRenderer.invoke('auth:license-status'),
  getOverlayWindows: () => ipcRenderer.invoke('overlays:get-windows'),
  showOverlay: (overlayId: string) => ipcRenderer.invoke('overlays:show', overlayId),
  hideOverlay: (overlayId: string) => ipcRenderer.invoke('overlays:hide', overlayId),
  setOverlayPosition: (overlayId: string, x: number, y: number) =>
    ipcRenderer.invoke('overlays:set-position', overlayId, x, y),
  setOverlaySize: (overlayId: string, w: number, h: number) =>
    ipcRenderer.invoke('overlays:set-size', overlayId, w, h),
  setActiveSim: (simId: string) => ipcRenderer.invoke('setActiveSim', simId),
  getAvailableSims: () => ipcRenderer.invoke('getAvailableSims'),
  getActiveSim: () => ipcRenderer.invoke('sim:active'),
  onSimListChanged: (callback: (sims: string[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sims: string[]) => callback(sims);
    ipcRenderer.on('sim-list-changed', handler);
    return () => ipcRenderer.removeListener('sim-list-changed', handler);
  },
  startRecording: () => ipcRenderer.invoke('startRecording'),
  stopRecording: () => ipcRenderer.invoke('stopRecording'),
  isRecording: () => ipcRenderer.invoke('isRecording'),
  onRecordingStateChanged: (callback: (recording: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, recording: boolean) => callback(recording);
    ipcRenderer.on('recording-state-changed', handler);
    return () => ipcRenderer.removeListener('recording-state-changed', handler);
  },
  getInspectorData: () => ipcRenderer.invoke('getInspectorData'),
  onInspectorData: (callback: (data: Telemetry) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Telemetry) => callback(data);
    ipcRenderer.on('inspector-data', handler);
    return () => ipcRenderer.removeListener('inspector-data', handler);
  },
  getThemes: () => ipcRenderer.invoke('themes:get'),
  getActiveTheme: () => ipcRenderer.invoke('themes:get-active'),
  saveTheme: (theme: unknown) => ipcRenderer.invoke('themes:save', theme),
  setActiveTheme: (themeId: string) => ipcRenderer.invoke('themes:set-active', themeId),
  deleteTheme: (themeId: string) => ipcRenderer.invoke('themes:delete', themeId),
  getVersion: () => ipcRenderer.invoke('system:version'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  openExternal: (url: string) => ipcRenderer.invoke('system:open-external', url),
  toggleOverlayVisibility: () => ipcRenderer.invoke('system:toggle-visibility'),
  minimizeToTray: () => ipcRenderer.invoke('system:minimize-to-tray'),
});
