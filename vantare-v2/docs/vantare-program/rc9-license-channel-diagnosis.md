# VANTA-105 / #1782 — diagnóstico de canales RC9

Fecha: 30-oct-2026. Código contrastado en `160f228bb82edc8e5463a8bcbb39fc6c6599a5fb`
(RC9 0.0.987, incluye #1796 y #1800). Diagnóstico sin ejecutar binarios ni
abrir, cerrar o reiniciar la instalación. No se han leído credenciales ni DPAPI.

## Veredicto

**No bloquea la release por la evidencia disponible, pero hay que arreglarlo.**
El cierre del helper por inactividad tiene recuperación antes de la siguiente
acción y se anuncia como un error de protocolo engañoso. Los errores del canal de
derechos requieren investigación: no revocan por sí mismos la licencia, pero una
interrupción suficientemente larga sí puede mostrar candados o avisos temporales.
No hay evidencia de pérdida durable de derechos, de versiones mezcladas ni de
tormenta de peticiones en la ventana analizada. Tampoco hay evidencia suficiente
para declarar todos los BrokenPipe inofensivos o atribuirlos a una carrera concreta.

Este dictamen se limita a estos mensajes: no acredita el resto de QA ni autoriza
publicación o promoción. Un candado reproducible con licencia vigente, una renovación
que no se recupere o un rechazo explícito de versión cambiarían el dictamen.

## Condiciones exactas en el código RC9

- `native/runtime/src/services.rs:530-536`: después de consultar al núcleo con
  `control::request_cancelled(Read)`, **cualquier Err** produce
  `license-auto-core-unavailable`; si `state.try_lock()` tiene éxito se fija
  `core_retry_at = now + 30 s`, y se omite
  la renovación de ese ciclo. No informa si falló conexión, identidad, lectura,
  versión, secuencia o rechazo remoto. La espera comienza en el instante anterior
  a la consulta; no son necesariamente 30 segundos desde la impresión del error.
  Si ese try_lock falla, no se guarda el backoff: no existe garantía absoluta
  de separación de 30 s entre estos errores, aunque los conteos no muestran ráfaga.
- `native/ipc/src/control.rs:162-190`: la consulta abre una conexión nueva,
  comprueba imagen, escribe un Request con secuencia 1 y lee una Response. Falla
  por transporte, imagen no admitida, versión, secuencia o `response.error`.
  **No hay un canal persistente de derechos que caduque por inactividad.**
- `native/runtime/src/rights/host.rs:224-249`: `serve` imprime
  `canal de derechos cerrado: {kind}` cuando falla leer/validar la petición o
  escribir la respuesta. En Windows `native/ipc/src/pipe.rs:264-280` convierte
  ERROR_BROKEN_PIPE de lectura en EOF (read_exact lo convierte en UnexpectedEof).
  Por tanto el BrokenPipe observado corresponde a la ruta de **escritura de la
  respuesta**, en `host.rs:240-241`, después de que el peer cierre el extremo.
  No identifica cuál de los consumidores cerró ni el motivo. El mensaje no
  significa fallo de firma, revocación ni cierre del núcleo.
- `native/services/src/bin/vantare-services.rs:86,97`: el prefijo
  `vantare-services:` se imprime al salir `run()` con error. El texto específico
  corresponde a `Error::Protocol` (`native/services/src/error.rs:46`). El host
  usa **5 minutos de plazo por E/S** (`native/services/src/host.rs:30`); todo error
  de lectura con stop sin señalar se convierte en Protocol (`:53-56`), también
  EOF y TimedOut. También lo producen errores de inicialización/transporte,
  nonce/secuencia inválidos (`:12-19`) o escritura fallida (`:66`). Una versión
  numérica incompatible se clasifica como `Error::Version` (`:13-14`), con otro
  texto. Este log genérico no permite distinguir por sí solo timeout y JSON inválido.

## Recuperación y efectos reales

El Hub hace un Probe antes de enviar la acción (`native/hub/src/services/client.rs:69`).
Si falla por una categoría recuperable de transporte, abre una conexión nueva;
no repite una acción cuya respuesta ya se perdió. El supervisor hace otro probe
local al helper con `Status`, comprueba que siga vivo y lo reemplaza si murió o
su transporte se cerró (`native/runtime/src/services.rs:359-409`,
`native/services/src/process.rs:167`). La nueva instancia transfiere derechos y
exige ACK antes de servir la acción. #1800 sincroniza pruebas de esa recuperación;
no cambia el protocolo distribuido ni los plazos.

El Probe del Hub y LicenseStatus se responden directamente desde el núcleo
(`native/runtime/src/services.rs:322-333`). Por eso la consulta de avisos cada
5 s (`native/hub/src/services/view.rs:410-418`) **no evita que el pipe del helper
quede 5 minutos sin órdenes**. Una UI activa puede convivir con ese cierre.
Es compatible con que ya no haya helper residente y la app siga funcionando.
Su recuperación no requiere una nueva petición native-license si no toca renovar.

La renovación automática tiene suelo de un minuto; los fallos transitorios
aplican 1/2/4/8/15 minutos y un definitivo la bloquea hasta recuperación explícita
(`native/runtime/src/services/renewal.rs:65-119,132-165`). El sondeo local ocurre
cada 250 ms con Hub conectado y cada 30 s sin él (`:56-60`, services.rs:515-521),
pero sondeos locales no equivalen a peticiones HTTP. `core-unavailable` no instala,
invalida ni genera aviso: omite el ciclo. `license-auto-not-due` posterior demuestra
que otra consulta al núcleo tuvo éxito; **no es una renovación Verified nueva**.

Los consumidores conservan la última política ante un fallo transitorio solo
durante su TTL original, **menos de 2 s** (`native/ipc/src/control.rs:70-77,225-267`).
El Feed consulta cada 250 ms, pero una consulta puede esperar 5 s por operación.
Si ese consumidor no obtiene política fresca, `Feed::policy` devuelve el defecto
sin permisos (`:329`); overlays exige current + overlays_advanced (`native/ui/src/rights.rs:8`).
Puede, por tanto, aparecer un candado transitorio aun conservándose el binding
válido en el núcleo. Un Verified anterior no garantiza frescura continua.

Existe además un riesgo funcional confirmado por lectura, no observado en la
ventana de logs: `native/services/src/app.rs:82-88` convierte **todo** error de
`control::request` en `Error::Denied`. Si una renovación automática consigue la
credencial pero falla por transporte al transferirla al núcleo (`app.rs:216`),
`automatic_failure` clasifica Denied como Definitive (`app.rs:427-455`), y
`Renewal::completed` pone `blocked=true` (`renewal.rs:65-75`). No revoca el binding
anterior, pero deja de renovar automáticamente hasta una recuperación explícita
o una renovación que cambie el resultado. Puede generar aviso de autorización
falso y acabar en pérdida de acceso por vencimiento. Un error del sondeo inicial
del temporizador no toma esa ruta: ambos casos deben distinguirse.

La renovación automática también conserva el mutex del supervisor mientras
realiza IPC/HTTP (`services.rs:543-558`), bloqueando solicitudes simultáneas del
Hub (`:183`). Es un riesgo de latencia acotada, sin evidencia aquí de timeout de
usuario; requiere prueba de contención, no una promesa de recuperación instantánea.

Hay una ruta concreta que conviene medir, **no una causa demostrada**:
`rights/host.rs:260` y `:346` usan el mismo mutex para `advance`; este llama a
`rights/mod.rs:361` → `license/authority.rs:365-385` → `storage.rs:270-310`.
Se cifra/escribe/sincroniza/reemplaza el estado de autoridad bajo ese mutex,
normalmente aproximadamente cada segundo (`rights/host.rs:189-198`). Un disco o
cifrado lento puede retrasar las respuestas más allá de su plazo. El mutex ya
se libera antes de escribir la respuesta IPC (`host.rs:286`); mover esa escritura
fuera del mutex no arreglaría esta posible espera. No se propone quitar la
persistencia durable, relajar TTL ni alterar la autoridad sin evidencia y revisión.

## Evidencia temporal y versiones

Fuentes: `C:/VantareServer/evidence/rc9-publicacion/qa/`, snapshots `.runtime.full.log`
y hora UTC de su `.action.json`; `qa-pause-timeline.json`; log actual en
`C:/Users/Administrator/AppData/Local/Programs/Vantare/logs/runtime.log`.
La ruta sugerida inicialmente bajo LocalAppData/Vantare/native no contenía
runtime.log. Los logs de runtime no llevan timestamp: solo se pueden acotar
eventos entre capturas, sin medir latencias exactas ni correlacionar cada peer.
Los `.full.log` son acumulativos; contarlos como sucesos separados multiplicaría
artificialmente la frecuencia.

- La 0.0.986 privada ya tiene en `tool-validation-baseline.runtime.full.log`
  (20:45:37Z) 1 Verified, 1 core-unavailable, 5 BrokenPipe y 1 Protocol. El
  Verified precede a esos errores. El worker QA confirma cierre de 986 a 20:55:47Z.
- RC9: la captura 010 de 21:07:40.768Z ya contiene HTTP200, Ok y Verified,
  sin errores de canal. Entre ella y 011 (21:08:22.522Z) se añaden 1
  core-unavailable y 3 BrokenPipe. Antes de 012 (21:08:42Z) aparece not-due:
  hubo lectura posterior exitosa sin necesidad de otra renovación.
- Entre 013 (21:08:44.535Z) y 014 (21:09:31.841Z), se añaden otro
  core-unavailable, 4 BrokenPipe y un HTTP200/Ok. El único Comprobar acceso
  manual ocurrió en 014; ese HTTP no demuestra recuperación automática.
- En 102 (21:21:50Z): **2 core-unavailable, 7 BrokenPipe, 1 Protocol,
  1 Verified y 2 HTTP200** en unos 14 minutos desde 010. Ningún nuevo
  core-unavailable/BrokenPipe desde 014. El primer Protocol aparece entre
  049 (21:13:53.170Z) y 050 (21:14:40.615Z), compatible con cinco minutos
  después del último trabajo remoto conocido, a 21:09:31Z.
- Entre 102 y 103 (21:22:34Z) se añade un segundo Protocol. No se conoce
  por estos logs la hora de arranque de esa instancia ni su última orden.
  Por ello el cierre por inactividad es explicación sustentada por código
  y cronología, pero no se afirma demostrado para cada línea.
- La lectura posterior del log vivo añade otro grupo de errores; es posterior
  a esta ventana fija y no debe mezclarse con sus conteos. No se puede afirmar
  que cada error vaya seguido de Verified: en esta ventana solo existe el inicial.

QA confirma que no suspendió ni depuró ni mató procesos; usa PrintWindow/UIA,
mouse_event/SendInput y pausas de acciones de hasta 105 s. No se abrió ni reinició
la app durante este diagnóstico. PIDs observados: supervisor6816, core13100,
Hub13612 (QA confirma overlays4000), desde aproximadamente 21:07:33Z, todos
los tres procesos inspeccionados en la misma generación `8b21ba23e510402385f15fc04384e84e`.
No se encontró helper residente al inspeccionar. No se inspeccionaron argumentos
ni entorno de procesos. La ausencia de helper impide comprobar directamente su
imagen anterior, pero el supervisor lo lanza desde la ruta hermana prevista.

No hay rechazo explícito de versión en esta evidencia. Mezclar procesos sigue
siendo una posibilidad general de instalación, no la explicación acreditada aquí.
El transporte de derechos es v5 y services **v15** (`services_protocol.rs:7`);
el README nativo aún dice v14 y queda desactualizado en ese punto. Son contratos distintos, no un
conflicto entre generaciones. Los chequeos de versión y secuencia son explícitos
en control.rs:183-189 y process.rs:188-193. JSON incompatible también podría caer
en el error genérico: no se puede excluir todo esquema distinto solo por el texto.
En concreto, un helper v14 no puede deserializar LicenseRenewAutomatic de v15:
la lectura falla antes de comprobar la versión numérica. No se observó ese patrón
de renovación fallida ni hay evidencia de helper antiguo en la sesión RC9.

## Arreglo mínimo propuesto y validación pendiente

1. Separar el cierre esperado del helper por timeout/EOF del error de codec,
   nonce/secuencia y versión. Mantener recuperación previa a la acción sin replay.
2. Conservar la categoría de transporte en `App::core_command`: timeout/EOF/cierre
   local deben ser transitorios, sin convertirlos en rechazo definitivo. Mantener
   rechazo explícito, incompatibilidad y controles de identidad como errores
   distintos. Probar fallo durante TransferRights de renovación automática y
   siguiente reintento exitoso, sin revocar ni repetir el efecto HTTP ya confirmado.
3. Añadir diagnóstico local cerrado con UTC/tiempo monotónico, fase, categoría
   de error, duración y PID/rol del peer. Medir espera del mutex, avance/persistencia
   y escritura de derechos. Nunca incluir nonce, cuerpos, rutas, tokens o licencia.
4. Regresión con reloj/sincronización explícita: helper ocioso → cierre limpio →
   nueva acción recibida una sola vez; respuesta perdida a compra no se repite.
   Para derechos, almacenamiento de prueba bloqueado y liberación explícita:
   observar TTL/candados y recuperación sin HTTP adicional. Si demuestra bloqueo
   de persistencia, diseñar el arreglo mínimo conservando ACK/antirollback.

Se han leído las regresiones existentes de renovación/backoff, conservación de
TTL y reconexión sin replay; **no se han ejecutado**. Sin cambio de producto,
build, fmt/clippy/nextest/lifecycle/telemetría se omiten por encargo diagnóstico y
para no interferir con QA. La revisión de fuentes demuestra rutas; no sustituye
la prueba de fallo lento ni acredita ausencia de parpadeos entre capturas.
Se usaron dos subagentes T3 DeepSeek autorizados, ambos solo lectura y completados;
sus hallazgos se contrastaron con el código RC9. Se corrigió el dato v14 del README
usando la constante v15 y se verificó independientemente la ruta Denied definitiva.
Seguimiento abierto: [#1803](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1803),
Project Vantare / Backlog / area:licencias, sin milestone hasta triaje.
Relacionado: #1799 cubre residencia, avisos y E2E del temporizador; este seguimiento
debe enlazarlo, sin duplicar ni implementar ese alcance.
