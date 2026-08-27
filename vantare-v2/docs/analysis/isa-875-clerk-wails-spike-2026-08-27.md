# ISA-875 — spike mínimo de Clerk en Wails

Fecha: 2026-08-27

Estado: **NO-GO para sustituir hoy la identidad de Supabase por Clerk**

Rama: `vantareapp/isa-875-spike-clerk-wails`

Base inicial exacta: `a02a1463de59c64389c6815c859425af08133833`

Base viva antes de la PR: `c1d4dfa4bcd233df3ea4e15aaa5cc23aeef31e9b`
(rebase limpio; el diff propio continuó limitado a dos rutas).

## Resultado ejecutivo

Clerk puede integrarse con Supabase como proveedor externo, pero no es un
reemplazo directo de la sesión actual de Vantare. El token estándar de Clerk
identifica al usuario con un `sub` propio (`user_...`), mientras que Vantare
mantiene como autoridad un UUID interno. El cliente Wails persiste hoy un par
de tokens de Supabase, el callback recibe esos tokens y la función de licencia
valida una sesión Supabase antes de emitir la credencial offline.

La ruta Clerk evaluable es una sola: el navegador alojado completa el login,
un mecanismo oficialmente soportado activa o recupera esa **sesión Clerk** en
el cliente, `session.getToken()` obtiene su **Clerk session token** y el
callback `accessToken` del cliente Supabase entrega ese JWT a TPA. El nombre
`accessToken` de la opción Supabase no convierte un access token OAuth en un
Clerk session token. Los access/refresh tokens de un authorization code grant
son otro contrato y no se deben publicar al callback Wails como sustituto.

No se encontró ni se probó un SDK o mecanismo oficial para activar, persistir y
renovar esa sesión Clerk desde Windows/Wails después del navegador externo.
Sin esa pieza la ruta queda **BLOCKED**; no se inventa un puente. Una prueba
real también exige una aplicación Clerk de desarrollo, TPA en un Supabase no
productivo y un vínculo server-side entre `clerk_user_id` y el UUID interno.
Esas acciones, y cualquier cambio de schema, RLS o código productivo, están
fuera de este spike `roadmap:not-required`.

La decisión es **NO-GO ahora**, no una declaración de imposibilidad. No se
añadió SDK de Clerk, otra capa de sesiones ni una arquitectura paralela. Polar
sigue siendo autoridad comercial, Supabase conserva los datos y Vantare sigue
siendo autoridad de capabilities, dispositivo y licencia offline.

## Criterios de evidencia

- **PASS**: demostrado con código y tests locales, sin asumir configuración
  remota.
- **FAIL**: el flujo actual no acepta directamente el contrato de Clerk y
  necesitaría un cambio productivo, de datos o configuración.
- **BLOCKED**: no se puede hacer una prueba real sin configuración remota,
  credenciales de desarrollo o interacción Wails fuera del alcance autorizado.

No se leyeron ni copiaron `.env*`, no se usaron secretos y no hubo mutaciones en
Clerk, Supabase ni Polar.

## Matriz de decisión

| Criterio | Caracterización local | Prueba real Clerk | Evidencia |
| --- | --- | --- | --- |
| Navegador externo y retorno Wails | **FAIL** para reutilización directa | **BLOCKED** | El loopback actual recibe tokens Supabase. La ruta elegida debe culminar en una sesión Clerk activa y accesible desde Wails; no se verificó un mecanismo soportado para hacerlo. Tokens OAuth no sustituyen esa sesión. |
| Restauración tras reinicio | **FAIL** para reutilización directa | **BLOCKED** | `authsession.Session` y `setSupabaseSession` restauran un par Supabase. Guardar solo un Clerk session token no restaura ni renueva la sesión Clerk que permite obtener el siguiente token. |
| Refresh y revocación | **FAIL** para reutilización directa | **BLOCKED** | La rotación actual nace de `TOKEN_REFRESHED` de Supabase. Clerk exige su propio ciclo de sesión y volver a obtener `session.getToken()`; no hay ciclo Windows/Wails soportado y probado. |
| Logout y cambio de cuenta | **PASS** para borrado local; **FAIL** para ciclo Clerk | **BLOCKED** | El store se limpia antes del logout remoto actual. Falta terminar la sesión Clerk, revocarla y activar otra cuenta mediante el mismo mecanismo soportado. |
| Token aceptable por Go | **FAIL** como identidad Vantare directa | **BLOCKED** | Go no debe aceptar `sub=user_...` como UUID interno. Tras verificar la identidad Clerk, un mapping server-side debe resolver la cuenta UUID; el test impide el atajo de aceptar un claim auxiliar. |
| Token aceptable por Supabase | **PASS documental para TPA; FAIL en endpoint/schema actuales** | **BLOCKED** | Supabase recibe el Clerk session token mediante `accessToken: async () => session.getToken()`. Aún faltan configuración real, verificación Edge compatible y mapping; Vantare usa hoy `auth.getUser(token)` y `auth.uid()` UUID. |
| Licencia offline | **PASS** para el contrato firmado actual | **BLOCKED** para emisión desde Clerk | La credencial Ed25519 sigue ligada a UUID y fingerprint. Falta probar el mapeo online antes de emitirla. |

