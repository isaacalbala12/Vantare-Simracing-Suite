# Beta nativa — diagnóstico y uso (#1453)

Contrato para testers, 2026-10-03. Issue: https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1453.
Base asignada: `27ca9066220abcc209f6dc95985de475b22ffd36`, rama
`vantareapp/isa-1453-beta-posthog`. Notion no disponible; el encargo autoriza
trabajar con GitHub. No se declara actualizado el seguimiento Notion.

## Qué puedes elegir

En **Ajustes → Privacidad → Diagnóstico y uso**:

- **Enviar informes de fallos** está activado inicialmente. Puedes desactivarlo.
- **Enviar datos de uso** está desactivado inicialmente. Solo se activa si lo eliges.

Las dos decisiones se guardan mediante la escritura atómica de ajustes del Hub,
con detección de cambios concurrentes, en `Vantare/native/privacy.json` dentro
del directorio de datos del usuario. Todos los procesos vuelven a leer ese fichero:
un documento inválido o ilegible impide capturar/enviar; no concede consentimiento.
Se pueden usar los interruptores con ratón, Tab y Espacio/Enter.

## Lista exacta de eventos y propiedades

| Evento | Cuándo | Propiedades específicas |
| --- | --- | --- |
| `crash` | Un panic Rust de un binario nativo | `binary`, `version`, `message`, `backtrace`, `timestamp` (segundos Unix del fallo) |
| `app_started` | Arranca una instancia efectiva del supervisor `vantare`, después de obtener la instancia única | `version`, `channel` |
| `live_session_started` | El núcleo observa por primera vez datos live para una época/sesión; una sesión distinta genera otro evento | `simulator` (`lmu` o `acc`) |
| `layout_widgets` | Los overlays aplican el layout inicial o cambia el conjunto de tipos visibles | `widget_types` (lista ordenada, sin duplicados, nombres del catálogo) |

El sobre HTTP contiene únicamente `api_key` (clave pública del proyecto), `event`,
`distinct_id` (UUID anónimo de instalación) y `properties`. A las propiedades de
cada evento se añade `$process_person_profile: false`; no se crea un perfil personal.
Los tres eventos de uso necesitan consentimiento tanto al capturarse como al enviarse.
No se reconstruyen eventos anteriores al consentimiento. Mover un widget sin
cambiar los tipos visibles no produce `layout_widgets`. Los replays no producen
`live_session_started`; ejecutar Hub/Workshop aislados no produce `app_started`.

No hay otros eventos: ni clics, ni pantallas visitadas, ni autocapture, ni grabaciones
de pantalla. No se adjuntan correo, ID Clerk, fingerprint de licencia, nombres de
pilotos, rutas del layout, posiciones de widgets ni telemetría del simulador.
Los mensajes de panic son texto de diagnóstico del código; las rutas Windows
`C:\Users\<nombre>` (también otras unidades y mayúsculas) se sustituyen por
`C:\Users\[usuario]` tanto en mensaje como en backtrace, antes de persistir y enviar.
Esto no es un anonimizador general de texto libre: el código que produzca panics
debe seguir evitando incluir datos personales o secretos en sus mensajes.

## Identificador y envío

`vantare_services::diagnostics::anonymous_id(&root)` devuelve un **UUID v4 aleatorio**
generado con entropía del sistema operativo, guardado una sola vez en
`<datos>/anonymous-id`. La publicación es atómica incluso si arrancan varios procesos.
El Testing Center puede usar esta función con `diagnostics::data_root()`; esta tarea
no cambia su payload ni su envío. No se consulta identidad ni licencia para generarlo.

El hook común está instalado en Hub, overlays, Workshop, importador, núcleo,
supervisor, servicios, Engineer, almacenamiento y grabadoras LMU/ACC. Conserva el
hook anterior y la terminación normal del panic. **Nunca hace red**. Cada informe
se guarda en `<datos>/crashes/`: mensaje máximo 1 KiB, backtrace máximo 8 KiB,
fichero máximo 24 KiB, máximo 32 ficheros. La cola de uso tiene otros 32 slots con
el mismo límite de tamaño. Una cola llena descarta el evento nuevo y registra un
error local; no crece indefinidamente ni bloquea esperando espacio.

