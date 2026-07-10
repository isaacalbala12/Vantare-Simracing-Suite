import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { ProfileDocumentV3 } from "./src/overlay/core/profile-document";
import {
  getServerHarnessBrowserViewProfile,
  setServerHarnessBrowserViewProfile,
} from "./src/overlay-harness/harness-browser-view-store.server";
import { buildHarnessProfileApiResponse } from "./src/overlay-harness/harness-profile-api";

function requestPathname(url: string): string {
  return new URL(url, "http://127.0.0.1").pathname;
}

function requestSearchParams(url: string): URLSearchParams {
  return new URL(url, "http://127.0.0.1").searchParams;
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function isOverlayDocumentRequest(pathname: string): boolean {
  return pathname === "/overlay" || pathname.startsWith("/overlay/");
}

export function overlayStudioHarnessBrowserViewPlugin(): Plugin {
  return {
    name: "overlay-studio-harness-browser-view",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        const pathname = requestPathname(url);

        if (req.method === "POST" && pathname === "/api/harness/browser-view-profile") {
          try {
            const body = (await readJsonBody(req)) as { file?: string; document?: ProfileDocumentV3 };
            if (!body.file || !body.document) {
              res.statusCode = 400;
              res.end("file and document required");
              return;
            }
            setServerHarnessBrowserViewProfile(body.file, body.document);
            res.statusCode = 204;
            res.end();
          } catch {
            res.statusCode = 400;
            res.end("invalid json");
          }
          return;
        }

        if (req.method === "GET" && pathname === "/api/profile") {
          const profileParam = requestSearchParams(url).get("profile") ?? "";
          const response = buildHarnessProfileApiResponse(profileParam, getServerHarnessBrowserViewProfile);
          if (!response) {
            res.statusCode = 404;
            res.setHeader("Content-Type", "text/plain");
            res.end("profile not found");
            return;
          }
          sendJson(res, 200, response);
          return;
        }

        if (req.method === "GET" && pathname === "/telemetry/stream") {
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
          res.write(":connected\n\n");

          const keepAlive = setInterval(() => {
            res.write(":keep-alive\n\n");
          }, 15_000);

          req.on("close", () => {
            clearInterval(keepAlive);
          });
          return;
        }

        if (req.method === "GET" && isOverlayDocumentRequest(pathname) && !pathname.includes(".")) {
          req.url = "/index.html";
        }

        next();
      });
    },
  };
}