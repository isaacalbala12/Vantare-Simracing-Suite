# Spec: login visible y sesión mínima con Clerk

Estado: aprobada para implementación por la instrucción de Isaac de continuar
hasta las pruebas UI. Issue: ISA-915. Dependencia: ISA-909 / PR #913.

## Objetivo

Clerk pasa a ser la única puerta visible de inicio de sesión de Vantare. Una
sesión activa entrega un JWT vigente a `license:validate`; la frontera de
ISA-909 resuelve después el UUID interno y la credencial firmada sigue siendo la
autoridad de licencia. Este corte no convierte a Clerk en base de datos de
cuentas ni migra Billing o Testing Center.

## Decisiones cerradas

1. Se usa solo el SDK oficial `@clerk/react`. Su `ClerkProvider`, `SignIn`,
   `useSession` y `useUser` evitan montar componentes a mano o crear un SDK
   propio.
2. La única configuración frontend nueva es
   `VITE_CLERK_PUBLISHABLE_KEY`. Es pública por definición; ninguna secret key
   entra en el bundle, documentación o logs.
3. El login usa el componente alojado `SignIn` con routing por path, único modo
   soportado por la versión actual del SDK que no ocupa el hash `#/hub`. Vantare no
   reimplementa email, contraseñas, OAuth, MFA ni recuperación.
4. `session.getToken()` se llama al activar/restaurar una sesión y cada vez que
   una acción necesita revalidar licencia. Nunca se usa el OAuth access token.
5. Vantare no persiste el JWT Clerk. El backend existente solo guarda sesiones
   que incluyen access y refresh token; Clerk no se presenta como ese contrato.
6. La credencial offline firmada conserva el arranque cache-first actual. Tener
   licencia offline no inventa una sesión Clerk ni una identidad editable.
7. Cerrar sesión llama primero a Clerk y después limpia la sesión legacy
   protegida y el estado de licencia. Si la limpieza local falla, queda visible
   y no se afirma que la cuenta salió completamente.
8. La identidad visible procede de `useUser`; el email firmado de licencia es
   solo respaldo mientras Clerk carga o en modo offline.
9. El antiguo `AuthSessionBridge` de Supabase deja de montarse en producción.
   Los helpers Supabase que Billing o superficies aún pendientes necesiten no se
   eliminan en este corte.
10. No se crea `AuthManager`, registro de providers, almacenamiento paralelo ni
    abstracción multi-proveedor.

## Estados observables

| Estado | Resultado visible | Efecto de licencia |
| --- | --- | --- |
| configuración ausente | error de configuración concreto | ninguno |
| Clerk cargando | pantalla de carga accesible | se conserva cache offline |
| sin sesión | `SignIn` oficial dentro de la superficie Vantare | ninguno |
| sesión activa | el login desaparece tras validación aceptada | JWT vigente a `license:validate` |
| token/carga fallida | error reintentable, sin datos inventados | no se desbloquea cuenta online |
| cierre de sesión | vuelve el bloqueo de login | se limpia licencia y sesión legacy |

El overlay bloqueante existente sigue evitando desmontar todo el Hub después de
su primer render. El cambio de identidad no reinicia Studio ni la shell.

## Flujo

```text
ClerkProvider carga sesión
  -> sesión ausente: LoginScreen pinta <SignIn />
  -> sesión activa: session.getToken()
  -> Events.Emit("license:validate", { sessionToken })
  -> ISA-909 valida TPA y resuelve UUID interno
  -> license:changed desbloquea la app

Ajustes > cerrar sesión
  -> Clerk signOut
  -> clearProtectedAuthSession (limpieza legacy)
  -> clearLicense
  -> LoginScreen vuelve a quedar visible
```

## Estructura mínima esperada

- `frontend/src/lib/clerk-auth.tsx`: provider configurado, puente de licencia y
  helpers pequeños de estado; no almacena tokens.
- `frontend/src/hub/auth/LoginScreen.tsx`: marco Vantare + `SignIn` oficial.
- `frontend/src/hub/orbit/use-account-identity.ts`: identidad Clerk.
- `frontend/src/hub/settings-orbit/SettingsOrbitPage.tsx`: logout Clerk y token
  fresco para comprobar acceso.
- `frontend/src/AppShell.tsx`: sustituye el bridge Supabase por el bridge Clerk.
- tests focales y un harness UI dedicado que nunca usa credenciales reales.

Si la implementación necesita más de un nuevo módulo productivo de auth o
modificar Go/SQL/Edge, se pausa y se redivide.

## Estrategia TDD y UI

1. Tests rojos de configuración, carga, sesión activa, fallo de token y logout.
2. Implementación mínima con el SDK mockeado en Vitest.
3. Tests rojos de LoginScreen para `SignIn` y estados accesibles.
4. Sustituir identidad/logout y proteger regresiones existentes.
5. Harness de UI con estados deterministas `loading`, `signed-out` y `error`;
   no simula una autenticación aceptada como prueba real.
6. Playwright en 375, 414, 768, 1024 y 1440 px: overflow, teclado, targets,
   consola, red y screenshots.
7. Wails real con la publishable key local si puede arrancarse sin leer ni
   copiar `.env*`. La prueba navegador y la prueba Wails se reportan separadas.

## Límites

### Siempre

- Pedir un token vigente justo antes de una validación iniciada por el usuario.
- Mantener errores y ausencia de configuración visibles.
- Desmontar listeners y evitar validaciones tardías tras logout.
- Traducir todo texto propio en ES/EN/IT/PT.

### Fuera de alcance

- Billing, Testing Center, borrado de cuenta, Organizations y UserProfile.
- Cambios de schema, Edge o Go ya cubiertos por ISA-909.
- Sincronizar Clerk con `auth.users` o remapear datos reales.
- Deploy de claves/configuración, merge, promoción o release.

## Criterios de éxito

1. Una sesión Clerk activa emite exactamente una validación inicial con un JWT
   obtenido por `session.getToken()`.
2. Una revalidación obtiene otro token en el momento de la acción.
3. Sin sesión se ve el componente oficial; carga/configuración/error no quedan
   en blanco.
4. Logout remoto y limpieza local concluyen antes de vaciar la licencia.
5. La cuenta visible usa nombre, email y avatar Clerk con fallback de licencia.
6. Tests focales, suite frontend, typecheck, lint, build y protocolo UI pasan o
   se reportan con causa exacta.
7. No hay token Clerk persistido por código Vantare, secreto versionado, deploy,
   merge ni cambio de datos reales.

## Riesgos pendientes de prueba real

- WebView2 debe aceptar el dominio/origen de la instancia Clerk y completar el
  flujo real; un navegador Chromium no demuestra esto.
- La persistencia interna del SDK entre reinicios Wails pertenece a Clerk y a
  WebView2. Solo se afirmará después de cerrar y abrir la app real.
- Billing y Testing Center continúan inventariados en ISA-911 y no deben
  presentarse como compatibles con Clerk por este login.
