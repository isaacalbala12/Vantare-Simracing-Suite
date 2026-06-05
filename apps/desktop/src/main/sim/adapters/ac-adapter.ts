import type { Telemetry, SimAdapter } from '@vantare/sim-core';
import { SimNormalizer } from '@vantare/sim-core';

// ──────────────────────────────────────────────
// AC UDP Handshake Protocol Constants
// ──────────────────────────────────────────────

const HANDSHAKE_TIMEOUT = 5000;
const HANDSHAKE = 0;
const SUBSCRIBE_UPDATE = 1;
const DISMISS = 3;
const HANDSHAKE_RESPONSE_SIZE = 408;
const RT_CAR_INFO_SIZE = 328;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Decode a UTF-16LE null-terminated string from a buffer. */
function decodeUTF16LE(buf: Buffer, offset: number, maxBytes: number): string {
  const end = Math.min(offset + maxBytes, buf.length);
  // Find the null terminator (two zero bytes)
  let nullAt = offset;
  while (nullAt + 1 < end && (buf[nullAt] !== 0 || buf[nullAt + 1] !== 0)) {
    nullAt += 2;
  }
  return buf.toString('utf16le', offset, nullAt);
}

/** Build a 12-byte handshake protocol packet. */
function buildPacket(identifier: number, version: number, operation: number): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeInt32LE(identifier, 0);
  buf.writeInt32LE(version, 4);
  buf.writeInt32LE(operation, 8);
  return buf;
}

// ──────────────────────────────────────────────
// Session info captured from handshake response
// ──────────────────────────────────────────────

interface HandshakeSession {
  carName: string;
  driverName: string;
  trackName: string;
  trackConfig: string;
}

// ──────────────────────────────────────────────
// Adapter
// ──────────────────────────────────────────────

export class ACAdapter implements SimAdapter {
  readonly name = 'ac';
  readonly displayName = 'Assetto Corsa';
  private socket: import('dgram').Socket | null = null;
  private port = 9996;
  private normalizer = new SimNormalizer();
  private telemetryCallback?: (data: Telemetry) => void;
  private sessionCallback?: (data: Telemetry) => void;
  private connectionCallback?: (state: string) => void;
  private handshakeComplete = false;
  private handshakeTimeout?: ReturnType<typeof setTimeout>;
  private connectResolve?: () => void;
  private sessionInfo: HandshakeSession = {
    carName: '',
    driverName: '',
    trackName: '',
    trackConfig: '',
  };

  isAvailable(): boolean { return true; }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const dgram = require('dgram');
        this.socket = dgram.createSocket('udp4');
        this.handshakeComplete = false;
        this.connectResolve = resolve;

        this.socket!.on('message', (msg: Buffer) => {
          // Distinguish handshake response (408 bytes) from telemetry (328 bytes)
          if (!this.handshakeComplete && msg.length === HANDSHAKE_RESPONSE_SIZE) {
            this.handleHandshakeResponse(msg);
          } else {
            this.handlePacket(msg);
          }
        });

        this.socket!.on('error', (err: Error) => {
          console.error('AC adapter error:', err);
          this.connectionCallback?.('error');
          reject(err);
        });