## Fronteras actuales que no se deben duplicar

### Sesión de escritorio

1. Supabase abre OAuth en el navegador externo.
2. El callback loopback ligado al intento devuelve tokens Supabase a Wails.
3. Go valida online la licencia y solo persiste access y refresh token cuando
   esa petición concreta quedó validada online.
4. `internal/authsession` guarda el par en el store protegido.
5. Al reiniciar, React lo recupera y llama a `supabase.auth.setSession`.
6. Los refresh Supabase rotan el par protegido; logout lo borra primero.

La protección contra callback no solicitado, sustitución de proveedor y replay
ya vive en `internal/server`; no hace falta otro manager o provider genérico.

### Cuenta, datos y licencia

- El UUID interno es la clave estable y el sujeto de la credencial offline.
  `clerk_user_id` solo podría ser un vínculo externo único.
- Supabase conserva tablas, RLS y Edge Functions. El endpoint de licencia
  obtiene hoy el usuario desde Supabase Auth y las políticas esperan
  `auth.uid()` como UUID.
- Polar conserva productos, órdenes, refunds y suscripciones.
- La credencial firmada conserva capabilities y device binding; Clerk no debe
  emitirla ni convertirse en autoridad comercial.

## Por qué no es un adaptador de una línea

1. Los [session tokens de Clerk](https://clerk.com/docs/guides/sessions/session-tokens)
   incluyen un `sub` Clerk que no se puede reemplazar. Un claim adicional no
   cambia el sujeto que consume hoy Go.
2. La [integración oficial Clerk-Supabase](https://clerk.com/docs/guides/development/integrations/databases/supabase)
   indica que los usuarios Clerk no se sincronizan con Supabase; sus ejemplos
   de RLS comparan texto desde `auth.jwt()` en vez de reutilizar `auth.uid()`.
3. Supabase documenta [Clerk como third-party auth](https://supabase.com/docs/guides/auth/third-party/clerk),
   pero requiere configuración remota. La integración obtiene el Clerk session
   token desde una sesión activa con
   `accessToken: async () => session.getToken()`. Esa opción no equivale a
   `supabase.auth.setSession` ni crea el vínculo con la cuenta Vantare.
4. El [OAuth de cliente público de Clerk](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth)
   puede usar authorization code + PKCE y producir tokens OAuth. Esos tokens
   sirven al grant OAuth y no son automáticamente el Clerk session token que
   Supabase TPA espera de `session.getToken()`; esta no es la ruta elegida.
5. Los redirects del [Account Portal](https://clerk.com/docs/guides/account-portal/direct-links)
   exigen orígenes configurados. Completar el login en el navegador no demuestra
   que Wails pueda activar o recuperar la sesión Clerk. No se encontró una ruta
   oficial específica de Windows/Wails para ese traspaso y renovación.

La conclusión sobre el endpoint y RLS es una inferencia al combinar las fuentes
oficiales con el código actual; no es evidencia de una prueba remota. La ruta
seleccionada se detiene si no existe un mecanismo soportado de sesión Clerk para
Windows/Wails; no reutiliza tokens OAuth ni inventa persistencia propia.

## Prueba mínima añadida

`internal/license/identity_provider_boundary_test.go` caracteriza solo la
frontera existente:

- rechaza `sub=user_...` como cuenta Vantare;
- no acepta implícitamente `account_id` si el `sub` no es UUID;
- conserva el UUID interno como sujeto válido.

No verifica firma JWT porque `subjectFromJWT` extrae la identidad esperada para
contrastarla después con la respuesta autenticada del backend. El test no
convierte ese parser en autoridad de autenticación.

## Siguiente prueba real mínima, si se autoriza

Debe abrirse como trabajo de alto riesgo y con roadmap, no ampliar ISA-875:

1. Designar una instancia Clerk de desarrollo y un Supabase no productivo con
   TPA; nunca usar producción.
2. Usar hosted/native browser auth de Clerk para crear una sesión Clerk y
   activarla en Wails mediante un mecanismo oficialmente soportado. El primer
   gate del experimento es encontrar y ejecutar ese mecanismo también para
   persistencia y renovación en Windows. Si no existe, terminar **BLOCKED** sin
   puente propio.
3. Desde la sesión activa, obtener el Clerk session token con
   `session.getToken()` y entregarlo al cliente Supabase mediante su callback
   `accessToken`. No enviar tokens OAuth al TPA ni guardar el session token como
   si fuera un refresh token durable.
4. Verificar ese session token mediante TPA/JWKS soportado y resolver
   server-side un vínculo único `clerk_user_id -> account UUID`; email no puede
   ser clave primaria ni prueba de identidad. Go conserva el UUID interno y no
   acepta directamente `sub=user_...`.
5. Con la misma sesión soportada, probar reinicio, renovación, revocación,
   logout y cambio de cuenta.
6. Emitir la credencial offline existente para el UUID resuelto y dispositivo;
   desconectar, reiniciar y demostrar continuidad y revocación online.

Si el corte exige migración amplia de RLS o una segunda sesión completa, debe
parar y volver a decisión arquitectónica. No se justifican providers, factories,
managers ni SDKs duplicados anticipados.

## Coste y dependencia

Clerk tiene actualmente un plan Hobby gratuito con límite y planes de pago al
superarlo o necesitar funciones superiores; la referencia vigente es su
[página oficial de precios](https://clerk.com/pricing). Esto no elimina el
coste de integración descrito. No se evaluó ni activó Clerk Billing y no se
añadió ninguna dependencia.

## Evidencia local

- `go test ./internal/license -run TestSessionSubjectRemainsInternalAccountUUID -count=1`: PASS.
- `go test ./internal/authsession ./internal/license ./internal/server`: PASS.
- `pnpm --dir frontend test -- src/lib/supabase-auth.test.ts src/lib/AuthSessionBridge.test.tsx src/hub/auth/LoginScreen.test.tsx`: 3 archivos, 49 tests PASS.
- `pnpm --dir frontend build`: PASS en la base inicial y tras el rebase; generó
  el `dist` ignorado necesario para compilar `cmd/vantare`.
- `go test ./cmd/vantare -run 'TestShouldPersistValidatedSessionRequiresCurrentOnlineValidation|TestResolveLicensePublicKeysCannotOverrideEmbeddedTrustRoot' -count=1`: PASS tras generar `dist`.
- `go test ./...`: FAIL fuera del diff por un timeout en
  `internal/telemetry/drivers/lmu` y un límite temporal en
  `internal/telemetry/recording/sqlite`; todos los paquetes implicados por
  ISA-875 pasaron.
- Repetición aislada de cada caso temporal, primero `-count=1` y después
  `-count=3`: 4/4 PASS por caso. No se modifica ni se atribuye ese flake a este
  spike.
- Segunda ejecución de `go test ./...`: PASS completa, incluidos los dos
  paquetes que habían agotado su límite temporal.
- Tras rebasar sobre la base viva: build frontend, los 49 tests focales,
  paquetes Go focales, `cmd/vantare` y `go test ./...`: PASS.
- `git diff --check`: PASS antes de cerrar la evidencia.

El primer intento de compilar `cmd/vantare` quedó bloqueado por no existir
`frontend/dist` en el worktree limpio. No fue un fallo funcional. Se ejecutó
`pnpm install --frozen-lockfile` sin cambiar el lockfile y después el build para
generar el artefacto ignorado antes de repetir el gate.

## Evidencia remota de la PR draft

En la ejecución `33033227983` sobre `e60cb577`, los checks superiores
`Validate promotion path`, `Validate Vantare blocking gates` y
`GitGuardian Security Checks` terminaron en éxito. Dentro del blocking gate
pasaron build frontend, contrato TypeScript de telemetría, tests Go, tests
frontend, lint del diff y build Windows Wails.

Ese éxito agregado no significa que todos los comandos fueran verdes. Dos pasos
`human-channel advisory`, configurados como no bloqueantes, registraron fallos:

- `Overlay Studio visual baselines`: `pnpm visual:overlay-studio` terminó con
  `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL` porque el script no existe. El propio
  log sugirió `visual:orbit-studio`.
- `Global frontend lint debt`: `pnpm lint` encontró el error heredado
  `_damage is defined but never used` en
  `frontend/src/overlay/widget-types/car-damage-numbers/car-damage-numbers-view-model-v2.ts:93:39`.

Ambos fallos son advisory/no bloqueantes y sus rutas son ajenas al diff de
ISA-875. Se reportan; no se presentan como PASS ni se corrigen en este spike.

## Gobierno y cierre

- `docs/roadmap/plan.md` no cambia: no hay comportamiento público y la issue
  conserva `roadmap:not-required`.
- `platform-commercial.md` no cambia porque la allowlist cerrada de la exención
  solo admite tests y `docs/analysis`. Todo estado material va a la issue #875.
- No hubo migración de usuarios, schema o RLS, configuración o mutación remota,
  secretos, producción, Clerk Billing/Stripe, merge, promoción ni release.

## Verificación manual

1. Ejecutar los comandos de evidencia.
2. Comprobar que el diff solo contiene este análisis y el test de frontera.
3. Confirmar que package/lockfiles, código productivo, schema y RLS no cambiaron.
4. No marcar como probado Clerk/Wails: los casos remotos permanecen **BLOCKED**
   hasta un corte de desarrollo autorizado.
