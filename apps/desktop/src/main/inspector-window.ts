import { app, BrowserWindow } from 'electron';
import path from 'path';
import type { Telemetry } from '@vantare/sim-core';
import type { SimManager } from './sim/sim-manager';

let inspectorWindow: BrowserWindow | null = null;
let simManagerRef: SimManager | null = null;
let broadcastInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Create or show the standalone Telemetry Inspector overlay window.
 * This is a transparent, frameless, always-on-top window that renders
 * the TelemetryInspector component in compact mode.
 */
export function createInspectorWindow(parentWindow?: BrowserWindow): BrowserWindow {
  if (inspectorWindow && !inspectorWindow.isDestroyed()) {
    inspectorWindow.show();
    inspectorWindow.focus();
    return inspectorWindow;
  }

  const isDev = !app.isPackaged;

  inspectorWindow = new BrowserWindow({
    width: 320,
    height: 600,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    inspectorWindow.loadURL('http://localhost:3000/?overlay=inspector');
  } else {
    inspectorWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      query: { overlay: 'inspector' },
    });
  }

  inspectorWindow.once('ready-to-show', () => {
    inspectorWindow?.show();
  });

  inspectorWindow.on('closed', () => {
    inspectorWindow = null;
    stopBroadcast();
  });

  // Start broadcasting telemetry to this window at ~16Hz
  if (simManagerRef) {
    startBroadcast();
  }

  return inspectorWindow;
}

/**
 * Close the inspector window if it is open.
 */
export function closeInspectorWindow(): void {
  if (inspectorWindow && !inspectorWindow.isDestroyed()) {
    inspectorWindow.close();
  }
  inspectorWindow = null;
  stopBroadcast();
}

/**
 * Toggle the inspector window visibility.
 */
export function toggleInspectorWindow(parentWindow?: BrowserWindow): void {
  if (inspectorWindow && !inspectorWindow.isDestroyed() && inspectorWindow.isVisible()) {
    inspectorWindow.hide();
  } else {
    createInspectorWindow(parentWindow);
  }
}

/**
 * Register the SimManager reference so the inspector can pull live telemetry.
 */
export function setInspectorSimManager(mgr: SimManager | null): void {
  simManagerRef = mgr;
  if (mgr && inspectorWindow && !inspectorWindow.isDestroyed()) {
    startBroadcast();
  } else {
    stopBroadcast();
  }
}

// ── Internal helpers ─────────────────────────────────────────────

function startBroadcast(): void {
  stopBroadcast();
  broadcastInterval = setInterval(() => {
    if (!inspectorWindow || inspectorWindow.isDestroyed() || !simManagerRef) {
      stopBroadcast();
      return;
    }
    const telem = simManagerRef.getTelemetry();
    if (telem) {
      try {
        inspectorWindow.webContents.send('inspector-data', telem);
      } catch {
        // Window might be closing
      }
    }
  }, 62); // ~16Hz
}

function stopBroadcast(): void {
  if (broadcastInterval !== null) {
    clearInterval(broadcastInterval);
    broadcastInterval = null;
  }
}
