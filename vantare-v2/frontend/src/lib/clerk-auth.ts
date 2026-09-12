import { Clerk } from "@clerk/clerk-js";
import { ui } from "@clerk/ui";

// The publishable key is a compile-time input forwarded through the Task ->
// runner VITE_* chain, same as the Supabase values. It is a public identifier,
// never a runtime secret, and it is never persisted anywhere.
function clerkPublishableKey(): string {
  return (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) ?? "";
}

export function isClerkConfigured(): boolean {
  return Boolean(clerkPublishableKey());
}

let clerkPromise: Promise<Clerk> | null = null;

// Clerk's FAPI rejects a cookieless browser on a dev instance with
// dev_browser_unauthenticated unless the request declares the native channel
// (`_is_native=1`, which also skips the browser-mode CAPTCHA gate). In that
// channel FAPI identifies the client only through a rotating client JWT that
// must be echoed back on every request via the `Authorization` header — and
// it rejects any request carrying both `Origin` and `Authorization`. A WebView
// always sends `Origin` on POSTs, so FAPI traffic is routed through a
// same-origin proxy (`load({ proxyUrl: "/clerk" })`): the Vite dev server or
// the Wails asset middleware forwards the call server-to-server without an
// Origin header. The client JWT is kept in memory only, never persisted.
let clerkClientJwt = "";

function wireNativeFapi(clerk: Clerk): void {
  clerk.__internal_onBeforeRequest((request) => {
    request.credentials = "omit";
    request.url?.searchParams.append("_is_native", "1");
    if (clerkClientJwt) {
      const headers = new Headers(request.headers);
      headers.set("Authorization", clerkClientJwt);
      request.headers = headers;
    }
  });
  clerk.__internal_onAfterResponse((_request, response) => {
    const rotated = response?.headers.get("authorization");
    if (rotated) clerkClientJwt = rotated;
  });
}

// Clerk's mounted routers assume they own a URL surface the app already uses:
// its hash router reads and writes the whole `location.hash`, which collides
// with the app's own `#/hub` routing, and without `routerPush`/`routerReplace`
// every in-component navigation falls back to a full `window.location` change
// that would reload (or strand) the WebView. We therefore give Clerk the
// `path` router pinned under /sign-in and implement navigation ourselves:
// same-origin history entries that always preserve the app hash.
export const CLERK_SIGNIN_PATH = "/sign-in";

function clerkRouterNavigate(to: string, replace: boolean): Promise<void> {
  const url = new URL(to, window.location.href);
  if (url.origin !== window.location.origin) return Promise.resolve();
  const path = url.pathname.startsWith(CLERK_SIGNIN_PATH)
    ? url.pathname
    : CLERK_SIGNIN_PATH;
  const target = path + url.search + (url.hash || window.location.hash);
  if (replace) window.history.replaceState(null, "", target);
  else window.history.pushState(null, "", target);
  return Promise.resolve();
}

// loadClerk caches the in-flight promise, never the failure: a rejected load
// (offline, bad key) clears the slot so the next caller retries from scratch.
// standardBrowser:false is mandatory inside the Wails WebView — cookies are
// broken on the wails:// origin, so Clerk keeps its session client-side — and
// `ui` is required for mountSignIn to render the bundled components.
export function loadClerk(): Promise<Clerk> {
  if (!clerkPromise) {
    const key = clerkPublishableKey();
    if (!key) {
      return Promise.reject(
        new Error("Clerk no configurado: falta VITE_CLERK_PUBLISHABLE_KEY"),
      );
    }
    clerkClientJwt = "";
    const clerk = new Clerk(key, { proxyUrl: "/clerk" });
    wireNativeFapi(clerk);
    clerkPromise = clerk
      .load({
        ui,
        standardBrowser: false,
        routerPush: (to) => clerkRouterNavigate(to, false),
        routerReplace: (to) => clerkRouterNavigate(to, true),
      })
      .then(() => clerk)
      .catch((err: unknown) => {
        clerkPromise = null;
        throw err;
      });
  }
  return clerkPromise;
}

export function getClerkSessionToken(clerk: Clerk): Promise<string | null> {
  return clerk.session?.getToken() ?? Promise.resolve(null);
}

// Resolves cleanly even with no active session; network failures propagate so
// the caller can decide whether they matter. The cached client JWT is dropped
// too: it names the destroyed client, and a fresh sign-in must start from a
// clean FAPI client.
export function signOutClerk(): Promise<void> {
  return loadClerk()
    .then((clerk) => clerk.signOut())
    .then(() => {
      clerkClientJwt = "";
    });
}