        this.socket!.bind(this.port, '127.0.0.1', () => {
          console.log('AC adapter listening on port', this.port);

          // Step 1: Send handshake
          this.sendHandshake();

          // Step 2: Set timeout — if no response within 5s, continue anyway
          this.handshakeTimeout = setTimeout(() => {
            if (!this.handshakeComplete) {
              console.warn('AC handshake timed out after 5s — no server response');
              this.connectionCallback?.('connected');
              resolve();
            }
          }, HANDSHAKE_TIMEOUT);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // ── Protocol helpers ────────────────────────

  private sendHandshake(): void {
    const packet = buildPacket(0, 1, HANDSHAKE);
    this.socket!.send(packet, 0, packet.length, this.port, '127.0.0.1');
  }

  private sendSubscribe(): void {
    const packet = buildPacket(0, 1, SUBSCRIBE_UPDATE);
    this.socket!.send(packet, 0, packet.length, this.port, '127.0.0.1');
  }

  private sendDismiss(): void {
    if (!this.socket) return;
    const packet = buildPacket(0, 1, DISMISS);
    this.socket!.send(packet, 0, packet.length, this.port, '127.0.0.1');
  }

  // ── Handshake response ──────────────────────

  private handleHandshakeResponse(msg: Buffer): void {
    // Parse 408-byte handshake response
    // Offset  Size  Field
    // 0       100   carName   (UTF-16LE, 50 chars)
    // 100     100   driverName (UTF-16LE, 50 chars)
    // 200     4     identifier (int32)
    // 204     4     version    (int32)
    // 208     100   trackName  (UTF-16LE, 50 chars)
    // 308     100   trackConfig (UTF-16LE, 50 chars)
    // = 408 bytes total

    const carName = decodeUTF16LE(msg, 0, 100);
    const driverName = decodeUTF16LE(msg, 100, 100);
    // identifier at offset 200, version at offset 204 — read but not stored
    const trackName = decodeUTF16LE(msg, 208, 100);
    const trackConfig = decodeUTF16LE(msg, 308, 100);

    this.sessionInfo = { carName, driverName, trackName, trackConfig };

    console.log(
      `AC handshake OK — car="${carName}" driver="${driverName}" track="${trackName}" config="${trackConfig}"`,
    );

    this.handshakeComplete = true;

    // Clear timeout
    if (this.handshakeTimeout) {
      clearTimeout(this.handshakeTimeout);
      this.handshakeTimeout = undefined;
    }

    // Step 3: Send subscribe to start receiving telemetry
    this.sendSubscribe();

    // Resolve the connect promise
    this.connectResolve?.();
    this.connectResolve = undefined;

    // Emit connection + session data
    this.connectionCallback?.('connected');

    // Emit session data with track/car info from handshake
    if (this.sessionCallback) {
      const sessionPayload: Record<string, unknown> = {
        session: {
          track: trackName,
          trackConfig,
          carName,
          driverName,
        },
      };
      const telemetry = this.normalizer.normalize(sessionPayload, 'ac');
      this.sessionCallback(telemetry);
    }
  }

  // ── Disconnect ──────────────────────────────

  disconnect(): void {
    if (this.socket) {
      // Send DISMISS before closing
      this.sendDismiss();
      this.socket.close();
      this.socket = null;
      this.connectionCallback?.('disconnected');
    }
    this.handshakeComplete = false;
    this.connectResolve = undefined;
    if (this.handshakeTimeout) {
      clearTimeout(this.handshakeTimeout);
      this.handshakeTimeout = undefined;
    }
  }

  // ── Callback registration ───────────────────

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

  // ── Packet handling ─────────────────────────

  private handlePacket(msg: Buffer): void {
    if (!this.handshakeComplete) return;

    try {
      const raw = this.parseACPacket(msg);
      if (raw) {
        const telemetry = this.normalizer.normalize(raw, 'ac');
        this.telemetryCallback?.(telemetry);
      }
    } catch (err) {
      console.error('Error parsing AC packet:', err);
    }
  }

  /**
   * Parse a 328-byte RT_CAR_INFO packet from the AC UDP telemetry stream.
   *
   * Field layout (relative to packet start):
   *   Offset  Size  Type    Field
   *   0       4     int32   charId + pad
   *   4       4     int32   packet size
   *   8       4     float   speedKmh
   *   12      4     float   speedMph
   *   16      4     float   speedMs
   *   20      1     byte    isAbsEnabled
   *   21      1     byte    isAbsInAction
   *   22      1     byte    isTcInAction
   *   23      1     byte    isTcEnabled
   *   24      1     byte    isInPit
   *   25      1     byte    isEngineLimiterOn
   *   26      2     ——      SKIP
   *   28      4     float   accGVertical
   *   32      4     float   accGHorizontal
   *   36      4     float   accGFrontal
   *   40      4     int32   lapTime (current lap in ms)
   *   44      4     int32   lastLap (ms)
   *   48      4     int32   bestLap (ms)
   *   52      4     int32   lapCount
   *   56      4     float   gas (0-1)
   *   60      4     float   brake (0-1)
   *   64      4     float   clutch (0-1)
   *   68      4     float   engineRPM
   *   72      4     float   steer (-1 to 1)
   *   76      4     int32   gear
   *   80      4     int32   cgHeight
   *   84      4     float   fuel (liters)
   *   ...    244    ——      remaining fields (tyre data, etc.)
   */
  private parseACPacket(msg: Buffer): Record<string, unknown> | null {
    if (msg.length < 80) return null;

    try {
      const data: Record<string, unknown> = {};

      data.speedKmh = msg.readFloatLE(8);
      data.rpm = msg.readFloatLE(68);
      data.gear = msg.readInt32LE(76);
      data.gas = msg.readFloatLE(56);
      data.brake = msg.readFloatLE(60);
      data.clutch = msg.readFloatLE(64);
      data.steerAngle = msg.readFloatLE(72);
      data.lastLap = msg.readInt32LE(44);   // already in ms
      data.bestLap = msg.readInt32LE(48);   // already in ms
      data.numberOfLaps = msg.readInt32LE(52);
      data.isInPit = msg.readUInt8(24) !== 0;
      data.lap = msg.readInt32LE(40);       // current lap time in ms

      // Fuel is at offset 84 (if packet is large enough)
      if (msg.length >= 88) {
        data.fuel = msg.readFloatLE(84);
      }

      // Defaults for fields not available in RT_CAR_INFO
      data.isOnTrack = true;
      data.isPitting = false;

      return data;
    } catch (err) {
      console.error('Error parsing AC RT_CAR_INFO packet:', err);
      return null;
    }
  }
}
