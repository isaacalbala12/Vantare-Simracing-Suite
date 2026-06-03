import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { HttpServer } from '../http-server';

const mockGetTelemetry = vi.fn().mockReturnValue({
  speed: 100,
  rpm: 5000,
  gear: 3,
  player: { driverName: 'Test', carNumber: '1' },
});

// Mock SimManager to avoid circular dep + electron/child_process dependencies
vi.mock('../../sim/sim-manager', () => ({
  SimManager: vi.fn().mockImplementation(() => ({
    getTelemetry: mockGetTelemetry,
  })),
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
  },
}));

/**
 * Find a free port by binding to port 0 and reading the assigned port.
 */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error('Could not get free port'));
      }
    });
  });
}

describe('HttpServer', () => {
  let server: HttpServer;
  let port: number;
  let baseUrl: string;

  beforeEach(async () => {
    port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    server = new HttpServer();
    await server.start(port);
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('health endpoint', () => {
    it('GET /healthz returns 200 with {"status":"ok"}', async () => {
      const res = await httpGet(`${baseUrl}/healthz`);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
    });
  });

  describe('SSE /events', () => {
    beforeEach(() => {
      // Wire a mock SimManager so SSE emits a hello frame with data
      const mockSimManager = { getTelemetry: mockGetTelemetry };
      server.setSimManager(mockSimManager as never);
    });

    it('responds with text/event-stream and proper cache headers', async () => {
      const res = await sseHeaders(`${baseUrl}/events`);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/event-stream');
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.headers['connection']).toBe('keep-alive');
    });

    it('sends a hello event with current telemetry data on connect (within 2s)', async () => {

      const result = await sseReadFirstEvent(`${baseUrl}/events`);
      expect(result.event).toBe('hello');
      const parsed = JSON.parse(result.data);
      expect(parsed).toHaveProperty('speed', 100);
      expect(parsed).toHaveProperty('rpm', 5000);
      expect(parsed).toHaveProperty('gear', 3);
    });
  });

  describe('overlay pages', () => {
    it('GET /overlays/:id returns HTML with inline SSE script (no bundle.js)', async () => {
      const res = await httpGet(`${baseUrl}/overlays/standings`);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/html');
      expect(res.body).toContain('<!DOCTYPE html>');
      expect(res.body).toContain('overlay-mode');
      expect(res.body).not.toContain('bundle.js');
      expect(res.body).toContain('EventSource');
      expect(res.body).toContain('window.history.replaceState');
      expect(res.body).toContain('?overlay=standings');
    });

    it('sets overlay ID in URL search params via replaceState', async () => {
      const res = await httpGet(`${baseUrl}/overlays/relative`);
      expect(res.body).toContain('?overlay=relative');
    });
  });

  describe('unknown routes', () => {
    it('GET /unknown returns 404', async () => {
      const res = await httpGet(`${baseUrl}/unknown`);
      expect(res.statusCode).toBe(404);
    });

    it('GET / returns 404', async () => {
      const res = await httpGet(`${baseUrl}/`);
      expect(res.statusCode).toBe(404);
    });
  });
});

// --- Helpers ---

/**
 * Reads headers from an SSE stream.
 * Resolves as soon as headers arrive (http.get callback fires) and destroys
 * the request to free the connection.
 */
function sseHeaders(
  url: string,
  timeoutMs: number = 2000,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`sseHeaders timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const req = http.get(url, (res) => {
      clearTimeout(timer);
      resolve({
        statusCode: res.statusCode ?? 0,
        headers: res.headers,
      });
      req.destroy();
    });
    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function httpGet(
  url: string,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          body,
        });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

function sseReadFirstEvent(
  url: string,
  timeoutMs: number = 2000,
): Promise<{ event: string; data: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let buffer = '';
      const timer = setTimeout(() => {
        req.destroy();
        reject(new Error(`SSE timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const eventMatch = buffer.match(/event:\s*(.+)\n/);
        const dataMatch = buffer.match(/data:\s*(.+)\n/);
        if (eventMatch && dataMatch) {
          clearTimeout(timer);
          req.destroy();
          resolve({ event: eventMatch[1].trim(), data: dataMatch[1].trim() });
        }
      });

      res.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    req.on('error', reject);
  });
}
