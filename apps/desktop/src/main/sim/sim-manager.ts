import { execSync } from 'child_process';
import { BrowserWindow } from 'electron';
import { MockSimFactory, SimNormalizer } from '@vantare/sim-core';
import type { MockProvider, Telemetry, SimType, SimAdapter } from '@vantare/sim-core';
import { createAdapter } from './adapters';

export type TelemetryCallback = (data: Telemetry) => void;

export class SimManager {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private telemetryInterval: ReturnType<typeof setInterval> | null = null;
  private onTelemetryCallback: TelemetryCallback | null = null;
  private broadcastTelemetryFn: ((data: Telemetry) => void) | null = null;
  private mockProvider: MockProvider | null = null;
  private normalizer: SimNormalizer = new SimNormalizer();
  private activeAdapter: SimAdapter | null = null;
  private latestTelemetry: Telemetry | null = null;
  public currentSim: string | null = null;
  private connected: boolean = false;
  private mainWindow: BrowserWindow | null = null;
  public isMockActive: boolean = false;

  constructor(mainWindow?: BrowserWindow) {
    this.mainWindow = mainWindow || null;
  }

  setOnTelemetryCallback(cb: TelemetryCallback): void {
    this.onTelemetryCallback = cb;
  }

  /** Register a function to broadcast telemetry (e.g. to SSE clients). */
  setBroadcastTelemetryFn(fn: (data: Telemetry) => void): void {
    this.broadcastTelemetryFn = fn;
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  start(): void {
    this.detectSim();
    this.pollInterval = setInterval(() => this.detectSim(), 2000);

    this.telemetryInterval = setInterval(() => {
      const data = this.getTelemetry();
      if (!data) return;

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('telemetry', data);
      }
      if (this.onTelemetryCallback) {
        this.onTelemetryCallback(data);
      }
      // Broadcast to HTTP SSE clients after each telemetry tick
      if (this.broadcastTelemetryFn) {
        this.broadcastTelemetryFn(data);
      }
    }, 62);
  }

  private detectSim(): void {
    const running = this.findRunningSims();
    if (running.length > 0) {
      this.activateSim(running[0]);
    } else {
      this.activateMock();
    }
  }

  private findRunningSims(): string[] {
    try {
      const output = execSync('tasklist /FO CSV /NH', {
        encoding: 'utf-8',
        timeout: 5000,
      });
      const sims: string[] = [];
      if (output.includes('iRacingSim64DX11.exe')) sims.push('iracing');
      if (output.includes('LeMansUltimate.exe')) sims.push('lmu');
      if (output.includes('acs.exe')) sims.push('ac');
      return sims;
    } catch {
      return [];
    }
  }

  private activateMock(): void {
    if (this.isMockActive) return;
    this.isMockActive = true;
    this.connected = true;
    this.currentSim = 'iracing';
    // Destroy real adapter when falling back to mock
    this.activeAdapter?.destroy();
    this.activeAdapter = null;
    this.latestTelemetry = null;
    this.mockProvider = MockSimFactory.create('iracing', 'race');
    this.emitSimState();
  }

  activateSim(simName: string): void {
    // Don't re-activate if already on this sim with a live adapter
    if (this.currentSim === simName && this.activeAdapter && this.connected) return;

    this.isMockActive = false;
    this.currentSim = simName;
    this.connected = true;

    // Destroy old adapter
    this.activeAdapter?.destroy();

    // Create and connect new adapter
    this.activeAdapter = createAdapter(simName);
    this.activeAdapter.onTelemetry((data) => {
      this.latestTelemetry = data;
      this.handleTelemetry(data);
    });
    this.activeAdapter.onConnectionState((state) => {
      if (state === 'connected') {
        this.connected = true;
      } else if (state === 'error' || state === 'disconnected') {
        console.warn(`Adapter ${simName} state: ${state}, falling back to mock`);
        this.activateMock();
      }
      this.emitSimState();
    });
    this.activeAdapter.connect().catch(() => {
      console.warn(`Failed to connect ${simName} adapter, falling back to mock`);
      this.activateMock();
    });
    this.emitSimState();
  }

  private emitSimState(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.mainWindow.webContents.send('sim-state', {
      connected: this.connected,
      name: this.currentSim,
      type: this.currentSim as SimType | null,
      isMock: this.isMockActive,
    });
  }

  private handleTelemetry(data: Telemetry): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('telemetry', data);
    }
    if (this.onTelemetryCallback) {
      this.onTelemetryCallback(data);
    }
    if (this.broadcastTelemetryFn) {
      this.broadcastTelemetryFn(data);
    }
  }

  private handleState(state: string): void {
    if (state === 'connected') {
      this.connected = true;
    } else if (state === 'error' || state === 'disconnected') {
      console.warn(`Adapter state: ${state}, falling back to mock`);
      this.activateMock();
    }
    this.emitSimState();
  }

  getTelemetry(): Telemetry | null {
    if (this.isMockActive && this.mockProvider) {
      const raw = this.mockProvider.getData();
      return this.normalizer.normalize(raw, (this.currentSim ?? 'iracing') as SimType);
    }
    return this.latestTelemetry;
  }

  stop(): void {
    this.activeAdapter?.destroy();
    this.activeAdapter = null;
    this.latestTelemetry = null;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }
    this.mockProvider = null;
  }
}