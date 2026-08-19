import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Events } from "@wailsio/runtime";
import type { LicenseResult } from "./license-types";
import { licenseDebug } from "./license-debug";
import { LicenseContext, type LicenseContextValue } from "./license-context";


const ANONYMOUS_LICENSE: LicenseResult = {
  state: "anonymous",
  entitlements: [],
  userId: "",
  email: "",
  deviceOK: false,
};

/**
 * LicenseResult declares entitlements as a plain array, so nothing downstream
 * guards before calling a method on it. Go marshals a nil slice as `null`,
 * which meant an account with no entitlements handed the UI a null where the
 * type promised a list. The backend now sends `[]`; this keeps the promise
 * true here as well, so a stale build or a cached payload written by an older
 * one cannot bring the settings page down.
 */
function normaliseLicense(data: LicenseResult | null): LicenseResult | null {
  if (!data) {
    return null;
  }
  return {
    ...data,
    entitlements: data.entitlements ?? [],
    capabilities: data.capabilities ?? [],
    operationalRoles: data.operationalRoles ?? [],
  };
}

export function LicenseProvider({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<LicenseResult | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(
    (sessionToken?: string) => {
      licenseDebug("LicenseProvider", "emit license:validate", {
        hasToken: Boolean(sessionToken),
        tokenLen: sessionToken?.length ?? 0,
      });
      Events.Emit("license:validate", sessionToken ? { sessionToken } : {});
    },
    [],
  );

  const clearLicense = useCallback(() => {
    setResult(ANONYMOUS_LICENSE);
    setLoading(false);
  }, []);

  useEffect(() => {

    let cancelled = false;
    // El refresco inicial se emite sin token, antes de que la sesion guardada
    // se restaure, y responde "anonymous". La guarda de setResult no puede
    // protegerlo porque todavia no hay estado previo del que no retroceder, asi
    // que la puerta mostraba LoginScreen y, al llegar la sesion real, cambiaba
    // de rama: eso destruia y reconstruia el Hub entero en cada arranque.
    //
    // Un anonimo asi no es autoritativo: no significa "esta sesion no vale",
    // sino "no he preguntado por ninguna". Se ignora hasta que el temporizador
    // de seguridad decide que no va a llegar sesion alguna, momento en el que
    // un usuario realmente sin sesion si debe ver LoginScreen.
    let settled = false;

    const unsubChanged = Events.On(
      "license:changed",
      (event: unknown) => {
        if (cancelled) return;
        const data = normaliseLicense(
          (event as { data?: LicenseResult | null })?.data ?? null,
        );
        licenseDebug("LicenseProvider", "license:changed", {
          state: data?.state ?? "null",
          email: data?.email ?? "",
          entitlements: data?.entitlements ?? [],
          deviceOK: data?.deviceOK,
          lastValidated: data?.lastValidated ?? null,
        });
        // Never regress from an authenticated state to anonymous. This
        // prevents the LicenseBridge/initial-mount empty-token refresh from
        // overwriting a successful OAuth callback result. Once the user is
        // authenticated (active, grace, authenticated-no-entitlement,
        // expired, device-limit or unconfigured), an anonymous event is
        // treated as stale and ignored.
        setResult((prev) => {
          if (
            prev &&
            prev.state !== "anonymous" &&
            data?.state === "anonymous"
          ) {
            return prev;
          }
          return data;
        });
        if (data?.state === "anonymous" && !settled) {
          return;
        }
        settled = true;
        setLoading(false);
      },
    );
    const unsubError = Events.On(
      "license:error",
      () => {
        if (!cancelled) setLoading(false);
      },
    );

    // Cache primero: Go responde con el estado guardado, verificado offline y
    // atado a este dispositivo, sin tocar la red. El Hub puede pintar de
    // inmediato y la validacion online llega despues para corregirlo.
    Events.Emit("license:cached:get", {});

    // Este refresco va sin token: se emite antes de que auth:session:get haya
    // restaurado la sesion, asi que responde "anonymous". Se conserva porque en
    // modo standalone -- sin backend Wails -- es lo unico que resuelve la carga,
    // y quitarlo dejaba a quien no tiene sesion tres segundos ante una pantalla
    // en blanco antes de poder iniciarla. Su respuesta ya no hace dano: la
    // guarda de mas abajo ignora los anonimos no concluyentes.
    setTimeout(() => {
      if (!cancelled) refresh();
    }, 500);

    // Safety timeout: prevent infinite loading if the Wails IPC bridge
    // wasn't ready or the backend never responded. Resolves to anonymous
    // state (LoginScreen) with one automatic retry.
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      // A partir de aqui un anonimo si es concluyente: nadie va a traer sesion.
      settled = true;
      setLoading(false);
      // Call refresh directly, don't wait for getSession which may hang
      Events.Emit("license:validate", {});
    }, 3000);

    return () => {
      cancelled = true;
      unsubChanged?.();
      unsubError?.();
      clearTimeout(timeoutId);
    };
  }, [refresh]);

  const value = useMemo<LicenseContextValue>(
    () => ({ result, loading, refresh, clearLicense }),
    [result, loading, refresh, clearLicense],
  );

  return (
    <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>
  );
}
