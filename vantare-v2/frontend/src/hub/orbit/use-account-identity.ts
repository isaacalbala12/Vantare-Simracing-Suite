import { useLicense } from "../../lib/license";
import { useClerkAuth, type ClerkAccountUser } from "../../lib/clerk-auth";

export interface AccountIdentity {
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
}

const EMPTY: AccountIdentity = { displayName: null, email: null, avatarUrl: null };

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function identityFromClerkUser(
  user: ClerkAccountUser | null,
  fallbackEmail?: string | null,
): AccountIdentity {
  return {
    displayName: firstString(user?.fullName, user?.username),
    email: firstString(user?.primaryEmailAddress?.emailAddress, fallbackEmail),
    avatarUrl: firstString(user?.imageUrl),
  };
}

let seeded: AccountIdentity | null = null;

/** Solo para harnesses visuales y pruebas sin una sesión Clerk real. */
export function seedAccountIdentity(identity: AccountIdentity | null): void {
  seeded = identity;
}

function isEmpty(identity: AccountIdentity): boolean {
  return !identity.displayName && !identity.email && !identity.avatarUrl;
}

/** Identidad viva de Clerk, con el correo firmado de licencia como respaldo. */
export function useAccountIdentity(): AccountIdentity {
  const { result: license } = useLicense();
  const { user } = useClerkAuth();
  const identity = identityFromClerkUser(user, license?.email);
  if (isEmpty(identity)) return seeded ?? EMPTY;
  return identity;
}

/** Inicial del avatar: nombre, si no correo. Nunca el plan. */
export function accountInitial(identity: AccountIdentity): string {
  const source = identity.displayName ?? identity.email ?? "";
  return source ? source.charAt(0).toUpperCase() : "·";
}
