# Spec SDD: cuenta nativa Clerk → licencia

Fecha: 2026-10-02. [Issue #1444](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1444).
Estado: diseño inicial conservado como antecedente; simplificación aprobada por Isaac
en la sección final. Servidor preparado para revisión de Opus; sin deploy.
Proyecto técnico: plataforma/cuenta/licencias y Hub nativo, bajo [ADR 0099](../../adr/0099-arquitectura-rust-nativa.md)
y su [plan](../plans/2026-09-29-arquitectura-rust-nativa.md).
Notion no está disponible: excepción explícita del encargo para trabajar con GitHub;
ID, proyecto y actualización Notion **sin verificar**, seguimiento allí pendiente.

## 1. Estado comprobado y límites de la evidencia

Inspección sobre `vantareapp/isa-1444-puente-cuenta-nativa@e686c6c9430ed5f570bb8b397ed854a6de35fc6a`;
base común con `origin/nightly`: `f29b5fee04022756f9ae59f19bf153f91eebe4ed`, obtenida por fetch.
Los hechos locales siguientes describen este checkout, no un artefacto publicado.

| Pieza | Estado real |
|---|---|
| Cuenta nativa | `native/services/src/account.rs` implementa discovery, OAuth Authorization Code + PKCE/S256, callback loopback, refresh y userinfo; guarda la sesión protegida. #1444 informa login real tras `0841b8fe`/`e686c6c9`; este worker no lo repitió. |
| Puente | `app.rs::configure_bridge` existe pero `bin/vantare-services.rs` no lo llama. `ensure_data` devuelve `BridgeUnconfigured`; login por sí solo no obtiene licencia. |
| Licencia local | `license_remote.rs` pide v1, verifica Ed25519/UUID/dispositivo, guarda candidate y lo transfiere al núcleo. `runtime/src/rights/{mod.rs,host.rs}` requiere `VANTARE_LICENSE_PUBLIC_KEYS`; sin ellas no abre la autoridad. Núcleo, no Hub, decide derechos. |
| Hub | `services/view.rs` llama a `LicenseStatus` en «Comprobar acceso» y conserva plan/módulos fijos. `services/access.rs` ya proyecta política vigente para `shell/navigation.rs`. |
| #909 / PR #913 | PR **OPEN, draft, sin merge**, head `c00c38bcc9e0a383379b4555842cf0839d1a830e`. Rama `origin/vantareapp/isa-909-clerk-account-bootstrap`: mapping `(iss,sub)` → UUID, migración `20260828124540_clerk_account_bootstrap.sql`, RPC de licencia y cambios Edge/Go. No están en esta base. El cuerpo del PR conserva un SHA anterior: no usarlo como head actual. Deploy remoto **sin verificar**; el PR declara que su corte no desplegó schema/Edge. |
| #885 | Rama `origin/vantareapp/isa-885-clerk-session-tpa@48ab9ee2ec9344c0ccf2f2c7a2dbb2875c08be7c`: informe de PASS de **session JWT Clerk → TPA local**, con límites de cleanup. No prueba OAuth nativo, Supabase remoto ni licencia real. |
| #915 / PR #1187 | Login Wails con `session.getToken()`, no OAuth access token. #1187 **OPEN, draft, sin merge**, head `a3545e3afae3f0491a4937f2d09d270a9fcb0649`. Wails empaquetado y QA descritos como pendientes; no prueban este puente. |
| Remotos | Versiones desplegadas de Functions, migraciones aplicadas, TPA, claves de firma y grants reales: **sin verificar**. No se usaron credenciales Clerk/Supabase ni paneles remotos. |

`supabase/` está en la raíz Git. Existen `billing-checkout`, `billing-portal`,
`billing-webhook`, `license-credential`, `testing-center-feedback`,
`testing-center-linear-worker`, `testing-center-linear-webhook`,
`testing-center-agent-dispatch` y `testing-center-agent-callback`; presencia en Git
no acredita despliegue. `_deprecated/validate-license` no es una alternativa.

En la base, `license-credential/index.ts` usa `_shared/auth.ts::requireUserAuth`
(`supabase.auth.getUser(token)`, UUID Supabase Auth). Espera POST con solo
`deviceFingerprint`, SHA-256 hex minúsculo de 64 caracteres. Devuelve
`credential` v1 y `online_capabilities`; lee grants comerciales y roles operativos
del servidor y firma con `OFFLINE_LICENSE_KEY_ID` / `OFFLINE_LICENSE_ED25519_PRIVATE_KEY`.
La respuesta firmada contiene issuer `vantare-license`, subject UUID, huella,
fecha de emisión y capabilities. `online_capabilities` no concede derechos locales.

En #913 el handler obtiene el UUID de `claim_active_device` bajo el bearer validado
por PostgREST/TPA; no confunde el `sub` Clerk con el UUID. Su config añade
`[functions.license-credential] verify_jwt = false`; en esta base falta esa entrada
y la configuración TPA. Los cuatro RPC adaptados son `claim_active_device`,
`read_account_entitlements`, `reset_active_device` y `get_account_entitlements`.
El deploy wrapper actual solo permite las cuatro Functions comerciales/licencia;
no existe `native-account-authorize` en ese inventario.

En Go/Wails (`internal/license`), la base compara subject del JWT con la licencia;
#909 separa identidad externa y UUID firmado tras validación online. El nativo
ya compara la credencial con `DataSession.account_id`: reutilizar esa frontera,
sin portar el login Wails ni suponer que OAuth se convierte en session JWT.

## 2. Qué token usa el nativo

Usa el **OAuth access token** del cliente público «Vantare Desktop (nativo)»,
instancia development; no un ID token ni el session token de #885/#915.
`C:/tmp/clerk-native.txt` contiene únicamente configuración pública: issuer,
client ID y redirect `http://127.0.0.1:47813/callback`; no contiene el formato del token.

GET público verificado en esta revisión:
`https://enabled-lionfish-1336.clerk.accounts.dev/.well-known/openid-configuration`.
Publica `/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`, `/oauth/token_info`,
PKCE S256 y scopes `openid`, `profile`, `offline_access`. Su JWKS público tiene
una clave RS256. Esto acredita metadata disponible, **no el formato configurado
para este cliente**. JWT u opaco en un login real: **sin verificar**; no se leyó ningún token.

Clerk permite ambos formatos y documenta JWT como valor predeterminado actual;
no deducimos el ajuste de esta instancia del valor predeterminado.
Un JWT OAuth admite verificación con la clave pública/JWKS de la instancia;
un opaco exige consulta a Clerk. [Formato y configuración oficial](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth),
[comparación de formatos](https://clerk.com/docs/guides/development/machine-auth/token-formats).

**Decisión mínima propuesta:** validar cada intercambio en el servidor por la
API oficial OAuth de Clerk (`POST https://api.clerk.com/oauth_applications/access_tokens/verify`,
body `{"access_token":"<bearer recibido>"}`), con Secret Key solo del backend.
Así no se crea un segundo verificador JWT ni se adivina el formato.
El resultado debe acreditar usuario, cliente nativo, scopes y vigencia; si falta
alguno, denegar. No basta decodificar un JWT o detectar puntos en su texto.
[Verificación OAuth oficial](https://clerk.com/docs/guides/configure/auth-strategies/oauth/verify-oauth-tokens),
[identidad, clientId y scopes OAuth](https://clerk.com/docs/reference/backend/types/auth-object).

`userinfo` sirve para obtener `sub` después de validar el bearer, pero solo no
demuestra que pertenece al cliente autorizado. La introspection `/oauth/token_info`
documentada requiere client ID **y client secret**: no asumir que sirve con este
cliente público ni añadir un secret al binario. Si la API de verificación no aporta
todos los campos necesarios, queda bloqueada la fase servidor hasta confirmar
un mecanismo oficial, sin fallback por email.
[Userinfo e introspection](https://clerk.com/docs/guides/configure/auth-strategies/oauth/single-sign-on).

Para JWT con verificación local futura: firma/algoritmo/kid, issuer exacto,
audiencia y binding de cliente conforme al contrato OAuth comprobado, tiempos y
scopes; JWKS fijado al issuer permitido, nunca URL del token. Ese cambio exige
pruebas propias y decisión sobre revocación; no es necesario para el primer corte.

## 3. Una frontera OAuth → cuenta interna → sesión de datos

Endpoint propuesto: `POST /v1/native-account/authorize` en **un origen HTTPS
Vantare aprobado, distinto del origen `VANTARE_SUPABASE_URL`**. URL y propietario
pendientes; este spec no inventa un dominio desplegado. Puede alojar una sola
Edge Function `native-account-authorize` tras ese dominio, sin redirect ni proxy
que registre Authorization. El alias debe acreditarse antes del wiring:
`bridge.rs::Config::authorize` rechaza en producción un origen igual a Supabase.
Si se aloja como Edge, su entrada necesita `verify_jwt=false`: el gateway no
valida OAuth Clerk como JWT Supabase. El handler verifica OAuth antes de cualquier
acceso privilegiado; una petición anónima siempre obtiene 401.

Flujo único:

1. Validar exclusivamente OAuth de la instancia/cliente fijados en servidor;
   exigir `openid profile`, vigencia y un sujeto de usuario, no de organización.
   `offline_access` es para refresh del cliente, no concede licencia.
2. Derivar `(iss,sub)` del proveedor validado: issuer canónico de discovery y
   usuario autenticado. Normalizar solo la barra final conforme al issuer real:
   `account.rs` guarda URL con barra y #909 compara texto; dos formas no deben
   crear dos cuentas. Dos mappings preexistentes que colisionen al normalizar
   devuelven conflicto; corregir datos reales requiere aprobación, no autoenlace.
   Comprobar que userinfo, si se consulta, coincide con el
   usuario de la verificación. Ningún issuer/subject/email/accountId viene del body.
3. Reutilizar **la misma** `account_identities` y el bootstrap transaccional de
   #909: lock por par, unicidad, una cuenta, sin perfiles huérfanos. Extraer su
   lógica a un resolver privado de par validado; `resolve_current_account()`
   continúa como adaptador TPA/legacy. Entrada del puente solo para rol servidor
   autorizado, con `search_path=''` y permisos revocados a usuarios/anon.
   No fabricar `auth.jwt()` ni exponer un RPC que acepte identidad elegida por usuario.
4. Emitir bearer de datos limitado, ligado al UUID resuelto. No entregar
   service_role ni fabricar un session token Clerk. Credencial de licencia v1
   se obtiene después mediante el handler existente, con el bearer de datos.

### Contrato HTTP v1 compatible con `bridge.rs`

Request: HTTPS, `Authorization: Bearer <OAuth access token>`,
`Content-Type: application/json`; **sin apikey**. Body exacto:

```json
{"version":1}
```

Rechazar campos extra, versión distinta, body >1 KiB y bearer vacío o >16 KiB.
No aceptar refresh/ID/session tokens, email, accountId, fingerprint o capabilities.
HTTP 200, `Content-Type: application/json`, `Cache-Control: no-store`:

```json
{
  "version": 1,
  "account_id": "<UUID interno>",
  "data_access_token": "<JWT de datos firmado por el servidor>",
  "expires_at": 1234567890
}
```

`expires_at` es Unix UTC en segundos, igual a `exp`; TTL máximo 300 s y nunca
superior a la vigencia comprobada del OAuth. Se propone emitir 240 s para
tolerar latencia/desfase; `services` ya exige `now < expires_at <= now+300`,
token no vacío ≤16 KiB y respuesta ≤64 KiB, con campos desconocidos denegados.
No añadir `credential` a esta respuesta: rompería su deserialización estricta.
El bearer de datos solo vive en memoria, ligado a identidad/generación de cuenta;
logout, cambio de identidad, refresh/generación nueva o caducidad lo invalidan.

Errores, todos con `Cache-Control: no-store` y body
`{"error":"<código>","message":"<texto genérico sin PII>"}`:

| HTTP | Código | Tratamiento actual en servicios |
|---|---|---|
| 400 | `invalid_request` | `Protocol`; no reintento automático. |
| 401 | `unauthorized` | `Authentication`: token ausente, inválido, vencido/revocado. |
| 403 | `forbidden` | `Denied`: instancia/cliente/scopes no autorizados. |
| 409 | `account_conflict` | `Conflict`: mapping incoherente; nunca vincular por email. |
| 405 / 413 | `method_not_allowed` / `request_too_large` | `Protocol`. |
| 429 | `rate_limited` | `Offline`; acción manual posterior. |
| 503 | `bridge_unavailable` | `Offline`: Clerk/DB/firma no disponibles o configuración incompleta. |

No usar 503 para ocultar rechazo de autenticación. Sin tokens, bodies de OAuth,
emails ni UUID reales en logs; métricas solo de clase de error. TLS, sin redirects,
plazo cliente actual 8 s y límites de servidor inferiores. Sin polling ni POST
reintentados automáticamente. Repetir una autorización manual solo reusa el
mapping; no crea grants económicos.

### El bearer necesita un contrato servidor; no basta devolver cualquier JWT

Propuesta: JWT ES256 con `kid` dedicado, `iss` fijo del puente (distinto de Clerk
y de `/auth/v1`), `aud="authenticated"`, `role="authenticated"`, `sub=UUID interno`,
`iat`, `nbf=iat`, `exp<=iat+300`; sin PII, grants ni claims editables.
Clave de datos distinta de la Ed25519 de licencia. Supabase permite JWT externos
con **una signing key importada**; su disponibilidad/configuración en este proyecto
está **sin verificar** y requiere autorización, no un JWT secret legacy como atajo.
[JWT externos](https://supabase.com/docs/guides/auth/jwts),
[signing keys e importación](https://supabase.com/docs/guides/auth/signing-keys).

Este diseño requiere un ajuste explícito de #909: el resolver debe reconocer
solo ese issuer de datos validado y devolver `sub` UUID **ya existente** en
`profiles`/mapping, sin bootstrap nuevo. No entra por la rama legacy que exige
`auth.users`; tampoco se registra `(issuer del puente, UUID)` como otra identidad.
Las entradas Clerk TPA y Supabase Auth conservan sus validaciones anteriores.
Edge verifica el bearer de datos con la clave/audiencia/issuer fijados antes de
su RPC; PostgREST verifica firma/exp/rol. No confiar en `getUser()` ni asumir que
`getClaims()` valida este JWT propio; no necesita una sesión Supabase Auth.

La firma importada debe pasar pruebas reales **locales** del gateway Edge,
PostgREST y los RPC antes de elegir configuración de deploy. `verify_jwt=false`
solo es admisible con verificación dentro del handler; no implica acceso anónimo.
TTL corto y RLS limitan tiempo/cuenta, pero `authenticated` no limita por sí solo
a tres rutas: auditar toda superficie accesible a ese rol antes de habilitarlo.
La allowlist del cliente no protege frente a un bearer usado fuera de la app.
Sin aceptación de clave/issuer/RLS demostrada, el puente permanece sin configurar;
una API de recursos distinta sería otro contrato revisado, no fallback silencioso.

Continuación existente de `LicenseRenew`: POST a
`functions/v1/license-credential`, Authorization **de datos** y apikey anon,
body `{"deviceFingerprint":"<64 hex>"}`; respuesta exacta
`{"credential":<CredentialV1>,"online_capabilities":[...]}`.
Se conserva v1 y `409 error=device_limit`; no se inventa enrollment/JWS v2.
`reset_active_device` conserva body `{"device_fingerprint":"<64 hex>"}` y acción
manual. Testing Center mantiene su preview/consentimiento; no se envía nada al login.

## 4. Wiring mínimo del cliente y del Hub

Cambios posteriores, fuera de esta entrega:

- `services/src/config.rs`: nuevo valor público de compilación
  `VANTARE_ACCOUNT_BRIDGE_URL`, validado con `remote_url`. Sin URL acordada o
  config de datos completa, estado explícito de puente no configurado; OAuth
  continúa funcionando. No derivar URL del issuer ni usar Supabase Auth fallback.
- `services/src/bin/vantare-services.rs`: después de `App::new`, llamar una vez
  a `configure_bridge(Config { authorize, supabase, anon_key })` cuando la
  configuración pública completa sea válida, antes de `host::serve`. URL nunca
  desde IPC/Hub. Reutilizar `ensure_data`, `DataRequest` y `license_remote::renew`.
- `hub/src/services/{access.rs,view.rs}`: al terminar un login solicitado por
  el usuario (`signed_in=true`, `pending=false`, sin error), encadenar una sola
  `LicenseRenew`; «Comprobar acceso» también renueva. Restaurar/pollear cuenta no
  debe iniciar HTTP de licencia repetido. Respetar busy, cancelación/logout y
  respuestas de otra generación; no declarar desbloqueo antes del ACK del núcleo.
- Mantener `LicenseStatus` para refrescar **solo IPC** de política, cuya frescura
  dura <2 s. Sustituir plan fijo, colores de módulos y contador por una proyección
  común de `access.navigation`/`Access::lock` usada también por navegación/paleta.
  Política ausente, vieja o con error: «Acceso sin verificar/bloqueado»; nunca Free
  por ausencia de grants. Separar acceso de disponibilidad Beta/Preview.

La política actual solo comunica `overlays_advanced`/`engineer`, no un nombre
comercial. Etiquetas honestas: «Overlays», «Engineer» o «Overlays + Engineer»;
no deducir Pro/Pro Plus/Owner de dos booleanos. En este núcleo ambos permisos
se activan juntos desde grants Pro/Launch/roles operativos. Mostrar un nombre
comercial real necesitaría dato servidor/política explícito y aceptación aparte.
`shell/navigation.rs` conserva la matriz existente; este corte no cambia precios
ni semántica de derechos. Launcher/cuenta no son concesiones de licencia.

## 5. Compilación y CI

| Binario | Variables públicas compiladas |
|---|---|
| Núcleo | `VANTARE_LICENSE_PUBLIC_KEYS`, `VANTARE_BUILD_CHANNEL`. No requiere URL/anon ni OAuth para decidir derechos. |
| Servicios | Las dos anteriores, `VANTARE_SUPABASE_URL`, `VANTARE_SUPABASE_ANON_KEY`, las tres `VANTARE_CLERK_*` y nueva `VANTARE_ACCOUNT_BRIDGE_URL`; `VANTARE_VERSION` para informes. |
| Hub | Las tres `VANTARE_CLERK_*` para estado/portal; no bearer ni claves privadas. Status de servicios confirma la configuración real. |

Trust roots de licencia: `kid:base64url-sin-padding`, separados por coma, iguales
en núcleo y servicios. `option_env!` fija valores en el artefacto: cambiar entorno
en ejecución no configura un binario anterior. No confundir publishable key del
SDK Wails con client ID OAuth; anon y claves públicas serán recuperables del binario.

Workflow a tocar en la implementación: `.github/workflows/release.yml`. Ya
inyecta URL/anon desde `secrets.VITE_SUPABASE_*` y trust roots desde
`secrets.VANTARE_LICENSE_PUBLIC_KEYS`, pero construye **Wails**, no el workspace
nativo. Añadir un paso/job de candidato nativo **build-only**, salidas separadas,
con `native/packaging/candidate.ps1 -Operation Build` (Cargo workspace/bins, `-j 2`)
y los valores públicos Clerk/puente del entorno aprobado. No reemplazar artefactos
Wails ni publicar el nativo al habilitar este puente. Validar presencia/formato sin
imprimir valores; inyectar por `env` del paso desde secretos CI, nunca argumentos,
echo, dumps de entorno, `.env*` o ficheros en artifacts. Separar development de
production; no distribuir un build público con issuer development por accidente.

Crear/cambiar secretos CI requiere autorización de Isaac. Nunca compilar
`CLERK_SECRET_KEY`, clave JWT privada de datos, `OFFLINE_LICENSE_ED25519_PRIVATE_KEY`,
service_role o tokens de despliegue. Esos viven solo en backend. Los gates de PR
en `quality.yml` deben continuar sin secretos de producción, con config/keys de test.
Un deploy posterior modificaría de forma acotada `deploy-supabase-functions.yml`,
config y guard/allowlist de deploy para la Function nueva, con aprobación propia;
no ejecutar el wrapper comercial completo para desplegar solo este puente.

## 6. Fases y aceptación

| Fase | Trabajo y prueba de aceptación | Autorización de Isaac |
|---|---|---|
| 0 · Revisión | Opus revisa este diff, contrato OAuth, issuer canónico, bearer/RLS y dependencia #913. Elegir URL/propietario y resolver preguntas antes de producción. | **Aprobación del diseño y alcance de implementación**. Este spec no la sustituye. |
| 1 · Servidor local | Reutilizar #909 en una base acordada; tests rojos de validación OAuth y resolver antes del cambio. Concurrencia: mismo par → mismo UUID sin huérfanos; distinto par → distinto UUID; slash del issuer no duplica. Email/accountId manipulados, cliente/issuer/scopes incorrectos, ID/session token, firma/exp inválidos → denegación. Legacy borrado sigue 401, nunca 503/gracia. | Sin acción remota en esta fase. **Merge de #913 a nightly requiere autorización**; no integrar silenciosamente su rama. Dependencia nueva, si necesaria, requiere aprobación. |
| 2 · Datos/licencia local | JWT de datos aceptado por gateway/PostgREST con TTL ≤300 s; issuer/UUID falsos rechazados; resolver no crea segundo mapping. RLS impide otra cuenta y anonimato; auditar permisos `authenticated`. v1 firma UUID correcto y huella; device_limit=409; capabilities online no autorizan núcleo. Tests de contrato cubren todos los errores HTTP. | **Cambio/importación de signing key o TPA remotos: autorización explícita**; prueba local no autoriza configurarlos. |
| 3 · Cliente/Hub | Config ausente/parcial no usa fallback; origen Supabase igual rechazado. Un login completo → una renovación, botón → renovación, polling → cero renovaciones. Logout/cambio de cuenta/respuesta tardía no recupera derechos. Política fresca cambia módulos/contador/paleta; caducada/error mantiene candados. Tests HTTP/IPC locales y claves de fixture, sin presentar mocks como login real. | Implementación dentro del alcance aprobado; sin deploy ni cuenta real. |
| 4 · Build/entorno | Candidato build-only con trust roots iguales, config pública válida; ninguna clave privada en binarios, logs o artifacts. Schema/Edge/issuer y claves por entorno se verifican y se registra versión/SHA. | **Cada paso remoto por separado:** deploy schema; deploy Edge/dominio; configuración Clerk; configuración Supabase; crear/rotar secretos de servidor o CI. Ninguno autorizado por este spec. |
| 5 · QA real | Login Development autorizado → UUID interno → v1 → ACK núcleo → módulos. Cuenta sin grants permanece sin acceso avanzado. Logout revoca antes de éxito; servidor caído no inventa licencia; en carrera services se cierra y no hay HTTP. Evidencia sanitizada externa; registrar entorno, SHA, checks y limitaciones. | **Crear/modificar usuarios, grants, mappings o datos reales requiere autorización explícita**. Sin pagos ni remapeo económico por email. |
| 6 · Integración | Opus revisa todo el diff/evidencia; CI del SHA final y handoff/seguimiento reconciliados. No declarar «publicado» por un commit o build. | **Promoción a nightly, luego canales/release según su autorización propia**. Sin merge/publish automático. |

Gates de implementación Rust antes de cada hito: `cargo fmt --check`,
`cargo clippy --workspace --all-targets -j 2 -- -D warnings`,
`cargo nextest run --workspace --build-jobs 2 -j 2` y
`cargo test --workspace --test lifecycle -j 2`.
Iteración: `cargo check --workspace --all-targets -j 2` y nextest filtrado por crate,
también con `--build-jobs 2 -j 2` (`-j` de nextest limita tests, no compilación);
no `cargo test -p`. Servidor: Deno y pgTAP clean/upgrade/concurrencia; regresión
Go/Wails si se adapta el bootstrap compartido. Ninguna suite de fixture sustituye
QA física o despliegue remoto. Evidencia de este worker: `C:/tmp/puente-evidence/`.

## 7. Riesgos y preguntas abiertas para Isaac

- ¿Qué origen y propietario servirán el puente, y en qué entorno se probará?
  El origen distinto a Supabase es una restricción actual del cliente.
- ¿Se autoriza validar OAuth con la API Clerk y su clave solo en servidor?
  Falta confirmar formato del cliente, metadata de verificación/exp y revocación
  efectiva. Userinfo solo no resuelve client binding; no cambiar Clerk para
  ocultar este bloqueo.
- ¿Se autoriza el diseño de bearer con signing key importada? Aumenta el poder
  de firma del backend; exige aprobación, custodia/rotación y auditoría RLS.
  Si no se acepta, revisar otro contrato antes de conectar servicios.
- ¿Cuándo se acepta #913 y su lifecycle sin FK `profiles → auth.users`?
  Borrado/cuentas económicas existentes no se resuelven aquí. Misma identidad
  Clerk debe conservar mapping entre Wails y nativo; no enlazar cuentas por email.
- ¿La UI debe mostrar solo acceso verificado o también plan comercial/rol?
  La política actual no distingue Pro, Pro Plus, Launch ni Owner. No inventar
  nombres ni presentar la combinación de permisos como un plan comercial.
- JWT de datos robado puede usarse hasta exp; logout local no revoca en servidor
  tokens Clerk ni ese bearer ya emitido. TTL ≤5 min no implica revocación global
  instantánea ni limita todos los endpoints accesibles por `authenticated`.
- JWS v2/enrollment y recuperación de margen frío en juegos siguen fuera del
  puente; no prometerlos por los tests existentes en `INTEGRATION.md`.

Esta entrega modifica solo este spec. No cambia código, dependencias, schema,
workflows, datos, Clerk/Supabase remotos ni el handoff compartido (lo consolida el
orquestador). No acredita integración, despliegue, QA real ni actualización Notion.

## Simplificación aprobada (2026-10-02)

Isaac aprobó sustituir la sección 3 por una única Edge Function `native-license`.
No hay bearer de datos, signing key importada ni origen Vantare separado. Las
referencias a esos elementos en las secciones 4–6 describen el diseño inicial:
el wiring Rust/Hub/build debe adaptarse en su entrega propia y no está incluido
ni probado por este servidor. Notion no está disponible por excepción explícita
del encargo; seguimiento allí pendiente, sin actualización inventada.

### Contrato y autoridad

`POST /functions/v1/native-license`, `Authorization: Bearer <OAuth access token>`,
`apikey` anon y `Content-Type: application/json`. Body con exactamente dos campos:
`{"version":1,"deviceFingerprint":"<64 hex minúsculas>"}`. Límite 1 KiB de body
(declarado y recibido, también streaming) y 16 KiB de token. No admite identidad,
email, accountId, capabilities ni claves del cliente. No se recorta la huella.
Respuesta 200 exacta `{"credential":<CredentialV1>,"online_capabilities":[...]}`,
con `Cache-Control: no-store`, igual que la emisión existente de v1.

La validación se hace exclusivamente en servidor mediante
`POST https://api.clerk.com/oauth_applications/access_tokens/verify`, body
`{"access_token":"..."}`, con `CLERK_SECRET_KEY` en Authorization servidor.
Sin redirects; plazo de verificación 4 s. La llamada se inyecta en tests; no se
verificó ningún token real ni se consultó una cuenta. La [guía oficial de Clerk](https://clerk.com/docs/guides/configure/auth-strategies/oauth/verify-oauth-tokens)
documenta esta llamada tanto para OAuth JWT como opaco. El
[OpenAPI oficial, versión 2026-05-12](https://github.com/clerk/openapi-specs/blob/main/bapi/2026-05-12.yml#L13224-L13330)
define dos respuestas 200: objeto `clerk_idp_oauth_access_token`, con `client_id`,
`subject`, `scopes`, `revoked`, `expired` y `expiration`; o `{"active":false}`.
La segunda se rechaza. Se exige client ID del servidor, usuario `user_` con 27
caracteres de identificador, scopes `openid profile`, flags de revocación/vencimiento
explícitos en false y vencimiento numérico futuro en segundos UTC. `expiration=null`
no acredita el vencimiento exigido por este contrato: falla cerrado con 503. No
se decodifican claims locales ni se usa userinfo/email como prueba alternativa.
Clerk 400/404 se traduce a 401 del cliente; 401/403 de Clerk indican fallo de la
credencial del servidor y producen 503; 429 se conserva. Respuesta desconocida,
JSON malformado, excepción de red o configuración ausente producen 503.

El issuer procede solo de `CLERK_ISSUER`, origen HTTPS canónico de la misma
instancia que la secret key, nunca de la petición. Se permite una barra final en
la configuración y se retira al entrar. El resolver reutiliza mappings previos
con/sin esa barra sin modificarlos; dos UUID distintos para el mismo par canónico
producen `account_conflict`, sin unión automática. Configurar una secret key de
otra instancia con el issuer equivocado sería un error administrativo: deben
verificarse juntos antes del deploy. El cliente no recibe ninguno de esos secretos.

`private.resolve_account_identity(issuer,subject)` extrae el bootstrap de #909 y
conserva su advisory lock transaccional, perfiles internos y mapping único.
`private.resolve_current_account()` continúa como adaptador TPA/legacy. El
claim de dispositivo también se comparte mediante `private.claim_account_device`:
no cambia el dispositivo ya activo ni concede grants. El RPC
`public.native_claim_license_device(issuer,subject,device_fingerprint)` está en
`public` para poder enrutarlo con PostgREST, pero su EXECUTE es privado a
`service_role`, revocado a PUBLIC/anon/authenticated; los helpers de `private`
tampoco son ejecutables por service_role. Todos fijan `search_path=''`. El handler
solo envía al RPC el par ya verificado. No fabrica `auth.jwt()` ni forwardea OAuth
a PostgREST. La migración es `20261002130000_native_license_bridge.sql`, posterior
a `20260828124540_clerk_account_bootstrap.sql` de #909.

La emisión, lectura de grants/roles, normalización y firma Ed25519 se extraen a
`supabase/functions/_shared/license-credential.ts`: ambos handlers llaman a las
mismas funciones. Un test compara la respuesta completa con la ruta TPA y verifica
su firma real con una clave efímera de test. Se mantienen las variables de firma
existentes `OFFLINE_LICENSE_KEY_ID`/`OFFLINE_LICENSE_ED25519_PRIVATE_KEY` y la
política comercial `POLAR_ENVIRONMENT`; no se añade dependencia ni segunda clave.

Errores exactos `{"error":"...","message":"..."}`, siempre no-store:
400 `invalid_request`; 401 `unauthorized`; 403 `forbidden`; 409 `device_limit` o
`account_conflict`; 405 `method_not_allowed`; 413 `request_too_large`;
429 `rate_limited`; 503 `bridge_unavailable`. Sin tokens, emails, bodies de OAuth
ni UUIDs en logs. El 429 corresponde a Clerk; este corte no añade un rate limiter
persistente propio ni cambia los límites del proveedor/gateway.

### Configuración, pruebas y límites

`[functions.native-license] verify_jwt=false`: el handler autentica antes del
acceso privilegiado. La allowlist reconoce la función; el wrapper permite
`-Functions @("native-license")` y el workflow una selección explícita equivalente.
El despliegue comercial por defecto conserva sus cuatro funciones anteriores.
El wrapper propaga el error PowerShell del guard directamente: no consulta el
exit code residual de un comando nativo anterior para evaluar un script PowerShell.
No se ejecutó el wrapper ni se despachó el workflow.

La base #909 se actualizó con `origin/nightly@f29b5fee04022756f9ae59f19bf153f91eebe4ed`
en `3f5e116328daecae99da0ee4287b54cf1bfe96ab`, con push normal a la rama de #913.
El worktree antiguo `C:/tmp/vantare-isa909` sigue intacto: al estar ocupado el
nombre local original, `C:/tmp/vw3-909` usa el sufijo local `-nightly`. #913
permanece draft; no se integró en Nightly. Su gate local: Go ./... PASS, Deno
396/396, frontend 4109 PASS/2 omitidas, build/lint PASS y presupuesto 4/4 PASS.
Nightly retiró `plan.md`, `roadmap.json` y `.github/scripts/roadmap_digest.py`:
se conservaron esas retiradas, sin recrear el roadmap antiguo ni publicar contenido.

Tests nuevos: contrato/bytes/errores y fetch Clerk inyectado, igualdad de firma y
grants, no logs sensibles, guard de despliegue aislado y pgTAP del RPC (mismo par,
permisos efectivos, TPA, barra final, conflictos y dispositivo). La prueba de
concurrencia usa dos sesiones PostgreSQL reales, una transacción abierta y una
espera observable de advisory lock, no un mock. Su fichero `.psql` requiere un
password exclusivamente de la base desechable y se ejecuta aparte del pgTAP normal.
Ejemplos **solo locales**, después de aplicar las migraciones en una base vacía:

```sh
supabase test db supabase/tests/native_license_bridge_test.sql
# Dentro del contenedor PostgreSQL desechable, con su contraseña de test:
psql -X -v ON_ERROR_STOP=1 -v dblink_password="$TEST_DB_PASSWORD" \
  -U postgres -d postgres -f /tmp/native_license_bridge_concurrency.psql
```

El runner existente `supabase/tests/run-supabase-hardening-postgres.ps1` incluye
bootstrap local y la matriz #909. Para el nuevo corte, pgTAP principal funciona
con `supabase test db`; la carrera también acepta el helper dblink de ese runner.
Revisar que la salida contenga el plan final y ningún `not ok`: psql por sí solo
no convierte los fallos de aserción pgTAP en exit no cero.

**SQL no ejecutado:** Docker no está disponible en Windows y `ssh linux` no
resuelve el host, tanto con Git SSH como con Windows OpenSSH. No se verificó
Docker en Linux ni se presenta la concurrencia escrita como evidencia de PASS.
Logs completos y copia/hash del OpenAPI quedan fuera de Git, en
`C:/tmp/puente-servidor-evidence/`. Rust, Hub, login OAuth físico, ACK de derechos,
CI del nuevo SHA, entorno Clerk/Supabase desplegado y grants reales no se probaron
en este corte. Antes de autorizar uso real faltan revisión Opus y SQL en Linux.
Gates finales del servidor: Deno 437 PASS/0 FAIL (40 del handler nativo y una
regresión nueva de deploy), Go ./... PASS, formato Deno y ambos guards PASS.
Lint de los tres archivos de implementación/test nuevos pasa excluyendo únicamente
`no-import-prefix`: las importaciones HTTPS fijadas son el patrón existente del repo,
no una dependencia nueva. No se ejecutó Cargo porque no se editó Rust en este corte.

### Pasos remotos que el orquestador pedirá a Isaac, en orden

1. Aceptar el diff de #913 actualizado y de #1444, completar SQL local en Linux
   y los checks del SHA revisado. Solicitar por separado su integración en Nightly;
   no promover testers/master ni marcar #913 ready desde este worker.
2. Autorizar el entorno Supabase concreto y un preflight administrativo con
   inventario de migraciones aplicadas, backup y rollback. Aplicar, solo tras esa
   revisión, la migración #909 si falta y después
   `20261002130000_native_license_bridge.sql` (y los prerrequisitos ausentes que
   revele el inventario). Comprobar permisos del RPC y mapping idempotente.
3. Autorizar la configuración de secretos **del servidor**: `CLERK_SECRET_KEY`
   de la instancia elegida, `CLERK_NATIVE_CLIENT_ID` del cliente OAuth nativo y
   `CLERK_ISSUER` canónico de esa misma instancia. Verificar además que las
   variables Supabase, `POLAR_ENVIRONMENT` y las dos variables de firma existentes
   están configuradas; crear/rotar cualquiera requiere su autorización. No
   copiar secretos a cliente, Git, argumentos de terminal, logs o artifacts.
4. Autorizar el deploy del SHA revisado: actualizar únicamente `license-credential`
   si el corte #909/shared aún no está desplegado y luego únicamente `native-license`,
   usando el wrapper guardado con selección explícita. No ejecutar el despliegue
   comercial entero para habilitar este puente, ni tocar TPA/signing keys de datos.
5. Autorizar QA Development real y sus efectos de bootstrap: login nativo del
   cliente correcto → UUID → credencial v1 → validación/ACK núcleo. Comprobar cuenta
   sin grants, segundo dispositivo (409), rechazo de token/scopes/cliente, logout
   y servidor caído. Crear usuarios/grants/datos, si fuese necesario, requiere
   autorización separada. Registrar entorno, SHA y evidencia sanitizada fuera de Git.
6. Recuperar Notion y reconciliar tarea/proyecto/PR/checks/SHA/canal antes de
   declarar seguimiento completado o publicación. Este worker no hizo deploy,
   link/db push, cambios Clerk/Supabase, creación de secretos, PR ni merge remoto.
