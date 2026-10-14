# Inicio de sesión propio — VANTA-70 / ISA-1631

Investigación del 14/10/2026. Encargo aprobado: email con código y contraseña,
alta, entrada y recuperación en GPUI; Google/Discord conservan navegador;
onboarding independiente. Rama local `vantareapp/isa-1631-login-propio`, base
nightly `b9ec75ed5435fb95130946cd207a4fa1ce8b8a64`. Sin servicios reales,
secretos, cambios Supabase/Polar ni dependencias nuevas.

## Resultado y diseño

Clerk ofrece una Frontend API (FAPI) para clientes nativos. Podemos dibujar los
formularios en GPUI y enviar las credenciales directamente por HTTPS a Clerk.
No necesitamos cookies ni una secret key en el cliente. El diseño usa el kit
Orbit del Hub y la composición del paso 3 de `onboarding-r1.html` de Isaac:
panel central, fondo oscuro, acento carmín, proveedores y alternativa email.
[Referencia FAPI](https://clerk.com/docs/reference/frontend-api).

**Una sesión FAPI no es el OAuth access token que usa Vantare.** Guardar su JWT
en `Session.access` rompería licencia, puente de cuenta y billing: el servidor
verifica `clerk_idp_oauth_access_token`, client ID y scopes, no session JWTs
(`../supabase/functions/_shared/native-auth.ts`, `verifyNativeOAuth`).

La especificación pública FAPI **2026-05-12** incluye una vía para conservar el
contrato: crear un Device Authorization Grant para el mismo OAuth client,
aprobarlo desde la sesión FAPI nativa y canjearlo por access/refresh OAuth.
La aprobación debe ser explícita en nuestras pantallas, para nuestra aplicación
y los scopes `openid profile offline_access`; no se aprueban códigos recibidos
de enlaces o terceros. La sesión FAPI queda efímera en servicios; el almacén
actual persiste exclusivamente la sesión OAuth. Es una composición de endpoints
documentados, **todavía no una prueba contra Clerk development**.
[OpenAPI oficial, MIT](https://clerk.com/docs/reference/spec/fapi/2026-05-12),
[guía Device Grant](https://clerk.com/docs/guides/configure/auth-strategies/oauth/device-authorization-grant).

Alternativas: aceptar session JWTs cambiaría el contrato servidor y el formato
local; continuar con authorize en navegador incumpliría email dentro de la app.
Se elige la composición FAPI → Device Grant → almacén OAuth existente.

## Transporte nativo exacto

Origen FAPI público fijado al compilar por `VANTARE_CLERK_ISSUER`. Nunca URLs
proporcionadas por el usuario. Formulario `application/x-www-form-urlencoded`.
Usar `_is_native=true` en la query y `Authorization: Bearer <client API token>`;
es **client token**, no session JWT ni OAuth access token. No añadir `Origin`,
cookies, `apikey` ni secret key. Iniciar el cliente con `POST /v1/client` y
conservar/rotar el token que Clerk devuelve en la cabecera `Authorization`.
No registrar headers, cuerpos, identificadores de sesión, contraseña ni códigos.
Los endpoints de cuenta llevan prefijo **`/v1/client/`**, no `/v1/sign_ins`.
Los endpoints `/v1/me/` identifican al usuario de la sesión activa del cliente.
[Esquemas `ProductionNativeApp`/`ProductionNativeFlag` del OpenAPI](https://clerk.com/docs/reference/spec/fapi/2026-05-12).

En development hay que habilitar Native API. No inventar cookies/dev-browser
para simular native. El script de pruebas usa HTTP solo en loopback bajo
`cfg(test)`; producto exige HTTPS, no sigue redirects y limita respuesta a
64 KiB con plazo global de 8 s por petición (`http.rs`).

## Flujos de email

Todas las respuestas son envelopes `response` y, cuando corresponde, `client`.
Validar IDs antes de componer rutas y los estados antes de avanzar. Reintentar
un código erróneo conserva el intento; un reinicio explícito lo sustituye.
Nunca conceder acceso por tener un email verificado solamente.

| Acción | Peticiones FAPI y transición |
| --- | --- |
| Entrada con código | `POST /v1/client/sign_ins` con `identifier=email`. Leer `supported_first_factors`, escoger `email_code` y su `email_address_id`. `POST /v1/client/sign_ins/{id}/prepare_first_factor` con ambos campos. Pedir el código. `POST .../attempt_first_factor` con `strategy=email_code&code=...`. Exigir `status=complete` y `created_session_id`. |
| Entrada con contraseña | Crear sign-in con `identifier=email`, `strategy=password`, `password=...`. Exigir `complete` y sesión creada. Este corte ofrece navegador si aún requiere otro factor; nunca inferir éxito del HTTP 200. |
| Alta sin contraseña | `POST /v1/client/sign_ups` con `email_address=email`; `POST /v1/client/sign_ups/{id}/prepare_verification` con `strategy=email_code`. `POST .../attempt_verification` con `strategy=email_code&code=...`. Exigir `complete` y sesión creada. |
| Alta con contraseña | Misma alta incluyendo `password`; **también** verificar email mediante código antes de completar. Requisitos extra configurados por Clerk pueden impedir completar. |
| Recuperación | Crear sign-in con `identifier=email`; preparar `reset_password_email_code` usando el `email_address_id` que ofrece Clerk; verificar con `attempt_first_factor` y ese strategy/código. Exigir `needs_new_password`; `POST .../reset_password` con `password` y la elección explícita `sign_out_of_other_sessions`. Después exigir `complete`. |
| Reenviar | Volver a preparar la misma verificación, manualmente y con cooldown local de 30 s; respetar errores/rate limits de Clerk. No volver a crear el usuario ni el sign-in. |

Guías oficiales de [código](https://clerk.com/docs/guides/development/custom-flows/authentication/email-sms-otp),
[contraseña](https://clerk.com/docs/guides/development/custom-flows/authentication/email-password)
y [recuperación](https://clerk.com/docs/guides/development/custom-flows/authentication/forgot-password).
Los endpoints/formularios concretos anteriores proceden del OpenAPI fijado,
no de traducir nombres de métodos de un SDK JS.

`needs_second_factor`, `needs_client_trust`, `needs_protect_check`, tareas de
sesión y `missing_requirements` adicionales no equivalen a una sesión utilizable.
No saltar MFA, CAPTCHA, confianza de dispositivo ni consentimiento legal.
Este corte debe informar el requisito no soportado y ofrecer continuar con el
flujo alojado; nunca desactivar protecciones desde la app. Para permitir alta
sin contraseña, Password no debe ser obligatorio en la instancia; email debe
ser obligatorio y verificable, con entrada por código y contraseña habilitadas.
El operador confirma esa combinación en development.

## De la sesión FAPI al almacén actual

1. Confirmar que `created_session_id` pertenece al cliente actual, con estado
   activo y sin tareas pendientes; capturar su `user.id` como identidad esperada.
2. Leer metadata del issuer. Exigir `device_authorization_endpoint` del mismo
   origen y grant `urn:ietf:params:oauth:grant-type:device_code` anunciado.
   El operador debe habilitar **Device authorization grant** para el OAuth
   client público existente; no crear otro client ID ni incluir client secret.
3. Tras mostrar qué acceso se solicita y recibir la acción explícita, enviar
   `POST /oauth/device_authorization` con `client_id` y scopes actuales.
4. `POST /v1/me/oauth/device` con autenticación nativa, `user_code` de nuestra
   propia respuesta y `approved=true`. No aceptar códigos de usuario arbitrarios.
5. `POST /oauth/token` con grant device_code, `device_code` y mismo `client_id`.
   Respetar interval/plazo si hace falta polling; `authorization_pending` y
   `slow_down` nunca significan éxito. Sin bucles rápidos ni reintento ciego.
6. Reutilizar la validación de tokens y `/oauth/userinfo` de `Exchange`;
   contrastar `sub` con usuario FAPI, generación vigente y expiración.
7. Reutilizar `Account.complete`, revocación local ante cambio de identidad,
   guardado atómico y renovación con refresh existente. No persistir password,
   OTP, device code, client API token ni session JWT. No tocar Supabase/Polar.

La configuración del grant es un requisito operativo pendiente. Una fixture
puede demostrar composición, validación y persistencia; no acredita que esa
configuración esté activa en la instancia real ni la compatibilidad en vivo.

## Discord y Google

**Google:** prohíbe dirigir autorización a un user-agent embebido controlado por
el desarrollador (WKWebView/CEF/webview propia). Cambiar el user-agent no es una
solución permitida. El navegador del sistema es válido. En macOS,
`ASWebAuthenticationSession` ofrece una ventana gestionada por el sistema,
sin control de cookies/JS por la app; en móvil hay equivalentes. Eso requiere
integración y callback específicos, no una webview GPUI. Para este corte se
conserva el navegador y callback loopback/PKCE actuales.
[Política Google](https://developers.google.com/identity/protocols/oauth2/policies),
[Apple](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession).

**Discord:** documenta OAuth2 y redirects; no confirma una excepción que permita
incrustar la pantalla de contraseña en una webview de Vantare. La recomendación
normativa para OAuth nativo usa user-agent externo. Por tanto conserva navegador;
no afirmar que incrustarlo sea una vía soportada. Clerk sigue como proveedor;
no recopilar credenciales Discord/Google en formularios Vantare.
[Discord OAuth2](https://docs.discord.com/developers/topics/oauth2),
[RFC 8252, §§4 y 8.12](https://www.rfc-editor.org/rfc/rfc8252).

Hoy los botones Google/Discord invocan el mismo authorize OAuth de Clerk:
no existe selector de proveedor documentado en esa llamada. Se mantiene esa
realidad y se explica que la selección final ocurre en el navegador alojado.

## Almacenamiento y seguridad actuales

`native/services/src/account.rs`: formato protegido `account`, versión 1,
issuer/subject, client ID, access y refresh OAuth, expires_at; el perfil está
separado en `account-profile`. Restauración ligada a issuer/client ID,
cuarentena de formato incompatible; logout escribe tombstone atómico y cambia
la generación. Un intercambio anterior no puede restablecer la sesión tras
logout. Los `Secret` del servicio usan `zeroize` y no implementan Debug.

`storage.rs`: Windows usa DPAPI de usuario. macOS guarda JSON **sin cifrar** en
`~/Library/Application Support/Vantare/native/services`, namespaces 0700 y
archivos/lock 0600; Linux equivalente XDG. Protege frente a otros usuarios,
no frente a procesos del mismo usuario/root ni lectura offline del disco.
No sustituir este almacén por Keychain en una feature sin migración aprobada.

Riesgos a controlar: no persistir formularios/credenciales; campos de contraseña
ocultos y sin copiar al portapapeles; IPC autenticado y acotado con Debug
redactado para credenciales; no volcar errores remotos; una petición explícita
por acción, cooldown y límites; borrado de inputs al cancelar/terminar;
rechazo de redirects/IDs malformados/cambios de identidad y sesiones incompletas.
El transporte IPC actual serializa en memoria: ocultar Debug no convierte esa
memoria en un almacén cifrado ni garantiza borrado de todas las copias de Rust.

La recuperación puede cerrar otras sesiones de Clerk si el usuario lo elige;
no se presupone que revoque todos los OAuth grants anteriores. Validarlo en
development antes de anunciar ese alcance. Los derechos siguen dependiendo
del servidor y del núcleo; iniciar sesión no concede una licencia.

## Verificación prevista y límites

Tests loopback/fakes por flujo: entrada OTP/password, alta OTP/password con
verificación, recuperación/código/nueva contraseña, resend/cancelación,
credenciales inválidas, rate limit, MFA/tareas/requisitos extras, identidad
OAuth distinta, rotación de header, restauración/renovación/logout y generación.
Gates fmt/check/Clippy/Nextest/lifecycle, telemetría por IPC/runtime y huellas.
QA de formulario/máscara/foco/errores en macOS; Windows y Clerk development
real quedan al orquestador. Sin SQL/Edge nuevos: contrato servidor intacto.


## Verificación local completada — 14/10/2026

Fase 1 `3f74eb58`, checkpoint Fase 2 `b6844b4c`, correcciones `e08e48f2`.
Cargo directo autorizado en macOS arm64 con dos jobs, target `~/target-1631`
y --locked. Build de services/ipc/runtime/hub y storage PASS; Clippy de los
cuatro crates, --all-targets/-D warnings PASS; fmt y 456 huellas PASS.
Nextest compatible **1072/1072 PASS**, telemetría **25/25 PASS** (corpus
completos, incluidas 190.308 fotos ACC), lifecycle macOS **10/10 PASS**.

La suite completa inicial conserva 49 fallos GPUI por AppKit fuera del hilo
principal; no se eliminan tests ni expectativas. La repetición local excluye
esos nombres exactos y cuatro mediciones ya ignoradas por defecto. El fallo
adicional de tamaño se corrige moviendo email a login.rs, sin elevar el techo.
IPC verifica que Resend/Finish/Cancel rechacen campos extra; accesibilidad
verifica que la contraseña no exponga valor y que el email siga siendo legible.
Los cinco flujos se verifican con HTTP loopback y sesiones/almacén OAuth fakes.
Evidencia completa, comandos y fallos iniciales en `~/evidence/1631/ESTADO.md`.

Quedan pendientes QA visual/interacción (máscara, foco, clipboard, errores y
reconexión), los tests gráficos con un harness adecuado, Windows (incluidos
DPAPI y los tres escenarios lifecycle Win32) y Clerk development real con
Native API/Device Grant habilitados. Este corte no certifica login real,
producción, Supabase/Polar remotos ni revocación de todos los grants OAuth al
recuperar contraseña. VANTA-70 «Por revisar»; sin push, PR, merge ni release.
