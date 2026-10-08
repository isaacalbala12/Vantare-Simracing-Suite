# Clerk de producción — app nativa (#1507)

Código sobre candidato beta `a8f9bdc3`; decisión de Isaac, §6j de
`DECISIONES-VANTARE.md` (08-oct-2026). Procedimiento para Isaac: **no acredita
instancia creada, DNS aplicado, despliegue, build productiva ni login real**.
El flujo de compra con login pertenece a #1506 y no se modifica aquí.

## Preparación CLI autorizada — 08-oct-2026

Isaac autorizó esta continuación mediante `npx -y clerk@3.4.1`, con su sesión
existente. No se crea otra instancia ni se consultan/modifican usuarios.
Aplicación `Vantare One`, `app_3IWU2X4AuYRQJgZZuBF0cOGO2Ir`; Production
`ins_3KCjsAhL9oCANH5ZBWt8fqmTvKm`, issuer `https://clerk.vantare.app`.

Cliente creado con `api /oauth_applications -X POST --file <json-publico> --yes`
y destino explícito `--app <app> --instance <production>`: **Vantare Native
Production**, ID `oa_3KQZKuDiky0vCJNCt0BW2yzPsQR`, client ID público
`n5cqSYkpsTiEw6jk`, `public=true`, `pkce_required=true`, scopes
`openid profile offline_access`, redirect `http://127.0.0.1/callback`.
La build debe usar `http://127.0.0.1:0/callback` para puerto dinámico.
La respuesta se filtra a campos públicos; ningún client secret se conserva.
PKCE global ya estaba activo y no se cambia.

Plantilla versionada: `native/packaging/build-config-production.template`, solo
nombres y client ID público. Completar una copia externa después de verificar
DNS/TLS y el servidor; nunca añadir secretos de servidor. `CLERK_SECRET_KEY`,
`CLERK_NATIVE_CLIENT_ID` y `CLERK_ISSUER` son nombres de configuración del
servidor que debe coordinar #1514; el client ID debe coincidir con el anterior.

Coordinación comprobada: `gh pr view 1523` y diff completo, HEAD `907989d6`.
No cambia `native/hub/src/services/access.rs` ni otro archivo nativo. Third-party
auth Supabase, token de sesión y webhooks pertenecen exclusivamente a #1514.
OAuth nativo sigue siendo un bearer distinto del token de sesión: no se convierte
en JWT Supabase. No importar ni duplicar esa implementación en #1516.

Orígenes aplicados con `api /instance -X PATCH --file <json-publico> --yes`
y releídos: `https://vantare.app`, `https://www.vantare.app`,
`https://accounts.vantare.app`. Allowlist de subdominios activada solo para
`www.vantare.app` y `accounts.vantare.app` (el dominio raíz es el principal).
No comodines, orígenes locales ni esquemas inventados: GPUI usa navegador del
sistema y HTTP nativo, no un renderer web. El loopback pertenece a los
`redirect_uris` del cliente OAuth; `/redirect_urls` de SSO móvil está vacío y
no es necesario para este flujo. No modificar `authorizedParties` ni claims
de sesión del backend de #1514 desde este paso.

Dominio releído por `api /platform/applications/<app>/domains/vantare.app
--platform`: FAPI `https://clerk.vantare.app`, portal
`https://accounts.vantare.app`. Alta nativa:
`https://accounts.vantare.app/sign-up`; reset nativo:
`https://accounts.vantare.app/sign-in?__clerk_reset_password=true`.
Estas son las URL que genera el Hub con el portal de build; DNS/TLS impide
verificar sus pantallas. Los Paths web existentes `/acceso/` y
`/acceso/?modo=registro` se conservan; no sustituir el acceso web de #1506.
Alta pública, email verificado y contraseña obligatoria (mínimo 8) ya estaban
activos. No se alteran usuarios, política de contraseña ni proveedores sociales.

`deploy status` y `api /platform/applications/<app>/domains/vantare.app/status
--platform` detectan DNS, TLS y mail pendientes. Se lanzó comprobación explícita
con `.../dns_check --platform -X POST --yes`; no acredita registros creados.
Clerk exige estos **cinco CNAME, todos DNS only (`proxied=false`)**:

