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
    const clerk = new Clerk(key);
    clerkPromise = clerk
      .load({ ui, standardBrowser: false })
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
// the caller can decide whether they matter.
export function signOutClerk(): Promise<void> {
  return loadClerk().then((clerk) => clerk.signOut());
}
