# Integración nativa — ISA-1430

2026-09-30. Integración local autorizada por Isaac, sin push/PR ni promoción.
Se fusionó `vantareapp/isa-1427-fase2`; el stash previo permanece intacto.
`services` pertenece a `native/`: un workspace, lock, edición y lints.
Se retiraron su lock y target aislados. `native/strategy/` conserva un workspace
histórico ajeno a este corte; no se modificó su lock ni se incorpora aquí.

## Propiedad y contratos implementados

- `vantare` posee el auxiliar `vantare-services.exe`, que hereda su Job Object.
  El Hub conecta a `<photo>-hub-services`; no arranca ni posee hijos. El saludo
  por sí solo no arranca servicios: la primera acción explícita lo solicita.
- El supervisor identifica la imagen del Hub; el auxiliar fija PID e imagen
  del supervisor. Sus nonces viajan por pipes/stdin/stdout privados heredados,
  nunca por argumentos, logs ni DTO de derechos. Marcos JSON de 64 KiB,
  versión y secuencia cerradas; los pipes reutilizan ACL del SID actual,
  `FIRST_PIPE_INSTANCE`, rechazo remoto, plazos y cancelación del ADR 0099.
- El supervisor entrega al núcleo y al auxiliar el bootstrap privado. Solo
  `vantare-services.exe` más nonce puede instalar/invalidate en `<photo>-rights`.
  El núcleo identifica a los lectores (overlays, Engineer, Hub y supervisor).
  Cada cliente fija a su vez la imagen de servidor. Esperar un pipe ocupado
  solo reintenta su apertura; jamás reenvía una mutación o un POST.
- El auxiliar entrega **bytes de la credencial firmada**, no derechos calculados.
  El núcleo verifica v1 compatible o JWS destino con la biblioteca compartida,
  issuer/audience/algoritmo/kid, subject y dispositivo; no admite capabilities
  online, email, metadata Clerk ni booleanos del Hub como autoridad.
- El núcleo mantiene binding y reloj DPAPI en un namespace separado del
  auxiliar; instalación Ed25519 protegida y fingerprint legacy son locales.
  Sin trust roots no abre el almacén de credenciales ni lee MachineGuid.
  Firma, disco y control viven fuera de adquisición; ésta solo publica un Arc.
  Guardar binding/reloj y revocación precede al ACK. Un error deja derechos
  protegidos denegados; la telemetría básica sigue disponible.
- La política solo incluye versión, época, revisión, comprobación temporal,
  deadline y permisos, sin credenciales ni PII. Overlays/Engineer usan el feed
  de control autenticado, sin HTTP propio. Política incompatible, antigua,
  expirada, reloj hacia atrás o sin heartbeat durante dos segundos deniega.
  Standings/Pedals siguen disponibles; los restantes overlays requieren acceso
  avanzado. Engineer conserva su cursor/eventos y vacía radio/voz al denegar.
  Workshop, capturas y fuente `local` son previsualizaciones de prueba explícitas.

## Juego, cierre y revocación

La entrada es un hecho live adquirido por el núcleo; el Hub no decide su ID ni
su hora. Solo los derechos válidos a esa entrada reciben la excepción. Termina
exactamente en **caducidad firmada + 3.600 segundos**, no reconexión + una hora.
Fuera de juego, entrada con credencial vencida o derechos emitidos después de
la entrada: sin gracia. La transferencia tardía usa la entrada observada por
el núcleo y no inventa un margen nuevo. Salir del juego elimina la excepción.

**Margen durable (worker margen, ISA-1430):** el estado `authority.dpapi` guarda
en un solo reemplazo DPAPI durable el reloj protegido (`clock.last_seen`),
entrada, sujeto/dispositivo, identidad de sesión y plazos absolutos por derecho
(caducidad firmada + 3.600 s). La restauración empieza sin confirmar la sesión.
`Owner::advance_observed_session` confirma únicamente la primera sesión live
con el mismo simulador, circuito, tipo y marca de inicio estable del simulador.
Puede cambiar el `SessionId` local; nunca cambia el plazo guardado. Otra sesión,
identidad incompleta, estado ausente/legacy/corrupto, reloj hacia atrás o plazo
vencido no recuperan margen. Waiting inicial espera la primera live; salir tras
live, replay y revocación eliminan la excepción. No hay afirmación del Hub ni
nuevo campo IPC de autoridad. El formato v1 anterior conserva reloj/binding;
su Game sin identidad/plazos no puede recuperar margen.

**Bloqueo de integración live:** en esta base, LMU/ACC no exponen en `Snapshot`
una marca de inicio estable. `domain/src/model.rs::Session` solo contiene el
`SessionId` local y tiempos transcurrido/restante. LMU lo genera en
`runtime/src/adapter/lmu/translate.rs`; ACC en `adapter/acc/translate.rs` con
`self.epoch`. `Origin.source_time`/`Session.elapsed_s` son relojes relativos,
no identificadores; restarlos del reloj de pared inventaría una identidad que
cambia con pausas, carga, latencia y reinicios del simulador. Por eso
`advance_observed`/Host siguen pasando marca ausente y **el margen frío live
todavía no se restaura en producción**. La persistencia y restauración se prueban
con una marca explícita de fixture, sin atribuirla a un juego real. El siguiente
worker debe aportar una marca nativa estable en el modelo y conectar Host; este
corte tiene prohibido editar adaptadores/domain. Solo una marca nativa con
unicidad comprobada distingue dos carreras del mismo circuito/tipo; aún no
existe evidencia para afirmar qué campo del simulador basta.

