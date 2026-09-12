/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const wailsMockPath = path.resolve(
  fileURLToPath(import.meta.url),
  "../src/lib/wails-runtime-mock.ts",
);
const topbarMockPath = path.resolve(
  fileURLToPath(import.meta.url),
  "../src/lib/wails-runtime-topbar-mock.ts",
);

// The Clerk publishable key encodes the instance's FAPI host as base64
// (trailing `$`). The dev proxy decodes it so `/clerk` forwards to the right
// instance without duplicating the host in another variable.
function clerkFapiHost(publishableKey: string): string {
  const encoded = publishableKey.replace(/^pk_(test|live)_/, "");
  if (!encoded) return "";
  try {
    return Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
  } catch {
    return "";
  }
}

export default defineConfig(({ mode }) => {
  const runtimeMock = process.env.VITE_RUNTIME_MOCK;
  const useTopbarMock = runtimeMock === "topbar";
  const useWailsMock = runtimeMock === "mock" || runtimeMock === "calendar";
  const isProduction = mode === "production";
  const alias: Record<string, string> = {};
  // Only harnesses opt into the mock runtime. wails3 dev must use the real
  // @wailsio/runtime package so license:validate hits the Go backend.
  if (!isProduction && (useTopbarMock || useWailsMock)) {
    alias["@wailsio/runtime"] = useTopbarMock ? topbarMockPath : wailsMockPath;
  }
  // clerk-js runs its native channel through the same-origin /clerk prefix
  // (proxyUrl in clerk-auth.ts). The WebView always sends Origin on POSTs and
  // FAPI rejects Origin+Authorization together, so the hop through this proxy
  // is what lets the client JWT travel as a header — the forwarded request
  // carries no Origin.
  const fapiHost = clerkFapiHost(
    loadEnv(mode, __dirname).VITE_CLERK_PUBLISHABLE_KEY ?? "",
  );
  return {
    plugins: [react(), tailwindcss()],
    server: {
      strictPort: true,
      port: 5173,
      proxy: fapiHost
        ? {
            "/clerk": {
              target: `https://${fapiHost}`,
              changeOrigin: true,
              rewrite: (urlPath) => urlPath.replace(/^\/clerk/, ""),
              configure: (proxy) => {
                proxy.on("proxyReq", (proxyReq) => {
                  proxyReq.removeHeader("origin");
                  proxyReq.removeHeader("referer");
                  proxyReq.removeHeader("cookie");
                });
              },
            },
          }
        : undefined,
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        input: {
          index: path.resolve(fileURLToPath(import.meta.url), "../index.html"),
          overlay: path.resolve(fileURLToPath(import.meta.url), "../overlay.html"),
        },
      },
    },
    resolve: { alias },
    test: {
      setupFiles: ["./src/test-setup.ts"],
      environment: "happy-dom",
      // A test must outlast the waits inside it. Suites that render the Studio
      // raise Testing Library's asyncUtilTimeout to 5s for the async profile
      // load, which is exactly Vitest's default test budget: the test was
      // killed at the same instant its wait ran out, so a slow CI runner
      // aborted a different test on every pass instead of either passing or
      // reporting which element never appeared.
      testTimeout: 20000,
      hookTimeout: 20000,
    },
  };
});
