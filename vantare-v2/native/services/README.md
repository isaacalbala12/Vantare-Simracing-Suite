## #1827 — Policy.state / control v7 (paso 7)

Services lee los estados del núcleo y usa Policy::denied para políticas conservadoras.
ClockBehind conserva la frontera de seguridad y la comprobación manual explica
su fecha; no pide conexión como solución suficiente. Un 200 verificado sigue
siendo Verified aunque no cambie el plazo firmado. Policy.error queda solo como
observación diagnóstica histórica, sin autoridad. Candidate/TransferRights se
conservan hasta el paso 8. [Contrato](../../docs/adr/0102-modelo-acceso-nativo.md).

Services v17 versiona la Policy v7 anidada; Session/AccountCancel permanecen
intactos. V16 del paso 6 nunca se publicó en release.

## #1827 — Contrato de sesión explícita (paso 6, services v16)

`AccountCancel` (v16) cancela solo el intento OAuth/FAPI y relee Session;
conserva la cuenta protegida y los derechos. «Volver/Cancelar» lo usa sin
sustituirlo por Logout. Solo «Cerrar sesión» envía Logout. En NeedsSignIn,
Cuenta ofrece Google/Discord/email y también el cierre explícito de sesión.


Account es el único dueño de `Reply::Account.session`: SignedOut, SignedIn,
NeedsSignIn o Pending. La sesión no concede ni describe derechos; decide el
núcleo. Un error de perfil y la caducidad del bearer no cambian por sí solos
SignedIn. NeedsSignIn conserva identidad/perfil y exige nueva entrada.
Los campos anteriores de Account se mantienen en este corte para presentación
histórica; supervisor y Hub consumen Session como autoridad de sesión.
No cambia el formato de cuenta, binding, authority ni candidate en disco.
La generación v16 rechaza peers v15: incompatibilidad transitoria, sin revocar.
El mensaje de sesión deja de afirmar que los derechos están pendientes (#1801).

## #1827 — Renovaciones no destructivas (paso 5)

`outcome` solo marca revocación en Logout, cambio de identidad y DeviceReset.
Los rechazos de renovación manual/automática conservan los derechos firmados;
la respuesta definitiva detiene el scheduler sin ampliar el plazo. Un refresh
OAuth rechazado (`invalid_grant`/401 del endpoint de token) guarda NeedsSignIn;
403 y fallos de userinfo tras refresh válido siguen transitorios. Conserva identidad/perfil y exige nueva
entrada sin reutilizar tokens rechazados. Un login correcto restaura SignedIn;
la comparación de identidad sigue precediendo a guardar otra cuenta.
El paso 6 publica Session por services v16; el formato protegido de cuenta no cambia.
Soporte y rollback de la cuenta: [runbook BIL-08](../../docs/billing/bil-08-offline-credential-runbook.md).

## #1827 — Clasificación de acceso (paso 4)

`services::outcome::outcome` es la única tabla de clasificación para renovación,
refresh OAuth y respuesta del núcleo, y para el resultado del ACK que consume
el supervisor. Devuelve `RenewalOutcome` y los efectos de revocación/cierre de
sesión; App conserva el orden de ACK durable antes de limpiar datos.
`Origin` conserva el contexto manual/automático; el paso 5 unifica sus efectos.
El rechazo Clock solo al instalar caché y la ventana urgente de una hora se
conservan. No cambia formato IPC, licencia, persistencia ni comportamiento.
El Hub consume los resultados tipados existentes; no tiene una lista de errores.

## ISA-1810 — Candidate rechazado y acceso a la recuperación

Una firma válida no permite confiar en el dispositivo declarado por el propio
candidate: se compara también con la huella actual. La caché de otro dispositivo
va a cuarentena antes de Install, con `license-cache-device-mismatch`.
Si la lectura local de la huella falla o queda vacía, el helper no decide:
envía Install ordinario y deja verificar al núcleo. No aparta por ese fallo.

Un rechazo explícito del núcleo aparta el candidate y retira su hint sin revocar
el binding vigente. Un Read posterior permite admitir el helper con la política
real del núcleo, tanto sin derechos como conservando los de A al rechazar B.
Read no cuenta como instalación ni renovación. Login, logout y comprobación de
acceso quedan disponibles sin editar archivos a mano; una nueva concesión sigue
exigiendo firma, identidad, dispositivo, reloj, lápida y ACK durable del núcleo.

E/S, transporte y ACK incierto conservan candidate/hint y no disparan otra
emisión HTTP. Un InstallOnline recién obtenido y rechazado definitivamente se
aparta también; la pérdida del ACK mantiene la recuperación ordinaria de #1811.
Disco, cuarentena e hint nunca producen InstallOnline. Se conservan los bytes
con el recorte habitual de tres archivos por nombre, best-effort si hay bloqueos.
Si falla renombrar el candidate, registra `license-cache-quarantine-incomplete`,
conserva sus bytes y continúa con Read; no concede esa caché ni invalida derechos.
La API de storage conserva sus errores para los demás documentos y llamadores.
El diagnóstico de lápida futura y su sondeo se siguen separadamente en #1822.
El primer binding offline desde un candidate de otra cuenta del mismo PC se
sigue en #1825; esta recuperación no establece un nuevo contrato de identidad.

## ISA-1808 / ISA-1812 — Recuperar cuenta y leer perfil sin revocar

Cuenta y metadata OAuth usan lectura de caché: DPAPI/JSON ilegible se aparta
con bytes intactos y fecha inyectada, hasta tres copias por documento salvo
bloqueos de limpieza. También cuentan las copias de los dos formatos antiguos,
que se retiran antes que las copias fechadas recientes. Un fallo real de lectura o renombrado sigue siendo error.
La metadata pública se redescubre; una cuenta ilegible empieza sin sesión.
Logout conserva el ACK durable de revocación, pero escribe SignedOut sin
redescubrir OAuth ni restaurar primero la sesión dañada. Una identidad nueva
sigue invalidando derechos anteriores antes de persistirse. En Logout la lectura,
cuarentena y limpieza del perfil son best-effort con diagnóstico tipado: el
ACK durable y el guardado de SignedOut siguen siendo obligatorios. Un error
cosmético no deja una sesión restaurable tras haber revocado sus derechos.

AccountProfileRefresh es presentación y usa siempre OAuth automático: ni un
invalid_grant ni un 401/403 revocan la licencia, borran candidate o cierran la
sesión. AccountRenew, Logout y rechazo explícito de licencia conservan sus
reglas. account_conflict 409 indica inconsistencia, no revocación: se conserva
la firma anterior y se permite reintentar; DeviceLimit sigue separado.
El feature existente test-support permite compartir el HTTP loopback y el
host::session de fixtures entre crates. Activarlo no abre HTTP por defecto:
solo la instancia de App que el test habilita expresamente admite 127.0.0.1.
No hay opción CLI/IPC ni variable de ejecución que lo habilite. La distribución
mantiene HTTPS y las trust roots reales; el test integrado comprueba el guard
por defecto antes de usar su instancia local.
Los caminos de App, incluido AccountRenew, usan el reloj inyectado. Un fallo
de perfil conserva la sesión y su texto no pide iniciar sesión de nuevo. El
reintento de perfil en Hub queda en #1823: requiere admisión por temporizador
y backoff propios para evitar la cadena inmediata de peticiones.
No cambia formato IPC, firma, TTL ni gracia. Recovery 72 h (#1814), fuera de RC9, requiere aún
un plazo autenticado firmado: online_capabilities no concede derechos locales.

## ISA-1803 — Recuperación del transporte (services v15 / control v5)

Timeout, EOF, peer cerrado, identidad, protocolo, versión y rechazo tienen
categorías cerradas. Solo un rechazo explícito detiene la renovación de la
sesión; transporte y disponibilidad local conservan el backoff y el binding.
El helper sale correctamente al agotar cinco minutos sin recibir una trama,
ante EOF entre tramas o si el destinatario ya cerró al responder. Una trama
parcial sigue siendo un fallo: nunca se repite la acción cuya respuesta se perdió.

Una emisión automática guarda un marcador protegido `license-transfer-pending`.
Tras un fallo del ACK se reintenta primero la instalación local, sin otra emisión
HTTP, incluso si el helper se reinició. Se retira tras el ACK durable, cuarentena
o revocación; el marcador no concede derechos y no contiene identidad ni licencia.
Un marcador ilegible o con formato distinto se conserva en cuarentena y se trata
como ausente. Si falta el candidate, se retira el marcador huérfano: una lectura
local no cuenta como renovación ni como instalación, y se continúa hacia HTTP.
La espera inicial de conexión no tiene deadline en Windows: termina al cerrar el
padre. Los cinco minutos de inactividad corresponden a la lectura entre tramas.
Control v5 conserva su formato: errores desconocidos de un núcleo anterior son
`rights-legacy-unknown`, transitorios y distintos de protocolo/versión/rechazo.

## ISA-1793 — Segunda revision

Al abrir, un binding firmado rechazado por reloj/lapida va a cuarentena sin
reiniciar la autoridad persistida. Si falla persistir, el nucleo sigue vivo y
denegado, disponible para una nueva concesion firmada. El recorte de archivos
ya apartados es best-effort; puede superar tres copias si una esta bloqueada.
Comprar reabre la confirmacion automatica, conservando el suelo entre intentos.
El Hub consulta avisos cada 5 s y mantiene residente el helper mientras tiene
sesion; la mejora de residencia y avisos se sigue en #1799.

## ISA-1793 — Renovación automática no destructiva y caché recuperable

Servicios v15 distingue `LicenseRenewAutomatic`, `Probe` y `LicenseFailure`
con resultado tipado. Hub, supervisor y helper deben recompilarse juntos.
En automático no se invalida ni al refrescar OAuth ni ante 401/403/409 o una
firma no verificable. Una clave nueva que la app no conoce pide actualizarla.
La acción explícita y DeviceReset conservan su revocación durable.

Binding y candidate se verifican antes de conceder derechos. La caché de clave
retirada, formato antiguo, firma mala conocida o DPAPI corrupto se aparta con
fecha y bytes intactos; se intenta conservar como maximo tres copias por nombre, salvo bloqueos de limpieza. E/S real
se propaga y conserva el original. Los diagnósticos cerrados son
`license-cache-unknown-key`, `license-cache-unsupported-format`,
`license-cache-invalid-signature` y `license-cache-unreadable`.
El candidate inválido no llega a Install ni deniega un binding vigente.
Las sondas locales no añaden entradas redundantes al buffer de triaje.

## #1761 · Navegador alternativo y copia explícita

Services v14 permite AccountCopyLink y LoginLink redactado en Debug. Si falla
el predeterminado HTTPS, Windows busca clientes StartMenuInternet en HKCU y
HKLM (vistas64/32): Chrome, Edge, Firefox, Brave, Opera y resto, priorizando
la configuración por usuario. Ejecuta solo el .exe absoluto registrado con la
URL como único argumento, usando Command::arg, sin shell ni flags del registro.
Si ninguno arranca, conserva el mismo intento PKCE/listener durante su plazo
original de tres minutos y devuelve copy_link=true. La URL se mantiene en memoria
como Secret; solo AccountCopyLink la entrega al Hub para el gesto del portapapeles.
No incluye tokens ni verifier. Cancelar, expirar, completar o reintentar retira
el enlace. Hub, supervisor y services deben recompilarse juntos; peers v13
se rechazan. No se modifica el registro, el predeterminado ni backend.
Si un Job externo rechaza breakaway con error5, se reintenta una sola vez sin
ese flag y se deja log sin URL. En ese caso el navegador hereda el Job y puede
cerrarse al salir de Vantare; el intento de acceso mantiene su plazo.

## #1631 · Login propio

El protocolo services v14 combinaba marketing verificado, Founders y AccountEmail y respuestas Email sin tokens.
R2 mantiene el canje pendiente en memoria y hace un solo intento por AccountPoll,
con reloj inyectado, intervalo de Clerk/slow_down y ventana de 30 s. Cancel y
Logout pueden interrumpir los intervalos sin sleeps. La sesión FAPI se cierra
al canjear, cancelar o cerrar sesión (mejor esfuerzo); al agotar el plazo se
conserva para permitir «Autorizar» de nuevo. Un canje correcto retira el intento:
si falla el guardado local, el formulario pide iniciar el acceso de nuevo y no
reutiliza la sesión FAPI cerrada. El bloqueo local por 429 vive en
Account y sobrevive a «Volver». No se añade persistencia ni dependencias.
Hub/supervisor/servicios deben compilarse juntos. Entrada con código/contraseña,
alta con verificación de email y recuperación usan FAPI nativa sin cookies.
La sesión FAPI es temporal; la aprobación explícita de Device Grant obtiene la
misma sesión OAuth v1 guardada por Account.complete. Supabase/Polar no cambian.
Google/Discord mantienen authorize alojado + PKCE + callback loopback.
Requisitos de desarrollo, seguridad y límites: [login propio](../../docs/auth/login-propio.md).
Windows R2 (15/10): fmt/check/Clippy de producto PASS, Nextest services/ipc/runtime/hub
1131/1131 PASS (ocho omisiones existentes), lifecycle 13/13 y telemetría 25/25
PASS; siete capturas revisadas. HTTP local con reloj inyectado, sin Clerk real.
Evidencia previa macOS (14/10/2026):
Cargo directo con target propio y dos jobs autorizado en este Mac. Build y
Clippy --all-targets/-D warnings PASS; Nextest compatible 1072/1072 PASS.
Los 49 tests GPUI de AppKit requieren otro harness/Windows; cuatro mediciones
permanecen ignoradas por defecto. No acredita login real: Native API/Device Grant,
QA y Windows pendientes del orquestador. Telemetría 25/25 y lifecycle macOS
10/10 PASS. Evidencia y resultados en el handoff.

# Servicios nativos — ISA-1430

**#1661 / VANTA-83:** Founders añade el plan perpetuo para contenido presente y
futuro. Corte actual services v15 / control v5 / fotos v11; recompilar el conjunto.
Incluye Nightly vitalicio junto al derecho Founders; no concede roles. [Contrato](../../docs/billing/founders-1661.md).

**Corte combinado #1610/#1594:** protocolo services v9 (DTO v10/derechos v4
independientes); recompilar Hub/services juntos. F7=C: campos escritos locales,
etiquetas SQL fijas y salida estructurada por catálogo; no se envía prosa del tester.
Rutas cerradas: current_v2, envío consentido por Edge `testing-report-submit`,
crédito y acuse por fecha. La RPC directa no está permitida. Historial sin cuerpo
privado; arreglado requiere versión válida. No hay cliente Plane ni referencia PostHog productiva.
SQL y dependencias #1602/#1609 siguen sujetos a revisión e integración:
[contrato vigente](../../docs/runbooks/testing-report-followup.md).

`vantare-services` es miembro de `native/`: un workspace, `Cargo.lock`, edición
y lints compartidas. Proceso de usuario bajo demanda, sin GPUI/simuladores.
El supervisor `vantare` posee el auxiliar; el Hub solo manda comandos IPC.
El núcleo verifica y persiste la credencial y publica derechos a los consumidores.
Cuenta Clerk y datos Supabase tienen contratos distintos; el puente privado
permanece inactivo hasta acordar configuración/backend con Isaac.

```powershell
cd native
cargo fmt --check
cargo clippy --workspace --all-targets -j 2 -- -D warnings
cargo nextest run --workspace --build-jobs 2 -j 2
$env:RUST_TEST_THREADS = '2'
cargo test --workspace --test lifecycle -j 2
```

Máximo dos jobs, una compilación a la vez. Logs y target standalone histórico
están fuera del repo, en `C:/tmp/servicios-evidence/`; no recuperar el stash previo.
No hay dependencias async/DB/bus nuevas: se reutilizan transporte Win32/ACL,
ureq/TLS del lock, formatos/entropía mínimos y Ed25519/DPAPI de los cortes previos.
La biblioteca de verificación se consume con `default-features = false`; IPC es
común, HTTP/URL opcionales. Las pruebas de runtime habilitan network solo como
dev-dependency. Cargo unifica features en una compilación conjunta: ese grafo
no se presenta como prueba de ausencia de TLS en el artefacto completo.

IPC v3 distingue en `ReportReceipt` un borrador limpiado, otro posterior
conservado y una limpieza pendiente. Confirmar un reintento solo retira el
borrador con su misma idempotency key; un error de lectura conserva el archivo.
Hub, supervisor y auxiliar comparten el contrato y deben compilarse juntos.
`Account` comunica también el error y el estado real del intento: un callback
rechazado mantiene polling; caducidad/intercambio fallido lo termina. Reiniciar
explícitamente libera el listener anterior y estrena generación, state y PKCE.

El host IPC comparte implementación Windows/Unix sobre `vantare_ipc::transport`.
El watcher del padre usa `Builder::spawn`: si no puede crear el hilo, devuelve
error de protocolo también en Windows, en lugar de provocar un panic.

Sin configuración se muestra «servicio no configurado», con funciones básicas
y borradores locales. La hora de excepción solo aplica a derechos válidos al
entrar a la sesión live; no hay otra gracia offline. Límite de restauración
tras reinicio frío e identidad de carrera, contrato exacto de Clerk pendiente,
variables del build, IPC, aceptación y riesgos: [INTEGRATION.md](INTEGRATION.md).
Commits/gates/evidencia y alcance real: [DELIVERY.md](DELIVERY.md).

Roadmap: última publicación válida; Testing Center: texto, borrador DPAPI,
preview/consentimiento efímero, intento durable manual y recibo. Sin autoenvío.
Tests: HTTP loopback, claves generadas, procesos/pipes y DPAPI de fixtures;
ningún secreto ni credencial real, `.env*` ni backend real. El corte 6 queda
pendiente de Isaac; sync de perfiles/layouts no se implementa aquí.

### Desarrollo Unix — #1437

El auxiliar y su cliente usan `vantare-ipc` también en Linux/macOS: socket Unix
local, mismo nonce, límites, PID e imagen del par. La sesión y demás datos del
`Store` se guardan bajo `$XDG_CONFIG_HOME/Vantare/native/services` (Linux,
`~/.config` si no está definido) o `~/Library/Application Support/Vantare/native/services`
(macOS). Cada namespace queda en un directorio `0700`; los JSON y el lock son
`0600`, y el reemplazo es atómico. A diferencia de DPAPI, Unix no cifra esos
JSON: los permisos protegen frente a otros usuarios, pero no frente a procesos
del mismo usuario, administrador/root, ni acceso al disco fuera del sistema.

El binding de licencia v1 queda expresamente deshabilitado fuera de Windows
(#1542): `HOME|GOOS` colisiona entre máquinas y no acredita un dispositivo.
`legacy_fingerprint`, renovación v1 y reset de dispositivo devuelven
`Unsupported`; renovación/reset lo hacen antes de OAuth, red o revocación local.
El núcleo rechaza v1 cuando no existe huella local. Los formatos guardados,
la huella Windows y la clave Ed25519 de instalación (ID RFC 7638/enrollment)
se conservan. No se migran credenciales reales ni se sustituye la huella por
otro hash que invalidaría credenciales sin una migración. Habilitar licencias
Unix exige enrollment/backend v2 y una migración autenticada posterior.

### Recuperación local de cuenta y compra — #1542

Si cambia solo el redirect OAuth, la metadata incompatible se aparta en una
copia `.corrupto` única y se redescubre con la configuración compilada. Un
fallo al moverla detiene la operación; la sesión y las credenciales no cambian.
Los errores de lectura no se convierten en permiso para sobrescribir datos.

Un intento de compra ilegible se conserva y muestra recuperación asistida;
reintentar no crea otra clave. Procedimiento y límite del resultado incierto:
[recuperación de checkout](../../docs/billing/native-checkout-recovery.md).
Los slots de uso semánticamente inválidos se descartan sin enviarlos y se
continúa con el resto de la cola. Un fallo al limpiar un temporal de
`anonymous-id` se diagnostica aparte y no invalida su publicación ya durable.

### Testing Center beta — #1452

El binario conecta `App::configure_bridge` con `BuildConfig::data_bridge`.
Compilar servicios con `VANTARE_ACCOUNT_BRIDGE_URL` (endpoint HTTPS completo),
`VANTARE_SUPABASE_URL`, `VANTARE_SUPABASE_ANON_KEY`, `VANTARE_BUILD_CHANNEL`
(`nightly` o `testers`), `VANTARE_VERSION` y la configuración pública OAuth
`VANTARE_CLERK_ISSUER`, `VANTARE_CLERK_CLIENT_ID`, `VANTARE_CLERK_REDIRECT`.
Son variables de **build**: cambiar el entorno de ejecución no cambia el binario.
No se incluyen claves de firma, credenciales privadas ni secrets en el cliente.

El contrato administrativo v1 del orquestador (03/10/2026) fija producción en
`olhwhfaczmrmooeaoqqf` y Clerk development. Configuración inicial de authorize:

```text
VANTARE_ACCOUNT_BRIDGE_URL=https://olhwhfaczmrmooeaoqqf.supabase.co/functions/v1/native-account-authorize
VANTARE_SUPABASE_URL=https://olhwhfaczmrmooeaoqqf.supabase.co/
```

El mismo origen solo admite la ruta exacta
`/functions/v1/native-account-authorize`, sin query, fragmento ni credenciales.
Se comprueba también inmediatamente antes del POST, incluidos tests; variantes,
Storage, otras Functions y PostgREST se rechazan antes de enviar OAuth.
Authorize recibe `POST {"version":1}`, bearer OAuth Clerk y **ninguna apikey**.
Devuelve UUID interno, bearer de datos y expiración de hasta 300 segundos.
Todos los POST siguientes usan exclusivamente ese bearer de datos.

Para pasar al dominio, recompilar cambiando únicamente
`VANTARE_ACCOUNT_BRIDGE_URL=https://vantare.app/v1/native-account/authorize`.
Supabase/anon y el contrato no cambian; el orquestador debe configurar Cloudflare
para reenviar esa ruta a la función validante sin redirecciones HTTP.
`license-credential` y Third-Party Auth no sustituyen este intercambio.
Una configuración parcial/inválida deja el puente inactivo y muestra
«servicio no configurado: falta el puente de identidad»; conserva los borradores.
HTTP tiene plazo global de 8 segundos por petición y no sigue redirects.

#### Capturas y conservación

«Capturar pantalla» guarda el texto actual y toma el **monitor principal** en
Windows. Muestra una miniatura antes del consentimiento; se pueden añadir/quitar
hasta tres imágenes. Cambiar texto o imágenes invalida la vista previa/consentimiento.
No se sube nada hasta pulsar Enviar tras revisar y consentir el contenido exacto.
Revisar y quitar imágenes que contengan datos personales: quitar EXIF no elimina
información que esté dibujada en la pantalla.

Se reutiliza `image 0.25.10`, ya fijado por GPUI, como dependencia directa con
solo JPEG; no se añade otro paquete o versión al lockfile. JPEG a calidad 75,
lado mayor como máximo 1920 px; si supera 400 KiB se reduce resolución manteniendo
la calidad. Rechazo local si no alcanza el límite. Codificación desde RGB nuevo:
sin EXIF, nombre original ni ruta de usuario. El envío contiene exclusivamente
los nombres opacos `v1/<hash>/<batch UUID>/<evidence UUID>` del bucket privado.
Las imágenes completas se guardan protegidas con DPAPI, no viajan por IPC.
IPC admite hasta 128 KiB para tres miniaturas y el JSON escapado del reporte;
almacenamiento protegido hasta 2 MiB para tres JPEG serializados y sus miniaturas.

Con imágenes: `testing_center_prepare_screenshot_batch` → INSERT JPEG en
`storage/v1/object/testing-center-evidence/...` (`x-upsert=false`) →
`testing_center_finalize_screenshot` → `testing_center_submit_report_with_evidence`.
Sin imágenes: `testing_center_submit_report`, sin cambiar su schema.
Se validan UUID, posición, digest y ruta de cada slot; no se aceptan URLs remotas.
Un objeto ya insertado tras perder conexión no se sobrescribe. Finalizar encola
validación, **no** significa ready. Si attach devuelve
`testing_center_evidence_not_ready` (55000), se explica que sigue en validación
con borrador e intento conservados. Al reintentar se reutiliza manifest/key/JPEG;
los slots ready no se vuelven a subir. Se debe desplegar un consumidor del outbox
que valide tamaño, formato, dimensiones y hash y marque evidencia/batch ready.
El cliente nunca concede ese estado.

El intento se protege antes de cualquier HTTP. 401, 403, 413, 5xx, desconexión,
validación pendiente y respuesta malformada conservan borrador/intento.
401 invalida la sesión de datos para autorizar de nuevo. Sin membership tester:
«Tu cuenta aún no está habilitada para enviar reportes» y se indica solicitar
el rol a Isaac. Una cuenta/canal distintos no heredan el intento.
«Reintentar» recupera contenido y capturas originales, incluso tras reiniciar,
y requiere revisar y consentir de nuevo; **no hay reintento automático**.
El recibo durable evita reenviar lo confirmado y no elimina un borrador posterior.

Descripción (acción/esperado/observado), módulo, versión, canal y sistema operativo
están cubiertos. Hasta 2048 bytes por texto y 4096 de contexto; borrador de 60 KiB
incluyendo miniaturas. **Logs y simulador observado siguen fuera de este corte**:
servicios no observa simuladores y el supervisor descarta stderr. No se inventan
logs ni diagnóstico. La RPC admite un diagnóstico cerrado de 64 KiB/100 entradas,
no un campo arbitrario de simulador; hace falta una fuente real acotada y sanitizada
coordinada con el supervisor para cubrir el requisito inicial de logs.

#### Pasos de servidor para el orquestador

1. Desplegar la `native-account-authorize` del worker de servidor en el proyecto
   fijado, con `verify_jwt=false`, validación Clerk/client/scopes y mapping #909.
   Verificar emisión de un token aceptado por PostgREST (`authenticated`, UUID sub,
   TTL máximo 300 s). Las claves de firma permanecen en servidor.
2. Confirmar las RPC/migración `20260814154558_testing_center_screenshot_evidence.sql`,
   bucket privado, RLS y **consumidor de validación** del outbox. En las rutas
   revisadas de este checkout hay contrato/migración, pero no un consumidor listo
   que demuestre el paso validating → ready. Coordinarlo con el worker de servidor;
   sin ese paso, reportes con imágenes se conservarán pendientes.
3. Habilitar tester y su membership `testers` desde `native-admin` con Isaac.
   `nightly` exige primary_tester/owner: el login por sí solo no concede estos roles.
4. Inyectar las variables públicas anteriores y recompilar el conjunto nativo
   (Hub, supervisor y servicios comparten el DTO IPC ampliado).
5. QA autorizada del orquestador: envío sin imagen, con imagen validada, cuenta sin
   rol, expiración de bearer, desconexión/reinicio y reintento. **El worker no envía
   reportes reales**, no despliega y no modifica memberships de producción.

El inventario previo del conector apuntaba a otro ref (`ombjshwzqgeisazijduq`):
no constituye evidencia del proyecto fijado en el contrato. Este cambio no afirma
Histórico: haber verificado el deploy actual. Notion no disponible por excepción explícita;
seguimiento allí pendiente. Evidencia local en `C:/tmp/isa-1452-evidence/`.
Las capturas del Hub con adjunto usan un fixture de QA y el renderer productivo:
demuestran composición de UI, no Storage/Clerk/validación reales.

Gates: fmt, Clippy, nextest workspace y lifecycle; compilación siempre `-j 2`.
Para lifecycle usar `RUST_TEST_THREADS=2` y no argumentos de filtro: el harness
propio de Runtime interpreta `--test-threads 2` como filtro `2`, omitiendo escenarios.

## Informes automáticos de fallo (#1472)

Desde #1515, fallos y uso están desactivados por defecto. `privacy.json`
registra `crashes_decided`: sin esa decisión explícita, un `crashes: true`
antiguo no habilita captura ni envío. El Hub pregunta antes de mostrar su
acceso normal y guarda aceptar o rechazar; ambos permiten continuar. Ajustes
› Privacidad permite cambiarlo. Cambiar datos de uso no decide sobre fallos.
La migración descarta los slots de fallos antiguos antes de aceptar; retirar
el permiso borra los slots pendientes. No se modifica la cola voluntaria del
Testing Center ni se realiza ninguna llamada remota desde la pregunta.

La salida de crashes contiene únicamente `code=native_panic`, versión de la
build, SO y como máximo 64 direcciones numéricas de pila. No se simbolizan ni
se envían mensajes de panic, rutas, nombres de binarios, timestamps o el UUID
estable del usuario: PostHog usa el identificador fijo `native-crash` para
estos eventos. También se descartan los campos de texto de la cola antigua.
Windows captura las direcciones mediante RtlCaptureStackBackTrace; fuera de
Windows se envía una pila vacía hasta contar con un capturador seguro.
Los símbolos de la build se necesitan para interpretar las direcciones.
El hook previo sigue recibiendo el panic para conservar el comportamiento
local; esta política se refiere a la cola y el envío automático. Los informes
voluntarios del Testing Center mantienen su preview y su contrato propio.

## Calendario publicado — #1488

`CalendarRefresh` consulta por POST la RPC pública de solo lectura
`race_schedule_current` con la URL y la clave anon públicas fijadas al compilar.
No necesita sesión Clerk, puente de cuenta ni permisos de publicación.
`Reply::Calendar` devuelve el horario JSON o ausencia de publicación; el Hub
lo valida con `Schedule::parse` y conserva su caché local ante un fallo.
Se mantienen los límites HTTP/IPC, timeout y cierre de services durante Live.
Compilar Hub, supervisor y services juntos; no mezclar binarios anteriores.

Revisión del paso 7: ClockBehind.until_ms está en tiempo de pared (lápida
efectiva menos forward_millis), con aviso de fecha/hora local. El estado local
del supervisor usa el mismo aviso si omite renovar. NoCredential/RecoveryRequired/
ClockBehind frescos admiten consultas al helper; Logout sigue disponible con
canal del núcleo autenticado, incluso ante denegación o caducidad. Sin conceder
derechos ni saltar el ACK durable; ADR0102.
