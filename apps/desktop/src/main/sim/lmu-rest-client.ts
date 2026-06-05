/**
 * LMU REST API Client
 * Polls 3 endpoints from LMU's local HTTP API at localhost:6397
 * - /rest/garage/UIScreen/RepairAndRefuel: brake wear (3s)
 * - /rest/sessions/weather: weather forecast (120s)
 * - /rest/strategy/usage: strategy data (3s)
 */
export class LMURestClient {
  private baseUrl: string;
  private intervals: ReturnType<typeof setInterval>[] = [];
  private brakeWear: number[] = [];
  private weatherCache: Record<string, unknown> = {};
  private strategyCache: Record<string, unknown> = {};
  private running = false;

  constructor(baseUrl = "http://localhost:6397") {
    this.baseUrl = baseUrl;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // Brake wear: every 3s
    this.intervals.push(setInterval(() => this.pollBrakeWear(), 3000));

    // Weather: every 120s
    this.intervals.push(setInterval(() => this.pollWeather(), 120000));

    // Strategy: every 3s
    this.intervals.push(setInterval(() => this.pollStrategy(), 3000));

    // Immediate first polls
    this.pollBrakeWear();
    this.pollWeather();
    this.pollStrategy();
  }

  stop(): void {
    this.running = false;
    for (const iv of this.intervals) clearInterval(iv);
    this.intervals = [];
  }

  getBrakeWear(): number[] {
    return this.brakeWear;
  }

  getWeather(): Record<string, unknown> {
    return { ...this.weatherCache };
  }

  getStrategyUsage(): Record<string, unknown> {
    return { ...this.strategyCache };
  }

  private async fetchJson(path: string, timeoutMs = 2000): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.debug(`LMU REST ${path} failed:`, (err as Error).message);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async pollBrakeWear(): Promise<void> {
    const data = await this.fetchJson("/rest/garage/UIScreen/RepairAndRefuel");
    if (data && typeof data === "object" && "wearables" in data) {
      const w = (data as any).wearables;
      if (w && Array.isArray(w.brakes)) {
        this.brakeWear = w.brakes as number[];
      }
    }
  }

  private async pollWeather(): Promise<void> {
    const data = await this.fetchJson("/rest/sessions/weather", 5000);
    if (data && typeof data === "object") {
      this.weatherCache = data as Record<string, unknown>;
    }
  }

  private async pollStrategy(): Promise<void> {
    const data = await this.fetchJson("/rest/strategy/usage");
    if (data && typeof data === "object") {
      this.strategyCache = data as Record<string, unknown>;
    }
  }
}
