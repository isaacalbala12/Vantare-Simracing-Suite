# ISA-885 · sesión Clerk real y Supabase TPA local

Fecha: 2026-08-27

Resultado: **BLOCKED en la precondición de compatibilidad Clerk → Supabase**

Alcance: spike no productivo, `roadmap:not-required`

## Conclusión

Una instancia temporal **Clerk development** creada por la CLI oficial, sin
cuenta ni login humano, sí permitió completar fuera de Vantare el ciclo mínimo
de sesión:

- alta con una identidad de prueba reservada por Clerk, sin enviar correo real;
- activación de una sesión en T3 Preview;
- obtención de un Clerk session token con `session.getToken()`;
- renovación forzada con `session.getToken({ skipCache: true })`;
- cierre con `Clerk.signOut()`.

El token observado era un JWT asimétrico de desarrollo válido en forma, pero
**no contenía el claim `role`**. Supabase exige `role=authenticated` para que
sus API acepten una sesión Clerk. La CLI confirmó que el esquema necesario
para configurar ese claim solo está disponible después de reclamar la
aplicación mediante `clerk auth login`. Ese paso requiere identidad e
intervención humana, expresamente fuera de este spike.

Por ello no se arrancó Supabase local ni se envió un token incompatible. La
aceptación TPA real queda **sin demostrar**, no rechazada. No hay base todavía
para implementar la integración en Vantare.

## Matriz de evidencia

| Prueba | Resultado | Evidencia sanitizada |
| --- | --- | --- |
| Crear Clerk development sin dashboard | **PASS** | Clerk CLI 3.2.0 generó una aplicación keyless temporal y no reclamada para un starter Next.js. |
| Usar keyless en React o JavaScript plano | **FAIL** | La CLI respondió que `--keyless` no está soportado para esos dos frameworks y pidió `clerk auth login`; se eligió el único happy path soportado observado, Next.js. |
| Compilar el harness temporal | **PASS** | Next.js 16.3.3 terminó build y TypeScript sin errores. |
| Abrir y operar el harness con T3 Preview | **PASS** | Clerk cargado en un host `*.clerk.accounts.dev`; no se abrió Vantare ni otro navegador. |
| Superar protección anti-bot de forma soportada | **PASS** | Se creó un Testing Token con el Backend API oficial y se aplicó solo a llamadas FAPI, sin imprimirlo ni persistirlo. `captcha_bypass=true`. |
| Alta con identidad reservada | **PASS** | Se usó el subaddress de test documentado por Clerk y su OTP fijo de test. No se usó una identidad real ni se envió correo. |
| Activar sesión | **PASS** | `Clerk.session` y `Clerk.user` quedaron presentes después de verificar la identidad de test. |
| Obtener session token | **PASS** | Tres segmentos JWT, `alg=RS256`, `kid` presente, issuer HTTPS de desarrollo, `sub` presente, `sid` presente y TTL observado de 60 s. El token nunca salió del runtime. |
| Renovar session token | **PASS** | Tras `skipCache: true`, se obtuvo otro JWT; cambió el valor y `iat`/`exp` no retrocedieron. |
| Cerrar sesión | **PASS** | Tras `Clerk.signOut()`, sesión y usuario dejaron de estar activos; la identidad sintética se retiró de `sessionStorage`. |
| Claim Supabase requerido | **BLOCKED** | El session token tenía `role=null`; no era compatible con las API Supabase. |
| Configurar `role=authenticated` sin persona | **BLOCKED** | `clerk config schema --keys session` devolvió `auth_required` e indicó reclamar la aplicación con `clerk auth login`. No se adivinó un patch ni se abrió dashboard. |
| Supabase TPA local acepta el token | **BLOCKED** | No se inició Docker/Supabase porque faltaba una precondición obligatoria del emisor. No existe request TPA que permita afirmar aceptación o rechazo. |
| Mapping Clerk `sub` → UUID interno | **BLOCKED** | Se comprobó que el `sub` usa el namespace de Clerk y no es UUID. El mapping efímero no se ejecutó porque no hubo identidad aceptada por Supabase. El UUID interno sigue siendo la única autoridad prevista. |
| Limpieza local | **PASS** | Servidor parado, cero procesos Node del harness y directorio temporal eliminado. La aplicación Clerk permanece no reclamada y sujeta a la caducidad temporal del proveedor. |

