import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { useLicense } from "../../lib/license";
import { getSession, onSupabaseAuthStateChange } from "../../lib/supabase-auth";

/**
 * Identidad de la cuenta tal y como la pinta la interfaz.
 *
 * Fuente única para el avatar del rail y para Ajustes › Cuenta: antes cada uno
 * inventaba lo suyo (el rail caía en la inicial del *plan*, que es de dónde
 * salía la ‘F’ de Free) y ninguno usaba la foto real de Google.
 */
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

/**
 * Lee la identidad de una sesión de Supabase. Google OAuth deja el nombre y la
 * foto en `user_metadata` con dos nombres distintos según el flujo
 * (`full_name`/`name`, `avatar_url`/`picture`): se aceptan los cuatro.
 */
export function identityFromSession(
  session: Session | null,
  fallbackEmail?: string | null,
): AccountIdentity {
  const user = session?.user;
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const email = firstString(user?.email, meta.email, fallbackEmail);
  return {
    displayName: firstString(meta.full_name, meta.name, meta.user_name),
    email,
    avatarUrl: firstString(meta.avatar_url, meta.picture),
  };
}

let seeded: AccountIdentity | null = null;

/**
 * Sólo para harnesses visuales y pruebas: sin runtime de Wails ni Supabase
 * configurado no hay sesión, y la captura saldría con el avatar vacío.
 */
export function seedAccountIdentity(identity: AccountIdentity | null): void {
  seeded = identity;
}

function isEmpty(identity: AccountIdentity): boolean {
  return !identity.displayName && !identity.email && !identity.avatarUrl;
}

/** Identidad viva de la cuenta: sesión de Supabase, con la licencia de respaldo. */
export function useAccountIdentity(): AccountIdentity {
  const { result: license } = useLicense();
  const licenseEmail = license?.email ?? null;
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let active = true;
    void getSession()
      .then((current) => {
        if (active) setSession(current);
      })
      .catch(() => undefined);
    const off = onSupabaseAuthStateChange((_event, next) => {
      if (active) setSession(next);
    });
    return () => {
      active = false;
      off();
    };
  }, []);

  const identity = identityFromSession(session, licenseEmail);
  if (isEmpty(identity)) return seeded ?? EMPTY;
  return identity;
}

/** Inicial del avatar: nombre, si no correo. Nunca el plan. */
export function accountInitial(identity: AccountIdentity): string {
  const source = identity.displayName ?? identity.email ?? "";
  return source ? source.charAt(0).toUpperCase() : "·";
}
