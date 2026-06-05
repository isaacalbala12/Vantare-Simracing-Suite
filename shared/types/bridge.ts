import type { Telemetry, Session, SimState, SimType } from '@vantare/sim-core';
import type { Settings } from './settings';
import type { Profile } from './profile';
import type { Theme } from './theme';
import type { AuthResult, LicenseStatus } from '@vantare/auth';

export interface VantareBridge {
  // Telemetry
  onTelemetry(callback: (data: Telemetry) => void): () => void;
  onSessionData(callback: (data: Session) => void): () => void;
  onSimState(callback: (state: SimState) => void): () => void;

  // Settings
  getSettings(): Promise<Settings>;
  saveSettings(settings: Partial<Settings>): Promise<void>;

  // Profiles
  getProfiles(): Promise<Profile[]>;
  getActiveProfile(): Promise<Profile | null>;
  saveProfile(profile: Profile): Promise<void>;
  deleteProfile(id: string): Promise<void>;
  setActiveProfile(id: string): Promise<void>;
  importProfile(json: string): Promise<Profile>;
  exportProfile(id: string): Promise<string>;

  // Auth
  login(email: string, password: string): Promise<AuthResult>;
  register(email: string, password: string): Promise<AuthResult>;
  logout(): Promise<void>;
  getSession(): Promise<AuthResult['user'] | null>;
  getLicenseStatus(): Promise<LicenseStatus>;

  // Overlays
  getOverlayWindows(): Promise<OverlayWindowInfo[]>;
  showOverlay(overlayId: string): Promise<void>;
  hideOverlay(overlayId: string): Promise<void>;
  setOverlayPosition(overlayId: string, x: number, y: number): Promise<void>;
  setOverlaySize(overlayId: string, w: number, h: number): Promise<void>;

  // Sim
  getAvailableSims(): Promise<string[]>;
  getActiveSim(): Promise<SimType | null>;
  setActiveSim(simId: string): Promise<void>;
  onSimListChanged(callback: (sims: string[]) => void): () => void;

  // Recording
  startRecording(): Promise<void>;
  stopRecording(): Promise<string | null>;
  isRecording(): Promise<boolean>;
  onRecordingStateChanged(callback: (recording: boolean) => void): () => void;

  // Inspector
  getInspectorData(): Promise<Telemetry | null>;
  onInspectorData(callback: (data: Telemetry) => void): () => void;

  // Themes
  getThemes(): Promise<Theme[]>;
  getActiveTheme(): Promise<Theme | null>;
  saveTheme(theme: Theme): Promise<void>;
  setActiveTheme(themeId: string): Promise<void>;
  deleteTheme(themeId: string): Promise<void>;

  // System
  getVersion(): Promise<string>;
  checkForUpdates(): Promise<UpdateInfo | null>;
  installUpdate(): Promise<void>;
  openExternal(url: string): Promise<void>;
  toggleOverlayVisibility(): Promise<void>;
  minimizeToTray(): Promise<void>;
}

export interface OverlayWindowInfo {
  id: string;
  name: string;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UpdateInfo {
  version: string;
  downloadUrl: string;
  releaseDate: string;
  releaseNotes?: string;
}

declare global {
  interface Window {
    vantare: VantareBridge;
  }
}
