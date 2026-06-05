import * as koffi from 'koffi';
import type { SimAdapter, Telemetry } from '@vantare/sim-core';
import { SimNormalizer } from '@vantare/sim-core';
import { LMU_OBJECT_OUT_SIZE } from '@vantare/sim-core/lmu-offsets';
import { parseLMUObjectOut } from '@vantare/sim-core/lmu-parser';
import { LMURestClient } from './lmu-rest-client';

const FILE_MAP_READ = 0x0004;
const MEMORY_NAME = 'LMU_Data';
const POLL_INTERVAL_MS = 1000 / 60;

export class LMUAdapterV2 implements SimAdapter {
  readonly name = 'lmu';
  readonly displayName = 'Le Mans Ultimate';
  private normalizer = new SimNormalizer();
  private telemetryCallback?: (data: Telemetry) => void;
  private sessionCallback?: (data: Telemetry) => void;
  private connectionCallback?: (state: string) => void;
  private pollInterval?: ReturnType<typeof setInterval>;
  private lib?: ReturnType<typeof koffi.load>;
  private OpenFileMappingW!: ReturnType<ReturnType<typeof koffi.load>['func']>;
  private MapViewOfFile!: ReturnType<ReturnType<typeof koffi.load>['func']>;
  private UnmapViewOfFile!: ReturnType<ReturnType<typeof koffi.load>['func']>;
  private CloseHandle!: ReturnType<ReturnType<typeof koffi.load>['func']>;
  private hMapFile?: bigint;
  private pBuf?: Buffer;
  private connected = false;
  private restClient = new LMURestClient();

  isAvailable(): boolean { return true; }

  async connect(): Promise<void> {
    try {
      this.lib ??= koffi.load('kernel32.dll');
      this.OpenFileMappingW = this.lib.func('void* OpenFileMappingW(uint32, bool, string)');
      this.MapViewOfFile = this.lib.func('void* MapViewOfFile(void*, uint32, uint32, uint32, size_t)');
      this.UnmapViewOfFile = this.lib.func('bool UnmapViewOfFile(void*)');
      this.CloseHandle = this.lib.func('bool CloseHandle(void*)');

      await this.openSharedMemory();
      this.connected = true;
      this.restClient.start();
      this.connectionCallback?.('connected');
      this.startPolling();
    } catch (err) {
      console.error('LMU adapter v2 connect error:', err);
      this.connectionCallback?.('error');
      throw err;
    }
  }

  disconnect(): void {
    this.stopPolling();
    this.restClient.stop();
    this.closeSharedMemory();
    this.connected = false;
    this.connectionCallback?.('disconnected');
  }

  onTelemetry(callback: (data: Telemetry) => void): () => void {
    this.telemetryCallback = callback;
    return () => { this.telemetryCallback = undefined; };
  }

  onSessionData(callback: (data: Telemetry) => void): () => void {
    this.sessionCallback = callback;
    return () => { this.sessionCallback = undefined; };
  }

  onConnectionState(callback: (state: string) => void): () => void {
    this.connectionCallback = callback;
    return () => { this.connectionCallback = undefined; };
  }

  destroy(): void {
    this.disconnect();
    this.telemetryCallback = undefined;
    this.sessionCallback = undefined;
    this.connectionCallback = undefined;
  }

  private async openSharedMemory(): Promise<void> {
    const hMap = this.OpenFileMappingW(FILE_MAP_READ, false, MEMORY_NAME);
    if (!hMap) {
      throw new Error('LMU shared memory (LMU_Data) not found. Is LMU running?');
    }
    this.hMapFile = hMap;

    const pBuf = this.MapViewOfFile(hMap, FILE_MAP_READ, 0, 0, LMU_OBJECT_OUT_SIZE);
    if (!pBuf) {
      this.CloseHandle(hMap);
      throw new Error('Failed to map LMU shared memory view');
    }

    const view = koffi.view(pBuf, LMU_OBJECT_OUT_SIZE);
    this.pBuf = Buffer.from(view);
  }

  private closeSharedMemory(): void {
    try {
      if (this.pBuf && this.hMapFile) {
        this.UnmapViewOfFile(this.pBuf);
        this.CloseHandle(this.hMapFile);
        this.pBuf = undefined;
        this.hMapFile = undefined;
      }
    } catch (err) {
      console.error('Error closing LMU shared memory:', err);
    }
  }