El proceso `vantare-services` envía pendientes al arrancar y cada 60 segundos,
en un hilo con cierre y plazo HTTP de 8 segundos. El supervisor arranca un modo
`vantare-services --diagnostics` solo si hay clave de build: así el emisor no se
cierra al entrar en el juego junto con los servicios de cuenta. Usa el mismo
binario, sin cuenta, DB ni IPC, y hereda el Job Object. Un fallo de este auxiliar
no cierra núcleo/overlays; su cola se recupera en el siguiente arranque. Su cierre
usa el EOF y el plazo existentes del supervisor. Un lock del sistema operativo
evita dos emisores simultáneos. La revocación descarta pendientes del tipo revocado
en el siguiente ciclo; no puede retirar una petición que ya esté en vuelo ni datos
ya recibidos por PostHog. Un fallo HTTP o una respuesta sin confirmación conserva
el fichero. Solo un HTTP 2xx con JSON `{"status":1}` permite borrarlo. El envío es
al menos una vez: si el servidor recibe el evento pero se pierde la respuesta,
puede haber un duplicado al reintentar. No se modifican la adquisición del núcleo
ni sus ViewModels: la sesión la observa el hilo I/O de derechos cada 250 ms, fuera de la adquisición y sin leer identidad/licencia para el evento; el layout lo observa el host de overlays.

Host fijo: **https://eu.i.posthog.com**, endpoint `/i/v0/e/`. Reutiliza HTTP/serde del
workspace. No se añaden crates externos; UI, Hub, Engineer y Storage declaran
directamente el crate interno `vantare-services` con sus features de red desactivadas
por defecto. Esto permite compartir el hook local sin acoplar los renderizadores
a la red. Solo el ejecutable services ejecuta el emisor.

Verificación de la nota del orquestador: `cargo tree -e normal,build,features
-p vantare-runtime` y `-p vantare-engineer` no contienen `rustls`, `webpki` ni
`vantare-services feature "network"`. Ambos conservan el `ureq` sin TLS que runtime
ya utiliza para REST local LMU; no se incorpora otro cliente HTTP. Los árboles
solicitados con `-e features` incluyen también dev-dependencies: ahí sí aparece
TLS porque runtime **ya tenía en la base** una dev-dependency de services con
`features = ["network"]`. Los gates `--workspace` unifican esas features; no son
una prueba de que un build de producción por paquete incluya TLS. Los cuatro
árboles completos quedan en la carpeta de evidencia. Un build de distribución
que seleccione todo el workspace también unifica features: el empaquetador debe
conservar esta distinción, que ya existía antes de #1453.

`VANTARE_POSTHOG_KEY` se incorpora **al compilar**; no se lee una clave del entorno
en ejecución. Sin clave o con clave vacía no se instala la captura ni se encola uso
ni se arranca el emisor; los ajustes siguen disponibles y no aparecen errores de red.
Versión: `VANTARE_VERSION`, o versión Cargo si no se configura. Canal:
`VANTARE_BUILD_CHANNEL`, o `unknown` si no se configura.

Referencia del protocolo: [eventos anónimos de PostHog](https://posthog.com/docs/data/anonymous-vs-identified-events).

## Comprobación manual y límites

1. Abrir Privacidad: fallos activados y uso desactivado en una instalación nueva.
2. Cambiar ambos controles, reiniciar Hub y comprobar que conservan la selección.
3. En un build con clave de proyecto, provocar un panic en un binario de prueba:
   aparece un informe local sanitizado; services lo retira solo al confirmar envío.
4. Con uso desactivado, abrir la app y cambiar widgets: no se encola ningún evento
   de uso. Activarlo y reiniciar permite los tres eventos de la tabla.
5. Desactivar fallos: nuevos panics no crean informes y los pendientes se descartan
   cuando el emisor revisa la cola.

Los tests usan procesos de prueba y `test_http.rs`, nunca el proyecto PostHog real.
La clave aún no existe: la recepción real en UE y su visualización en PostHog
requieren la configuración del build por el orquestador. Se capturan panics Rust;
no access violations, aborts, procesos terminados a la fuerza ni minidumps Win32.
Si un proceso muere mientras escribe, puede dejar un fichero incompleto: no se
envía como si fuese un informe válido y ocupa un slot hasta su revisión local.
Las capturas/logs/gates están fuera del repo en `C:/tmp/isa-1453-evidence/`.
No hubo push, PR, merge, promoción ni publicación.
