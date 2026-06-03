import { BrowserWindow } from 'electron';
import path from 'path';

interface OverlayWindow {
  id: string;
  name: string;
  window: BrowserWindow | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class OverlayManager {
  private overlays: Map<string, OverlayWindow> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.registerOverlay('standings', 'Standings', 0, 0, 400, 600);
    this.registerOverlay('relative', 'Relative', 410, 0, 400, 600);
    this.registerOverlay('delta', 'Delta Bar', 0, 610, 400, 80);
    this.registerOverlay('stream-alerts', 'Stream Alerts', 410, 610, 400, 80);
  }

  registerOverlay(id: string, name: string, x: number, y: number, width: number, height: number): void {
    this.overlays.set(id, { id, name, window: null, x, y, width, height });
  }

  async show(id: string): Promise<void> {
    const overlay = this.overlays.get(id);
    if (!overlay) return;

    if (overlay.window) {
      overlay.window.show();
      return;
    }

    const win = new BrowserWindow({
      x: overlay.x,
      y: overlay.y,
      width: overlay.width,
      height: overlay.height,
      show: true,
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

    if (process.env.NODE_ENV === 'development') {
      win.loadURL(`http://localhost:3000/?overlay=${id}`);
    } else {
      win.loadFile(path.join(__dirname, '../renderer/index.html'), {
        query: { overlay: id },
      });
    }

    overlay.window = win;
  }

  hide(id: string): void {
    const overlay = this.overlays.get(id);
    overlay?.window?.hide();
  }

  setPosition(id: string, x: number, y: number): void {
    const overlay = this.overlays.get(id);
    if (overlay?.window) {
      overlay.window.setPosition(x, y);
      overlay.x = x;
      overlay.y = y;
    }
  }

  setSize(id: string, w: number, h: number): void {
    const overlay = this.overlays.get(id);
    if (overlay?.window) {
      overlay.window.setSize(w, h);
      overlay.width = w;
      overlay.height = h;
    }
  }

  getAll(): { id: string; name: string; visible: boolean; x: number; y: number; width: number; height: number }[] {
    return Array.from(this.overlays.values()).map((o) => ({
      id: o.id,
      name: o.name,
      visible: o.window !== null && !o.window.isDestroyed() && o.window.isVisible(),
      x: o.x,
      y: o.y,
      width: o.width,
      height: o.height,
    }));
  }

  destroy(): void {
    this.overlays.forEach((o) => {
      if (o.window && !o.window.isDestroyed()) {
        o.window.close();
      }
    });
    this.overlays.clear();
  }
}