  private startPolling(): void {
    this.pollInterval = setInterval(() => {
      if (this.pBuf && this.connected) {
        try {
          const parsed = parseLMUObjectOut(this.pBuf);
          if (!parsed) return;

          // Merge REST data
          const brakeWear = this.restClient.getBrakeWear();
          if (brakeWear.length === 4 && parsed.wheels) {
            for (let i = 0; i < 4; i++) {
              parsed.wheels[i]["brakeWear"] = brakeWear[i];
            }
          }

          // Build the flat Record for the normalizer
          const raw = this.buildNormalizerInput(parsed);
          if (raw) {
            const telemetry = this.normalizer.normalize(raw, 'lmu');
            this.telemetryCallback?.(telemetry);
          }
        } catch (err) {
          console.error('Error polling LMU shared memory:', err);
        }
      }
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }

  private buildNormalizerInput(parsed: {
    session: Record<string, unknown> | null;
    playerTelemetry: Record<string, unknown> | null;
    vehicles: Record<string, unknown>[];
    wheels: Record<string, unknown>[] | null;
    generic: Record<string, unknown> | null;
  }): Record<string, unknown> | null {
    if (!parsed.playerTelemetry) return null;

    const pt = parsed.playerTelemetry;
    const sess = parsed.session ?? {};
    const result: Record<string, unknown> = {};

    // Player fields
    result["speed"] = pt["speed"];
    result["rpm"] = pt["engineRpm"];
    result["gear"] = pt["gear"];
    result["throttle"] = pt["throttle"];
    result["brake"] = pt["brake"];
    result["clutch"] = pt["clutch"];
    result["steer"] = pt["steering"];
    result["position"] = parsed.vehicles[0]?.["place"] ?? 0;
    result["classPosition"] = parsed.vehicles[0]?.["classPosition"] ?? 0;
    result["lapDistance"] = parsed.vehicles[0]?.["lapDist"] ?? 0;

    // Lap container (what extractLMU expects)
    result["lap"] = {
      current: parsed.vehicles[0]?.["totalLaps"] ?? 0,
      total: sess["totalLaps"] ?? 0,
      lastTime: (parsed.vehicles[0]?.["lastLapTime"] as number ?? 0) * 1000,
      bestTime: (parsed.vehicles[0]?.["bestLapTime"] as number ?? 0) * 1000,
      sector: parsed.vehicles[0]?.["sector"] ?? 0,
      sectorTimes: [],
      estimatedLaptime: (parsed.vehicles[0]?.["estimatedLapTime"] as number ?? 0),
      delta: pt["deltaBest"] as number ?? 0,
      isPersonalBest: false,
      isSessionBest: false,
    };

    result["sessionTime"] = sess["sessionTime"];
    result["sessionTimeRemain"] = sess["sessionTimeRemain"];
    result["sessionType"] = String(sess["sessionType"] ?? "");
    result["sessionState"] = String(sess["gamePhase"] ?? "");
    result["totalLaps"] = sess["totalLaps"] ?? 0;
    result["trackName"] = sess["trackName"] ?? "";
    result["trackLength"] = sess["trackLength"] ?? 0;

    result["driverName"] = parsed.vehicles[0]?.["driverName"] ?? "";
    result["carNumber"] = "";
    result["teamName"] = "";

    // Engine
    result["fuel"] = pt["fuel"];
    result["fuelMax"] = pt["fuelCapacity"];
    result["fuelPressure"] = 0;
    result["engineWaterTemp"] = pt["engineWaterTemp"];
    result["engineOilTemp"] = pt["engineOilTemp"];
    result["engineOilPressure"] = 0;
    result["maxRpm"] = pt["engineMaxRPM"];
    result["engineWarnings"] = 0;

    // Weather
    result["ambientTemp"] = sess["ambientTemp"];
    result["trackTemp"] = sess["trackTemp"];
    result["humidity"] = 0;
    result["rainIntensity"] = sess["raining"] ?? 0;
    result["windSpeed"] = 0;
    result["windDirection"] = 0;

    // On-track status
    result["isOnTrack"] = (sess["gamePhase"] as number ?? 0) >= 5;
    result["isInPit"] = parsed.vehicles[0]?.["inPits"] ?? false;
    result["isPitting"] = (parsed.vehicles[0]?.["pitState"] as number ?? 0) >= 2;

    // Tyres
    const brakeWear = this.restClient.getBrakeWear();
    const wheels = parsed.wheels ?? [];
    result["tyres"] = {
      fl: {
        temp: wheels[0]?.["brakeTemp"] ?? 0,
        pressure: wheels[0]?.["pressure"] ?? 0,
        wear: brakeWear[0] ?? wheels[0]?.["wear"] ?? 0,
      },
      fr: {
        temp: wheels[1]?.["brakeTemp"] ?? 0,
        pressure: wheels[1]?.["pressure"] ?? 0,
        wear: brakeWear[1] ?? wheels[1]?.["wear"] ?? 0,
      },
      rl: {
        temp: wheels[2]?.["brakeTemp"] ?? 0,
        pressure: wheels[2]?.["pressure"] ?? 0,
        wear: brakeWear[2] ?? wheels[2]?.["wear"] ?? 0,
      },
      rr: {
        temp: wheels[3]?.["brakeTemp"] ?? 0,
        pressure: wheels[3]?.["pressure"] ?? 0,
        wear: brakeWear[3] ?? wheels[3]?.["wear"] ?? 0,
      },
    };

    return result;
  }
}