Antes de atender la primera acción del Hub, servicios transfiere el candidate
local y obtiene ACK del núcleo. Tras renovar, vuelve a transferirlo. Al detectar
live (vigilancia local cada 250 ms) se transfiere otra vez y se cierra/recolecta
el hijo. Si había E/S remota en vuelo, se cancela; sobreviven los últimos derechos
confirmados y el candidate/intento durable, sin autoenvío ni reintento de red.
La transferencia final fallida se registra solo como clase genérica. Cierre/EOF
del Hub o del supervisor también cierra al auxiliar. El siguiente arranque
requiere otra acción manual fuera de juego. No hay HTTP residente en carrera.

Logout/reset revoca y persiste en el núcleo antes de limpiar el candidate o
mostrar éxito; el tombstone impide reutilizar la emisión anterior incluso tras
reinicio. Reset remoto exige después una acción manual y el puente configurado.
Logout es local: revocación global de sesiones Clerk todavía depende del backend.
Una operación incierta conserva sus bytes/idempotency key y debe revisarse.

## Configuración OAuth nativa de compilación

`BuildConfig::load` lee los tres nombres públicos de Clerk con `option_env!`.
Solo construye `native_oauth` cuando están los tres y son válidos: issuer HTTPS
sin credenciales/query/fragment, client ID no vacío (máximo 256 bytes) y redirect
HTTP loopback en `127.0.0.1`, sin credenciales/query/fragment. Configuración parcial
o inválida conserva «no configurado». Cambiar el entorno al ejecutar no cambia
el artefacto: hay que recompilar Hub y servicios. La publishable key del SDK
**no es** el client ID OAuth; no se usa como fallback ni se admite client secret.

Registro autorizado para **Vantare / Development**, sin tocar Production:
OAuth application `Vantare Desktop (nativo)`, cliente público y **Require PKCE**,
redirect exacta `http://127.0.0.1:47813/callback`, scopes `openid profile` y
`offline_access` si está disponible. Public y Require PKCE son ajustes separados
([contrato de Clerk](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth)).
Comprobar con GET la discovery del issuer
en `/.well-known/openid-configuration`: issuer, authorization/token/userinfo
endpoints, `S256` y `offline_access`. El cliente existente solicita ese scope
y necesita refresh token; si falta, registrar el bloqueo, sin simular renovación.
Los datos públicos verificados van a `C:/tmp/clerk-native.txt`, fuera de Git;
no copiar, revelar ni guardar un secreto generado por Clerk.

