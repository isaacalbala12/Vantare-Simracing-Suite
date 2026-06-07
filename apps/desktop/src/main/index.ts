import { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut } from 'electron';
import fs from 'node:fs';
import path from 'path';
import { registerIpcHandlers, setOverlayManager, setHttpServerRef } from './ipc/handlers';
import { OverlayManager } from './windows/overlay-manager';
import { HttpServer } from './server/http-server';
import { SimManager } from './sim/sim-manager';
import { loadEnv, setupSecureStorage, setupMachineId } from './auth/setup';
import { initAppStore, seedE2eDefaults, getStore } from './store';
import { autoUpdaterInstance } from './updates/auto-updater';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let overlayManager: OverlayManager;
let httpServer: HttpServer;
let simManager: SimManager;
let isQuitting = false;
let registeredShortcut: string | null = null;
const isDev = !app.isPackaged;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    frame: true,
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const builtRenderer = path.join(__dirname, '../renderer/index.html');
  const useBuiltRendererInDev =
    process.env.E2E_TEST === '1' || (isDev && fs.existsSync(builtRenderer) && process.env.USE_BUILT_RENDERER === '1');

  if (!isDev || useBuiltRendererInDev) {
    mainWindow.loadFile(builtRenderer);
  } else {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  }

  mainWindow.once('ready-to-show', () => {
    const settings = getStore().get('settings');
    if (settings.startMinimized) {
      mainWindow?.hide(); // App starts in tray only
    } else {
      mainWindow?.show();
    }
  });

  mainWindow.on('close', (event) => {
    if (process.env.E2E_TEST === '1') return;
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray(): void {
  const iconPath = path.join(__dirname, '../../docs/assets/icon.png');
  let trayIcon: Electron.NativeImage;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    if (trayIcon.isEmpty()) trayIcon = nativeImage.createEmpty();
  } catch {
    trayIcon = nativeImage.createEmpty();
  }
  tray = new Tray(trayIcon);
  updateTrayMenu();
  tray.setToolTip('Vantare Overlays');
  tray.on('double-click', () => mainWindow?.show());
}

function updateTrayMenu(): void {
  if (!tray) return;
  const recordingLabel = simManager?.isRecording() ? 'Stop Recording' : 'Start Recording';
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Vantare', click: () => mainWindow?.show() },
    { label: 'Hide Vantare', click: () => mainWindow?.hide() },
    { type: 'separator' },
    {
      label: 'Toggle Overlays',
      click: () => mainWindow?.webContents.send('system:toggle-visibility'),
    },
    { type: 'separator' },
    {
      label: recordingLabel,
      click: () => {
        if (simManager?.isRecording()) {
          simManager?.stopRecording();
        } else {
          simManager?.startRecording();
        }
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        mainWindow?.show();
        mainWindow?.webContents.send('navigate', '/settings');
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
}

function registerGlobalShortcuts(): void {
  const settings = getStore().get('settings');
  const shortcutKey = settings?.overlayVisibilityKey || 'Alt+H';
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut);
  }
  globalShortcut.register(shortcutKey, () => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win !== mainWindow) {
        if (win.isVisible()) win.hide();
        else win.show();
      }
    });
  });
  registeredShortcut = shortcutKey;
}

function updateGlobalShortcut(newKey: string): void {
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut);
  }
  globalShortcut.register(newKey, () => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win !== mainWindow) {
        if (win.isVisible()) win.hide();
        else win.show();
      }
    });
  });
  registeredShortcut = newKey;
}

function applyAutoStartSettings(): void {
  try {
    const settings = getStore().get('settings');
    app.setLoginItemSettings({
      openAtLogin: settings.autostart,
      path: app.getPath('exe'),
    });
  } catch {
    // Graceful: store may not be ready yet
  }
}

function updateAutoStart(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: app.getPath('exe'),
  });
}

app.whenReady().then(async () => {
  loadEnv();
  autoUpdaterInstance.init();
  setupSecureStorage();
  setupMachineId();
  await initAppStore();
  seedE2eDefaults();
  applyAutoStartSettings();
  registerGlobalShortcuts();
  registerIpcHandlers();
  overlayManager = new OverlayManager();
  httpServer = new HttpServer();
  setHttpServerRef(httpServer);
  await httpServer.start().catch(() => console.warn('HTTP Server disabled (port conflict)'));

  createMainWindow();
  createTray();

  simManager = new SimManager(mainWindow!);

  // Wire telemetry pipeline: SimManager → HttpServer → SSE clients
  httpServer.setSimManager(simManager);
  simManager.setBroadcastTelemetryFn((data) => httpServer.broadcastTelemetry(data));

  simManager.start();
  mainWindow!.webContents.on('did-finish-load', () => {
    simManager.reemitSimState();
  });
  setOverlayManager(overlayManager);
});

app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  httpServer?.stop();
  simManager?.stop();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') {
    app.quit();
  }
  // On Windows, app lives in tray
});
