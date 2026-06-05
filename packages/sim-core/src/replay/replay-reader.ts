import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import type { Telemetry } from '../types';

export interface ReplayFrame {
  timestamp: number;
  data: Telemetry;
}

export class ReplayReader {
  static async open(filePath: string): Promise<Telemetry[]> {
    const frames: Telemetry[] = [];
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });
    let isFirstLine = true;
    for await (const line of rl) {
      if (line.trim().length === 0) continue; // skip empty
      if (isFirstLine) {
        isFirstLine = false;
        continue; // skip metadata header
      }
      try {
        frames.push(JSON.parse(line) as Telemetry);
      } catch {
        // Truncated last line — silently ignore
        break;
      }
    }
    return frames;
  }
}
