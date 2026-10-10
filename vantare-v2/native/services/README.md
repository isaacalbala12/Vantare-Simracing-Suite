# Servicios nativos — ISA-1430

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
haber verificado el deploy actual. Notion no disponible por excepción explícita;
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
