import http from 'http';
import { app } from 'electron';
import type { SimManager } from '../sim/sim-manager';
import type { Telemetry } from '@vantare/sim-core';

export class HttpServer {
  private server: http.Server | null = null;
  private port: number = 3200;
  private host: string = '127.0.0.1';
  private clients: Set<http.ServerResponse> = new Set();
  private simManager: SimManager | null = null;

  setSimManager(simManager: SimManager): void {
    this.simManager = simManager;
  }

  async start(port?: number): Promise<void> {
    if (port !== undefined) this.port = port;
    this.server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${this.host}:${this.port}`);

      // Health check endpoint
      if (url.pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      // Server-Sent Events for telemetry
      if (url.pathname === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });

        // Send hello frame with current telemetry state on connect
        if (this.simManager) {
          const currentTelemetry = this.simManager.getTelemetry();
          if (currentTelemetry) {
            res.write(`event: hello\ndata: ${JSON.stringify(currentTelemetry)}\n\n`);
          }
        }

        this.clients.add(res);
        req.on('close', () => this.clients.delete(res));
        return;
      }

      // Overlay SPA pages
      const overlayMatch = url.pathname.match(/^\/overlays\/(.+)$/);
      if (overlayMatch) {
        const overlayId = overlayMatch[1];
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(this.renderOverlayPage(overlayId));
        return;
      }

      // Unknown routes
      res.writeHead(404);
      res.end('Not found');
    });

    // Swallow ECONNRESET from SSE client disconnections
    this.server.on('connection', (socket) => {
      socket.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ECONNRESET') return;
        console.error('HTTP socket error:', err);
      });
    });
    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNRESET') return;
      console.error('HTTP server error:', err);
    });

    return new Promise((resolve) => {
      this.server?.listen(this.port, this.host, () => {
        console.log(`HTTP Server running on ${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  private renderOverlayPage(overlayId: string): string {
    const isDev = !app.isPackaged;
    const baseHref = isDev ? 'http://localhost:3000/' : '/';
    const sseUrl = `http://${this.host}:${this.port}/events`;

    return `<!DOCTYPE html>
<html class="overlay-mode">
<head>
  <meta charset="UTF-8" />
  <base href="${baseHref}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; }
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="overlay-root"></div>
  <script>
    (function() {
      // Set overlay ID via URL search params so the SPA detects overlay mode
      window.history.replaceState({}, '', '?overlay=${overlayId}');

      // Connect to SSE for real-time telemetry
      var eventSource = new EventSource('${sseUrl}');
      eventSource.onmessage = function(event) {
        try {
          var data = JSON.parse(event.data);
          window.postMessage({ type: 'telemetry', data: data }, '*');
        } catch(e) {
          console.error('SSE parse error:', e);
        }
      };
      eventSource.onerror = function() {
        console.error('SSE connection error');
      };
    })();
  </script>
  <script type="module" src="src/main.tsx"></script>
</body>
</html>`;
  }

  broadcastTelemetry(data: Telemetry): void {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    this.clients.forEach((client) => {
      client.write(message);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      // Destroy all SSE client connections forcefully
      this.clients.forEach((c) => c.destroy());
      this.clients.clear();
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