Falta además la URL/versión y propietario del puente explícito OAuth → datos:
validar issuer/audience/scopes Clerk en servidor, resolver `(iss,sub)` a UUID
interno (#909) y devolver recursos o bearer RLS de datos de hasta cinco minutos.
Nunca mapear email/metadata editable ni enviar OAuth directamente a Supabase
como si fuera JWT de sesión Clerk. La API Vantare fina sigue siendo el destino;
el puente compatible con los RPC actuales debe acordarse/desplegarse primero.
No se presume despliegue de #911/#1173 ni #915/#1187. El hook de build
`App::configure_bridge` sigue inactivo por defecto: no se inventaron valores ni
Supabase Auth fallback. El login/almacén de cuenta no exige el puente de datos;
licencias y recursos privados sí.

Variables públicas existentes de compilación (`option_env!`), nombres exactos:

| Variable | Contrato |
|---|---|
| `VANTARE_SUPABASE_URL` | Origen/proyecto HTTPS de datos; namespaces de caché. |
| `VANTARE_SUPABASE_ANON_KEY` | Anon pública del producto; nunca service_role. |
| `VANTARE_LICENSE_PUBLIC_KEYS` | Trust roots `kid:base64url-sin-padding`, separados por coma. |
| `VANTARE_BUILD_CHANNEL` | Canal del artefacto; no concede derechos. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Nombre del SDK/frontend; no activa OAuth nativo. |
| `VANTARE_CLERK_ISSUER` | Issuer HTTPS / Frontend API de la instancia Clerk verificada. |
| `VANTARE_CLERK_CLIENT_ID` | Client ID público de la OAuth application nativa con PKCE/S256. |
| `VANTARE_CLERK_REDIRECT` | URI HTTP loopback registrada exactamente en Clerk. |
| `VANTARE_VERSION` | Versión pública de informes; si falta, versión real del crate. |

Los tres nombres nuevos activan la configuración de cuenta, pero no los remotos
privados: éstos necesitan el puente anterior. No se piden claves privadas,
service_role, client secret ni tokens reales al worker ni en el repo/logs.

### Bloqueo del registro y QA real (worker Clerk, 2026-09-30)

El inventario de control de ordenador no expone navegadores ni aplicaciones.
El helper Windows falla con `Computer Use native pipe is unavailable` y
`os error 2`, también tras reintento y reset de su sesión. No se ha podido
acceder al panel, crear/verificar el cliente ni obtener client ID/issuer reales.
No se ha creado `clerk-native.txt` con valores supuestos. Registro, GET a la
discovery de esa instancia y build configurado/login real siguen bloqueados.
No hay evidencia de callback, intercambio de tokens, persistencia DPAPI de esa
cuenta ni ausencia de tokens en logs de un login real. Los tests locales no
sustituyen esa aceptación. Evidencia del worker fuera del repo:
`C:/tmp/vw3-clerk-evidence/`. Siguiente paso: restaurar el helper, completar el
registro Development y repetir QA sobre el build con los datos verificados.

Validación local del wiring: `cargo fmt --check`,
`cargo clippy --workspace --all-targets -j 2 -- -D warnings` y
`cargo test --workspace -j 2` pasan. Cuatro pruebas físicas LMU/ACC están omitidas.
`cargo build -p vantare-hub -p vantare-services --bins -j 2` pasa sin las tres
variables Clerk; hashes y logs quedan en la carpeta externa de evidencia.

JWS v2/enrollment siguen siendo un destino no desplegado: Ed25519, kid compilado,
issuer `vantare-license`, audience `vantare-native`, subject UUID, key ID de
instalación RFC7638 y iat/exp; el envelope limita todos los grants. El cliente
legacy emite/renueva v1; no se inventa endpoint v2. DPAPI/ACL no protegen frente a
admin/malware del mismo SID ni rollback de una copia completa antigua del perfil.
La prueba de posesión de instalación firma solo el dominio enrollment; fingerprint
no es atestación. No hay fallback MachineGuid a home ni autoaceptación de claves
procedentes de JWKS remoto para derechos: los trust roots son los del build.

## Testing Center, paquete y aceptación

Testing Center conserva los diagnósticos/borradores de fase 2 y el editor remoto
con Orbit e Input compartido `pub(crate)` (sin módulo duplicado). El auxiliar es
el único escritor DPAPI del borrador/intento remoto. Solo consentimiento explícito
sobre preview vigente permite `testing_center_submit_report`; nada automático,
adjuntos, logs/capturas ni borradores Go. Un intento pendiente por cuenta/contexto,
campos de una línea y revocación Clerk remota siguen como límites documentados.
Roadmap conserva la última publicación válida; no hay polling de red/Realtime.
Editar rota la idempotency key/invalida la revisión; una respuesta tardía no pisa
texto cambiado. Reintento muestra los bytes originales aunque cambie el editor.
El recibo se persiste antes de limpiar el borrador; un fallo de limpieza no vuelve
a enviar. El consentimiento no se guarda, caduca en tres minutos y queda ligado
a cuenta/canal y época aleatoria de sesión de 128 bits. Abrir/restaurar nunca
concede consentimiento. Un intento pendiente exige resolverlo con su cuenta original.
El IPC del auxiliar tiene deadline de cinco minutos de inactividad; el siguiente
arranque requiere acción explícita y no autoconfirma ni reenvía POST inciertos.

El candidato enumera once binarios, incluido `vantare-services.exe`, con hash y
sidecar. MSIX deriva los bins de Cargo metadata del mismo workspace. Empaquetar
no instala servicios Windows ni configura autenticación, no firma/publica release.

Prueba local: núcleo host + auxiliar **real** + supervisor de biblioteca + pipes
ACL, claves generadas y DPAPI de directorios aleatorios de test; HTTP solo loopback.
La fixture comparte únicamente el namespace público compilado del auxiliar;
ningún bearer/trust root del build ni endpoint remoto se usa como vector de test.
Pruebas de tiempo inyectado cubren T+3599/T+3600, entrada/salida, transferencia
retrasada, firma/binding/reloj inválidos, replay de revocación e IPC impostor.
El ejecutable real de Engineer consume hechos/checkpoints por pipes con una
política firmada generada; sin política conserva el checkpoint sin presentar
radio protegida. Un test del supervisor comprueba el pipe compartido de una
instancia generada entre núcleo, overlays y Engineer.
Eso no es aceptación física del juego ni evidencia visual/audio GPUI/SAPI.

Corte 6: build con configuración pública acordada; arrancar `vantare -- --live`
y Hub contra el mismo pipe; login alojado, reinicio/rotación/logout/reset con
cuenta de prueba; comprobar Hub/auxiliar cerrados y derechos en overlays/Engineer
con juego real; T+3599/T+3600, desconexión, pérdida del núcleo y margen frío
pendiente de identidad estable del adaptador; roadmap real e informe de prueba solo con consentimiento. Medir
CPU/RSS/latencia de cierre. Sync de perfiles/layouts sigue fuera de este corte,
sin sincronización continua ni gasto. Notion no disponible: excepción explícita
GitHub de Isaac; no se declara su seguimiento completado.