| Nombre | Destino exacto solicitado por Production | Acción en esta entrega |
|---|---|---|
| `clerk.vantare.app` | `frontend-api.clerk.services` | Pendiente, no creado |
| `accounts.vantare.app` | `accounts.clerk.services` | Pendiente, no creado |
| `clkmail.vantare.app` | `mail.io5mnlv19xt7.clerk.services` | Pendiente, no creado |
| `clk._domainkey.vantare.app` | `dkim1.io5mnlv19xt7.clerk.services` | Pendiente, no creado |
| `clk2._domainkey.vantare.app` | `dkim2.io5mnlv19xt7.clerk.services` | Pendiente, no creado |

Bloqueo comprobado: `npx wrangler --help`, `whoami` y
`login --scopes-list` (4.149.0): no comando DNS, sesión con `zone:read`, sin
DNS Write entre sus permisos ni scopes de login. No extraer token ni leer su
archivo de credenciales para construir otra vía. Isaac debe añadir estos
registros en Cloudflare o proporcionar un mecanismo oficial autorizado con DNS
Write; después verificar DNS y desplegar certificados en Clerk. Google también
figura pendiente de credenciales propias: no se habilita ni se elimina.

Sin DNS/TLS, servidor coordinado con #1514 y build productiva no se puede
probar login aislado. Siguiente paso de Isaac: DNS/certificados y credenciales
sociales si se van a ofrecer, completar #1514, copiar/completar la plantilla
fuera del repo, compilar Hub/services juntos y usar una cuenta de prueba
existente elegida por Isaac en una raíz aislada. Alta/reset/refresh/logout y
licencia/RLS requieren ese recorrido; no equivalen a la lectura administrativa.

Los apartados siguientes describen la preparación completa; la instancia ya
existe y **no se debe repetir su creación**. La exclusión administrativa del
worker original queda reemplazada solo por esta autorización de configuración.

## 1. Instancia y DNS — Isaac

1. Clerk Dashboard → Development → Create production instance. Clonar ajustes
   deseados; revisar nuevamente Paths, integraciones y conexiones sociales,
   que no se copian. Conservar la instancia Development.
2. Configurar dominio propio. Ejemplos, **no valores comprobados**: issuer/FAPI
   `https://clerk.vantare.app` y Portal `https://accounts.vantare.app`. Usar los
   orígenes reales que muestre Production en Clerk.
3. Habilitar alta, contraseña y recuperación por email. Revisar política de
   contraseña y entrega de correo. Google/Discord necesitan credenciales propias
   y callbacks indicadas por Clerk, no las compartidas de Development.
4. Domains → copiar todos los registros solicitados, incluidos los de email/DKIM.
   En Cloudflare añadir exactamente esos registros; CNAME de Clerk en **DNS only**,
   sin proxy naranja. No inventar destinos ni copiar los de Development.
5. Verificar registros desde Clerk y desplegar certificados cuando el panel lo
   permita. Si DNS/TLS no están correctos, detener el corte público.
6. Comprobar Account Portal y Paths: `/sign-up`, `/sign-in` y recuperación.
   La app mantiene `/sign-in?__clerk_reset_password=true`; comprobar el flujo
   real de email/reset: el test de URL no demuestra esa pantalla en Clerk.

La ruta Cloudflare del puente de datos es independiente; no cambiarla como
parte de DNS Clerk. `VANTARE_ACCOUNT_BRIDGE_URL` puede conservar el endpoint
Edge exacto ya autorizado.

## 2. OAuth nativo — Isaac

1. Production → OAuth applications → crear cliente de la app nativa. Activar
   **Public** y **Require PKCE (S256)**. No distribuir client secret.
2. Permitir authorization code y refresh, scopes
   `openid profile offline_access` (los solicitados por `Account`).
3. Callback IPv4 loopback. Para puerto fijo: registrar y compilar el mismo
   `http://127.0.0.1:<puerto>/callback`. Para dinámico: registrar
   `http://127.0.0.1/callback` según el soporte loopback de Clerk y compilar
   `http://127.0.0.1:0/callback`; la app sustituye 0 por el puerto asignado.
   No cambiar a localhost, HTTPS o esquema propio.
4. El client ID público de `VANTARE_CLERK_CLIENT_ID` debe coincidir con
   `CLERK_NATIVE_CLIENT_ID` del servidor y pertenecer a esta instancia.