## Fuentes vivas consultadas

Se consultó el changelog actual de Supabase y no se encontró un breaking change
específico de Clerk TPA. También se consultó `search_docs` de Supabase antes de
ejecutar. Las fuentes primarias vigentes establecen que:

- [Supabase: Clerk como third-party auth](https://supabase.com/docs/guides/auth/third-party/clerk)
  requiere configurar la instancia Clerk para compatibilidad, añadir
  `role=authenticated`, registrar localmente el dominio development y entregar
  `session.getToken()` mediante `accessToken`.
- [Supabase: third-party auth](https://supabase.com/docs/guides/auth/third-party/overview)
  confía en los JWT asimétricos emitidos por el proveedor configurado.
- [Clerk: integración con Supabase](https://clerk.com/docs/guides/development/integrations/databases/supabase)
  confirma que las API Supabase requieren `role=authenticated` y que la
  integración nativa añade ese claim.
- [Clerk CLI](https://clerk.com/docs/cli) documenta que `clerk init` puede crear
  claves development temporales sin cuenta.
- [Clerk: Testing Tokens](https://clerk.com/docs/guides/development/testing/overview)
  documenta el token efímero para evitar la detección de bots en pruebas y el
  parámetro FAPI correspondiente.
- [Clerk: identidades de prueba](https://clerk.com/docs/guides/development/testing/test-emails-and-phones)
  reserva direcciones de test y un OTP fijo para development sin entrega real.
- [Clerk: session tokens](https://clerk.com/docs/guides/sessions/session-tokens)
  define el JWT corto y sus claims de sesión.
- [Clerk: renovación forzada](https://clerk.com/docs/guides/sessions/force-token-refresh)
  recomienda `getToken({ skipCache: true })` para acuñar un token nuevo.
- [Clerk: personalizar session token](https://clerk.com/docs/guides/sessions/customize-session-tokens)
  sitúa la edición de claims de instancia en el dashboard.

## Procedimiento ejecutado

Todos los comandos se ejecutaron en un directorio temporal fuera del repo. Los
valores de identidad, claves, cookies, OTP y tokens se omitieron de comandos,
salidas y archivos versionados.

```text
npx --yes clerk@latest --help
npx --yes clerk@latest init --help
npx --yes clerk@latest --mode agent init --framework next --pm npm --keyless -y --no-skills
npm run build
npx --yes clerk@latest config --help
npx --yes clerk@latest config patch --help
npx --yes clerk@latest config schema --keys session
```

El primer `clerk init --starter --framework next --keyless` dejó de producir
salida durante el scaffolding. Se validaron los PIDs y sus líneas de comando,
se cancelaron solo esos procesos y se repitió la inicialización en modo agente
sobre el starter ya creado. No se dejó un proceso colgado.

El harness mínimo temporal contenía únicamente:

1. `ClerkProvider`, `SignUp` y middleware generados por la CLI;
2. un endpoint local que llamaba
   `clerkClient().testingTokens.createTestingToken()`;
3. un interceptor de FAPI equivalente al helper oficial de testing, que
   conservaba el Testing Token en un closure;
4. comprobaciones en T3 que parseaban el session token en memoria y devolvían
   solo tipos, booleanos y claims no sensibles.

La UI se operó con T3 Preview. `preview_snapshot` falló dos veces en la
infraestructura de preview, así que no hay captura visual y no se reclama esa
evidencia. `preview_status`, `preview_navigate`, `preview_wait_for` y
`preview_evaluate` sí respondieron y permitieron verificar el estado observable.

## Evidencia del bloqueo

El session token renovado mantuvo estas propiedades sanitizadas:

```text
alg=RS256
kid_present=true
issuer_is_https_development=true
sub_present=true
sub_uses_clerk_namespace=true
sub_is_uuid=false
sid_present=true
ttl_seconds=60
role=null
```

La CLI oficial devolvió, sin exponer datos de cuenta:

```text
code=auth_required
Config schema is only available for a claimed application.
Run `clerk auth login` to claim this application, then re-run `clerk config schema`.
```

No se ejecutó `config patch`: sin el esquema vivo y sin una aplicación
reclamada habría sido un cambio adivinado, no el happy path oficial.

## Supabase y autoridad del UUID

La configuración local prevista por la documentación sería, solo después de
que el emisor produzca el claim correcto:

```toml
[auth.third_party.clerk]
enabled = true
domain = "<dominio-development-clerk>"
```

No se creó esta configuración, no se inició `supabase start`, no se abrió el
proyecto Supabase activo y no se restauró staging. Docker Desktop tampoco se
inició. No hubo schema, RLS, filas ni usuarios de Supabase.

El dato observado expone una incompatibilidad con el esquema actual descrito
en `docs/supabase-schema-release.md`: `profiles.id` es un UUID de
`auth.users.id` y `user_entitlements.user_id` lo referencia, mientras que el
`sub` observado de Clerk no es un UUID. Antes de producción habrá que definir y
probar cómo reconciliar ambas identidades; este spike no decidió ese mapping y
no permite reutilizar `sub` como si ya fuera la clave UUID del esquema.

## Seguridad y cleanup

- Nunca se abrió, leyó, imprimió ni copió el `.env.local` generado por Clerk.
- Ninguna publishable key, secret key, cookie, OTP, email, user ID, JWT o
  Testing Token fue devuelto por las herramientas o escrito en el repo.
- La identidad de prueba solo existió transitoriamente en el navegador y se
  eliminó antes del cleanup.
- `Clerk.signOut()` dejó la sesión inactiva.
- El proceso de desarrollo se cerró y se verificó que quedaban cero procesos
  Node asociados al harness.
- Se validó la ruta absoluta `C:\tmp\vantare-isa885-clerk-harness` y se eliminó
  por completo. Contenía también el `.env.local` temporal.
- No se reclamó la aplicación Clerk, no se habilitó producción y no hubo
  dashboard, billing, deploy, Supabase remoto ni datos reales.
- La aplicación Clerk development y su usuario sintético no se borraron de
  forma remota porque hacerlo requería reclamar/abrir la instancia. Quedan sin
  reclamar y sujetos al ciclo de caducidad de los recursos temporales de Clerk.

## Paso humano exacto para desbloquear

1. Reclamar **una instancia exclusivamente development** con una cuenta de
   prueba autorizada mediante `npx clerk@latest auth login`; no usar una
   identidad personal ni una instancia productiva.
2. Volver a ejecutar `clerk config schema --keys session` y configurar con el
   mecanismo oficial el claim de sesión `role=authenticated` (o activar Connect
   with Supabase en esa instancia development).
3. Generar una nueva sesión reservada y comprobar, sin imprimir el JWT, que el
   claim ya está presente.
4. Recién entonces crear un proyecto Supabase efímero local, habilitar
   `[auth.third_party.clerk]`, enviar una request mínima y probar el mapping
   `sub` externo → UUID interno con datos efímeros.

Este desbloqueo no requiere SDK propio, manager, provider alternativo ni cambio
productivo. Requiere una única intervención humana sobre una instancia Clerk
development y repetir el último tramo del spike.

## Influencia de la skill Supabase

La skill obligó a consultar documentación y changelog vivos antes de ejecutar,
mantener el experimento local-first y separar autenticación externa de la
autoridad interna. En concreto evitó:

- enviar a Supabase un JWT que carecía del role Postgres requerido;
- usar metadata controlable por el usuario como autorización;
- tocar el proyecto remoto, schema o RLS para compensar un emisor mal
  configurado;
- presentar una comprobación de forma JWT como aceptación TPA real.

El resultado queda deliberadamente **BLOCKED** hasta disponer del claim seguro
y de una prueba local de aceptación.
