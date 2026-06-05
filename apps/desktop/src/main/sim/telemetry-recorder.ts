import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { Telemetry } from '@vantare/sim-core';

export class TelemetryRecorder {
  private stream?: fs.WriteStream;
  private _isRecording = false;
  private filePath?: string;

  get isRecording(): boolean {
    return this._isRecording;
  }

  startRecording(sim: string): string {
    const recordingsDir = path.join(app.getPath('userData'), 'recordings');
    fs.mkdirSync(recordingsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.filePath = path.join(recordingsDir, `${sim}-${timestamp}.ndjson`);
    this.stream = fs.createWriteStream(this.filePath, { flags: 'a' });

    // Write metadata header (first line)
    const header =
      JSON.stringify({
        version: 1,
        sim,
        startedAt: Date.now(),
      }) + '\n';

    this.stream.write(header);
    this._isRecording = true;
    return this.filePath;
  }

  writeFrame(data: Telemetry): void {
    if (!this.stream || !this._isRecording) return;
    this.stream.write(JSON.stringify(data) + '\n');
  }

  stopRecording(): string | null {
    this._isRecording = false;
    if (this.stream) {
      this.stream.end();
      this.stream = undefined;
    }
    const result = this.filePath ?? null;
    this.filePath = undefined;
    return result;
  }
}