5. Comprobar públicamente `/.well-known/openid-configuration` del issuer:
   issuer exacto (barra final tolerada), authorize/token/userinfo del mismo
   origen HTTPS, sin query/fragmento/credenciales y S256 anunciado.

La app obtiene identidad por `/userinfo`, conserva PKCE/refresh y no interpreta
el bearer OAuth como JWT Supabase ni concede derechos desde el ID token.
Clerk admite OAuth JWT y opaco; el servidor actual verifica mediante Backend API.
Discovery y sesión guardada quedan ligados a issuer/client/redirect o identidad:
cambiar issuer/client obliga a iniciar sesión de nuevo, sin migración automática.

## 3. Supabase y tokens — Isaac

1. Confirmar proyecto y functions desplegadas del SHA aceptado. Actualizar juntas
   por mecanismos seguros las variables de servidor **de Production**:
   `CLERK_SECRET_KEY`, `CLERK_NATIVE_CLIENT_ID`, `CLERK_ISSUER`. No poner sus
   valores en chat/logs, argumentos, repo ni build-config.
2. `native-license` y `native-account-authorize` reutilizan
   `supabase/functions/_shared/native-auth.ts`: verifican bearer en Clerk,
   cliente, scopes openid/profile, sujeto, revocación y caducidad. El issuer es
   configuración confiable del servidor. Mantener su autenticación propia y
   `verify_jwt=false`; el gateway JWT legacy no sustituye la verificación OAuth.
3. Clerk Production → Connect with Supabase: activar integración nativa de
   **tokens de sesión**, claim `role=authenticated`. Supabase → Authentication
   → Third-Party Auth → Clerk: registrar el dominio/issuer de Production mostrado
   por Clerk. Confirmar JWKS asimétrico y `kid`. No crear la plantilla JWT
   Supabase obsoleta ni copiar el secreto JWT a Clerk.
4. Third-Party Auth permite sesión Clerk a sus consumidores, pero **no convierte
   OAuth nativo en bearer de datos**. La app conserva `native-account-authorize`
   → bearer Supabase corto con UUID interno. Verificar también firmador y
   gateway/RLS según su README: esta integración no corrige claves incompatibles.
5. Inventariar mapping `(issuer, subject)` → `profiles.id`, Owner/testers y
   licencias. Usuarios Development y Production son identidades distintas; no
   conceder por email ni reasignar UUID/compras con scripts improvisados. Una
   vinculación de cuentas existentes requiere revisión y autorización propia.

Third-party auth, session token y webhooks los configura #1514; no desplegar ni
duplicar esos cambios desde este worker. La clave privada de
licencia y la del puente de datos siguen en servidor; el cambio de issuer no
requiere meterlas en el cliente.

## 4. Plantilla de build-config productivo

Copiar `native/packaging/build-config-production.template` **fuera del repo**
como `C:/tmp/beta/build-config/beta-prod-clerk.env`. Plantilla no ejecutable
hasta completarla con datos públicos de Production; conserva el client ID
público verificado en la sección CLI. Los nombres son:

```dotenv
VANTARE_SUPABASE_URL=
VANTARE_SUPABASE_ANON_KEY=
VANTARE_LICENSE_PUBLIC_KEYS=
VANTARE_CLERK_ISSUER=
VANTARE_CLERK_CLIENT_ID=
VANTARE_CLERK_REDIRECT=
VANTARE_CLERK_ACCOUNT_PORTAL_URL=
VANTARE_ACCOUNT_BRIDGE_URL=
```

Portal = origen HTTPS DNS, sin ruta salvo `/`, puerto no estándar, query,
fragmento o credenciales. La app añade alta/reset. Sin portal explícito solo
deriva `*.clerk.accounts.dev` → `*.accounts.dev`; producción sin portal o un
portal inválido muestra error y no abre URL. `VANTARE_POSTHOG_KEY` es opcional:
omitir la línea si no se usa. No incluir secretos de Clerk, claves privilegiadas
Supabase ni claves privadas. El importer rechaza nombres desconocidos,
duplicados, valores vacíos y claves privilegiadas. Canal/versión los fija el builder.

Son variables de **build**: compilar Hub y servicios juntos por la cola.
Cambiar el entorno al arrancar no cambia el binario. QA, sin distribuir:

```powershell
cd C:/tmp/vw3-1507/vantare-v2/native
pwsh -NoProfile -File C:/tmp/fase2/compilar.ps1 pwsh -NoProfile -File ./gates.ps1 `
  -Gate prueba -BuildConfig C:/tmp/beta/build-config/beta-prod-clerk.env
```

Release/firma/publicación son pasos separados tras aceptación. Seguir
`native/packaging/README.md` usando ese ConfigFile; no distribuir perfil prueba.

## 5. Prueba con login real tras la preparación de Isaac

Instancia, DNS, servidor y build ya configurados, pantalla libre y raíz QA
aislada; no usar los datos/DPAPI de la instalación real:

1. Isaac selecciona su cuenta de prueba existente de Production. El worker
   no crea/modifica usuarios. Comprobar el enlace de alta sin enviar el formulario
   y volver a la app para iniciar OAuth; el portal no completa ese callback.
2. Probar email/contraseña, Google y Discord: consentimiento, callback loopback,
   sesión confirmada y renovación de licencia válidos.
3. Recuperar contraseña por email desde el enlace de la app. Cancelar/reintentar
   login; reiniciar en frío; comprobar refresh y logout.
4. En entorno de prueba, token Development, cliente distinto, expirado/revocado
   a native-license/authorize → 401/403 sin datos ni licencia. Token Production
   correcto → UUID interno y credencial Ed25519 válida; derechos de esa cuenta.
5. Probar bearer de datos de authorize y lectura RLS permitida. #1506 prueba
   su token de sesión y bootstrap UUID antes de checkout.
6. Registrar SHA de build/servidor, instancia, PASS/FAIL y capturas sanitizadas,
   sin tokens, claves, emails o IDs personales. Repetir login con build Development
   para acreditar compatibilidad real, además de los tests deterministas.

Rollback: detener distribución y volver a artefacto/configuración de servidor
anteriores como pareja revisada. No borrar cuentas/DNS ni reutilizar tags.

## 6. Coordinación web / #1506 (solo lectura)

#1506 exige Clerk antes de `billing-checkout`, atribución al UUID interno y
pruebas Polar sandbox. Su worktree es `C:/tmp/vantare-isa1506`, rama
`vantareapp/isa-1506-polar-atribucion`; no se modificó ningún archivo suyo.
Web inspeccionada: `C:/Users/isaac/Desktop/Vantare Beta Web`, rama
`flagship-experience`, SHA `c120b457`; no había referencias Clerk/billing-checkout
en `src/`, `docs/` o `wrangler.jsonc`. No asumir que es el checkout nuevo del worker.

Contrato a coordinar: misma instancia Production/Supabase, publishable key
productiva del SDK web (nombre definitivo lo fija #1506), Portal/Paths del dominio
público y token de sesión fresco para bootstrap/checkout. Si el worker usa Vite,
puede fijar un nombre público como `VITE_CLERK_PUBLISHABLE_KEY`; no se verificó
una variable Clerk ya implantada en la web inspeccionada. La app nativa usa
issuer/client/redirect, no esa key. Secret key solo en servidor. La atribución
Polar sigue usando UUID interno resuelto en servidor, no email ni Clerk sub.
Sesión web y OAuth nativo son bearers diferentes; no añadir OAuth al checkout.

Preguntas para revisión: ¿checkout web definitivo y nombre de su variable Clerk?
¿hay cuentas/licencias Development que vincular antes del corte? Recomendación:
confirmar ambos con #1506/Isaac antes de distribuir; usar alta nueva Production
para la prueba aislada. Código preparado no equivale a corte productivo validado.

## Fuentes verificadas (08-oct-2026)

- [Clerk: producción/DNS](https://clerk.com/docs/guides/development/deployment/production).
- [Clerk: OAuth público, PKCE y formatos](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth).
- [Clerk: callback loopback](https://clerk.com/blog/adding-clerk-auth-to-your-cli).
- [Clerk: verificación OAuth](https://clerk.com/docs/guides/configure/auth-strategies/oauth/verify-oauth-tokens).
- [Supabase: Third-Party Auth Clerk](https://supabase.com/docs/guides/auth/third-party/clerk).
- Código: `native/services/src/{config,account,license_remote,bridge}.rs`,
  `supabase/functions/_shared/native-auth.ts`, README `native-account-authorize`.
