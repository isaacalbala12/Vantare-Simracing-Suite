# Servicios nativos

## Contrato vigente de acceso, cuenta y Store

El contrato de producto y compatibilidad es [ADR 0102](../../docs/adr/0102-modelo-acceso-nativo.md).
Las entregas anteriores están en Git y en el [handoff](../../docs/vantare-program/handoffs/platform-commercial.md).

### Dueños y licencias

`runtime::rights` posee Authority, catálogo y el único verificador Ed25519 v1.
Services realiza red y persistencia de cuenta; recibe una credencial HTTP fresca
y la entrega a InstallOnline sin guardar ni consultar sus claims hasta el ACK
durable. No existen Candidate, TransferRights, JWS/v2 ni clave Installation
productivos. Los restos candidate/pending del namespace backend/canal se apartan
al arrancar, sin leerlos; rename best-effort, diagnóstico y reintento al reiniciar.
Se conserva la protección de downgrade a generaciones anteriores (RC9 incluida):
`native/scripts/license-generation-rollback.ps1` usa solo fixtures aisladas.

Firma/subject/device inválidos del núcleo son Version/Transient en services;
lápida/denegación/caducidad conservan Rejected e iat conserva Unavailable/Clock.
`account_conflict` HTTP 409 es una inconsistencia, no una revocación.
`outcome()` es la tabla única de resultados y efectos. Solo Logout, cambio de
identidad y DeviceReset revocan; exigen ACK antes de limpiar o confirmar.
Una renovación rechazada no borra la firma vigente ni amplía su plazo. ACK
perdido olvida esa emisión y pide otra por HTTP cuando toque; nunca repite la acción.
`online_capabilities` no concede acceso. Cadencia, Live y backoff son del
[supervisor](../runtime/README.md#contrato-vigente-de-licencias-y-supervisor).

El inventario cerrado de diagnósticos de caché es `license-cache-unknown-key`,
`license-cache-unsupported-format`, `license-cache-invalid-signature` y
`license-cache-unreadable`. No conceden derechos ni contienen la credencial.
La operación de claves y recuperación sigue el [runbook BIL-08](../../docs/billing/bil-08-offline-credential-runbook.md).

### Cuenta y avisos

Account publica SignedOut, SignedIn, NeedsSignIn o Pending. Identidad/sesión y
licencia son hechos separados. `invalid_grant`/401 del token OAuth guarda
NeedsSignIn sin reutilizar tokens rechazados; conserva identidad/perfil.
403 y fallo de userinfo tras refresh válido siguen transitorios. Otra identidad
exige invalidar antes de guardar su sesión. Un error de perfil no revoca derechos.
AccountProfileRefresh es presentación y usa el origen OAuth automático.
AccountCancel cancela solo el intento PKCE/FAPI y relee Session; Logout es explícito.

El supervisor sirve LicenseStatus con Policy, última Session observada y aviso
sin arrancar el helper. null es ausencia de observación, nunca SignedOut implícito.
El aviso definitivo/DeviceLimit vive en memoria hasta Verified, cierre confirmado
o login confirmado; leer/perder una respuesta no lo consume. Transient no lo crea
ni retira uno anterior. Policy conserva su propio diagnóstico tras un reinicio.
El Hub usa el Feed fresco para derechos y compra; Inicio/Cuenta muestran el aviso
separado del resultado manual. [Contrato IPC vigente](../ipc/README.md#contrato-vigente-de-acceso).

### Persistencia y recuperación

Store tiene una lectura sin efectos `read -> Value/Missing/Damaged`; E/S sigue
siendo error. `document_class` declara la clase de cada documento:

- Guardas durables: binding, authority/authority-recovery, Pilot, borrador e imágenes,
  buy-* y los restos de licencia retirados. El dueño decide; no se reinician en
  silencio. Borrador e imágenes permanecen juntos para recuperación asistida.
- Cachés reconstruibles: metadata OAuth, perfil, roadmap y report-attempt.
  `recover` valida y aparta; DPAPI/JSON dañado de las tres últimas permite
  reconstruir sin tocar la sesión sana. Gestión mantiene metadata estricta.
- Secreto de sesión: account dañado se aparta y queda sin sesión; el recargado
  tras login es estricto. `required` mantiene las lecturas estrictas y recover
  rechaza guardas.

El único `quarantine_dated` renombra sin borrar ni sobrescribir otra copia;
conserva tres por documento, contando formatos antiguos. Los dueños pasan la fecha real en milisegundos al restaurar perfil, roadmap,
report-attempt, autoridad y metadata OAuth de Gestión. Store no obtiene un reloj;
la fecha de cuarentena no modifica el reloj firmado ni concede derechos. Rename fallido conserva el original y es error;
la limpieza posterior es best-effort con diagnóstico. Formatos activos, contextos,
DPAPI, límites, ACL y exclusión permanecen iguales. Los métodos fixture son solo
soporte de pruebas. En el núcleo F4 conserva la barrera y bytes del marcador
ilegible sin reescribir una autoridad sana ni repetir su diagnóstico.

Logout guarda SignedOut sin discovery ni lectura previa de la sesión dañada,
siempre después del ACK de revocación. Limpieza cosmética de perfil es best-effort;
el ACK y el guardado SignedOut son obligatorios. E/S no autoriza sobrescribir.
Un buy-* ilegible ofrece recuperación asistida y reutiliza su clave al reintentar:
[checkout](../../docs/billing/native-checkout-recovery.md). Pérdida de un intento
incierto de informe y edición posterior pueden duplicarlo con otra clave:
[recuperación del borrador](../../docs/runbooks/testing-center-report-draft.md).
El helper de loopback exige opt-in por instancia en test-support; no hay opción
CLI/IPC/entorno equivalente. Distribución conserva HTTPS y raíces reales.

### Navegador alternativo y copia explícita

AccountCopyLink entrega LoginLink redactado en Debug. Si falla
el predeterminado HTTPS, Windows busca clientes StartMenuInternet en HKCU y
HKLM (vistas64/32): Chrome, Edge, Firefox, Brave, Opera y resto, priorizando
la configuración por usuario. Ejecuta solo el .exe absoluto registrado con la
URL como único argumento, usando Command::arg, sin shell ni flags del registro.
Si ninguno arranca, conserva el mismo intento PKCE/listener durante su plazo
original de tres minutos y devuelve copy_link=true. La URL se mantiene en memoria
como Secret; solo AccountCopyLink la entrega al Hub para el gesto del portapapeles.
No incluye tokens ni verifier. Cancelar, expirar, completar o reintentar retira
el enlace. El conjunto de binarios usa la generación vigente. No se modifica el registro, el predeterminado ni backend.
Si un Job externo rechaza breakaway con error5, se reintenta una sola vez sin
ese flag y se deja log sin URL. En ese caso el navegador hereda el Job y puede
cerrarse al salir de Vantare; el intento de acceso mantiene su plazo.

### Email y Device Grant

El canje mantiene el canje pendiente en memoria y hace un solo intento por AccountPoll,
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
## Desarrollo y otros servicios

**#1661 / VANTA-83:** Founders añade el plan perpetuo para contenido presente y
futuro. Generaciones services v19 / control v7 / fotos v11; recompilar el conjunto.
Incluye Nightly vitalicio junto al derecho Founders; no concede roles. [Contrato](../../docs/billing/founders-1661.md).

Testing Center comparte el protocolo de servicios vigente; recompilar el conjunto. F7=C: campos escritos locales,
etiquetas SQL fijas y salida estructurada por catálogo; no se envía prosa del tester.
Rutas cerradas: current_v2, envío consentido por Edge `testing-report-submit`,
crédito y acuse por fecha. La RPC directa no está permitida. Historial sin cuerpo
privado; arreglado requiere versión válida. No hay cliente Plane ni referencia PostHog productiva.
Alcance SQL y dependencias #1602/#1609: [contrato vigente](../../docs/runbooks/testing-report-followup.md).

`vantare-services` es miembro de `native/`: un workspace, `Cargo.lock`, edición
y lints compartidas. Proceso de usuario bajo demanda, sin GPUI/simuladores.
El supervisor `vantare` posee el auxiliar; el Hub solo manda comandos IPC.
El núcleo verifica y persiste la credencial y publica derechos a los consumidores.
Cuenta Clerk y datos Supabase tienen contratos distintos; el puente requiere
configuración/backend públicos fijados y acordados con Isaac.

Los gates se ejecutan desde `vantare-v2/` por la cola, con target propio,
locked/offline y dos jobs. Configuración completa: [native/README.md](../README.md).

```powershell
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo fmt --manifest-path native/Cargo.toml --all -- --check
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo clippy --manifest-path native/Cargo.toml --target-dir D:/VantareServer/targets/mi-rama -p vantare-services --all-targets --locked --offline -j 2 -- -D warnings
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo nextest run --manifest-path native/Cargo.toml --target-dir D:/VantareServer/targets/mi-rama -p vantare-services --profile ci --locked --offline --build-jobs 2
```

Cambios de runtime/domain/ipc/testdata incluyen telemetría y lifecycle de runtime;
las dependencias o crates tocados añaden sus propios gates. El target standalone
antiguo de C:/tmp no se reutiliza. No recuperar el stash anterior.
No hay dependencias async/DB/bus nuevas: se reutilizan transporte Win32/ACL,
ureq/TLS del lock, formatos/entropía mínimos y Ed25519/DPAPI de los cortes previos.
Runtime consume los tipos v1 y Store de services con `default-features = false`;
el verificador y Authority viven en runtime::rights. IPC es común, HTTP/URL
opcionales. Las pruebas de runtime habilitan network solo como
dev-dependency. Cargo unifica features en una compilación conjunta: ese grafo
no se presenta como prueba de ausencia de TLS en el artefacto completo.

`ReportReceipt` distingue un borrador limpiado, otro posterior
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
ningún secreto ni credencial real, `.env*` ni backend real. El alcance de sincronización se consulta en INTEGRATION.md.

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
El núcleo rechaza v1 cuando no existe huella local. Los formatos guardados y
la huella Windows se conservan. No se migran credenciales reales ni se sustituye
la huella por otro hash que invalidaría credenciales sin una migración.
JWS/v2 y su clave de instalación quedan retirados por ADR 0102, decisión 5.
Habilitar licencias Unix requiere otra decisión y una migración autenticada;
no hay un enrollment ni backend v2 planificado.

### Recuperación local y compra

Si cambia solo el redirect OAuth, la metadata incompatible se aparta en una
cuarentena fechada del contrato de Store y se redescubre con la configuración compilada. Un
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
