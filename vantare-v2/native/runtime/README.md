Store del núcleo usa la lectura tipada descrita en [services](../services/README.md).
Binding, autoridad y marcador son guardas. Una marca ilegible conserva su barrera
y sus bytes; si la autoridad ya es sana no se vuelve a escribir ni a diagnosticar
por esa marca (F4). La prueba compara autoridad/marca tras dos reinicios. La
recuperación online verificada, límites de reloj y ACK durable siguen iguales.

## Contrato vigente de licencias — paso 10 (#1827)

Paso 11, corte A: solo se acepta credencial Ed25519 v1. JWS/v2 y su clave de
instalación se retiran; los derechos temporales conservan `paid_through` y los
perpetuos no tienen un vencimiento de sobre. Una firma v1 sin grants conserva
Gratis sin plazo firmado. La prueba diaria usa Founders v1 real, sin alterar
Policy. Se conservan los formatos y las guardas de binding/authority.

Corte B del paso 11: `rights::verifier`, `rights::authority` y `rights::catalog`
son sus únicos dueños. Las pruebas puras siguen disponibles fuera de Windows;
Owner/host continúan en Windows. Services transporta bytes HTTP nuevos y solo
usa claims después del ACK del núcleo. Credencial inválida tiene categoría propia
en control v7, sin cambiar el sobre: services conserva Version/Transient;
iat conserva Unavailable/Clock y lápida/denegación/caducidad conservan Rejected.

Sin `signed_until_ms`, el supervisor comprueba al arrancar y cada 24 horas
monotónicas desde una renovación verificada, para cualquier catálogo (incluidos
Gratis, Founders y Owner sin fecha). No se duplica el chequeo inicial de Gratis.
Transporte conserva derechos y aplica 1/2/4/8/15 minutos; un éxito reinicia las
24 horas. Live fuera de la ventana urgente y ClockBehind siguen frenando el
automático; compra, login confirmado, recuperación y acción manual conservan
sus excepciones y el suelo existente. Con plazo firmado se conserva su cadencia.
Reiniciar el helper o reconectar el Hub no reinicia Renewal ni su backoff.
Un supervisor nuevo comprueba una vez por diseño: no hay persistencia nueva.

La admisión del helper ya no instala una copia de disco: usa Read autenticado
y helper_command_allowed sobre Policy.state. Las consultas necesitan política
fresca; recuperación y Logout siguen disponibles con denegación, sin conceder acceso.
No hay TransferRights al abrir/cerrar. El núcleo es el único almacén de derechos;
InstallOnline conserva el ACK durable. ACK perdido → Transient → una emisión
HTTP en el siguiente intento, respetando backoff y suelo de un minuto.


Services v19 añade `LicenseStatus { policy, session, notice }` local al supervisor.
El aviso tipado se conserva en memoria hasta un resultado de renovación verificado,
un cierre confirmado o un nuevo login confirmado; perder/leer la respuesta no lo consume.
Transient no crea avisos persistentes; la recuperación se presenta desde Policy.
Login confirmado deja una comprobación única pendiente, con suelo y restricciones Live.
La sesión es la última observada de services, también NeedsSignIn; null significa
sin observación confirmada en ese intento, nunca SignedOut implícito. No arranca
el helper para consultarla. Hub no altera formularios/errores con esa observación
y sigue consultando avisos en NeedsSignIn. Los derechos del Hub y la compra solo se confirman
por el Feed fresco; el Hub ya no solicita renovaciones durante la espera de compra.
Solo el supervisor conserva esa ventana y su suelo/backoff. Inicio y Cuenta muestran
el aviso separado del resultado del usuario. Reiniciar el supervisor pierde su aviso
remoto en memoria; Policy sigue siendo la autoridad y conserva su diagnóstico.
V18/v19 se rechazan como Version antes del esquema, sin revocar; control v7 y fotos v11 intactos.

Contrato y rollback de datos: [ADR0102](../../docs/adr/0102-modelo-acceso-nativo.md).
Las secciones fechadas inferiores son históricas; este contrato sustituye sus
reglas de candidate/marcador y transferencia. La retirada de archivos antiguos
es un paso de arranque, sin copia ni reintento durable de credenciales. Rollback sintético con lectores
v17 y pre-NeedsSignIn, sin cambios de instalación: `native/scripts/license-generation-rollback.ps1`.

## #1827 — Policy.state / control v7 (paso 7)

El núcleo publica Active/Grace y los motivos de denegación, con fronteras
`signed_until_ms` y `grace_until_ms` separadas. No se deduce gracia desde Live.
El supervisor lee el estado: ClockBehind frena HTTP automático hasta la frontera;
un 200 verificado sin margen es Verified y espera 15 minutos en ventana urgente
(un minuto en los últimos cinco firmados). La compra conserva sondeos con suelo
de un minuto dentro de su ventana de diez; los fallos reales mantienen 1/2/4/8/15.
Firma, plazos, TTL y matriz de acceso siguen iguales; la pausa conserva el paso 6b.
[Contrato y límites de generaciones](../../docs/adr/0102-modelo-acceso-nativo.md).
Este contrato sustituye las inferencias históricas sobre control v5/v6 de abajo.

Services v17 versiona la Policy v7 anidada; Session/AccountCancel permanecen
intactos. V16 del paso 6 nunca se publicó en release.

## #1827 — Supervisor y sesión (paso 6, services v16)

`AccountCancel` (v16) cancela solo el intento OAuth/FAPI y relee Session;
conserva la cuenta protegida y los derechos. «Volver/Cancelar» lo usa sin
sustituirlo por Logout. Solo «Cerrar sesión» envía Logout. En NeedsSignIn,
Cuenta ofrece Google/Discord/email y también el cierre explícito de sesión.


Renewal lee únicamente `Reply::Account.session`: solo SignedIn permite renovar.
Pending, NeedsSignIn y SignedOut no admiten red automática ni reinician backoff.
Después de renovar, se consulta AccountPoll para observar el estado de services,
incluso si el refresh devolvió un fallo. No se deduce la sesión del error, de
expires_at ni de la política. Los errores de versión siguen siendo transitorios
sin invalidar derechos. Este contrato sustituye la inferencia histórica de #1812.

## ISA-1810 — Rechazo de la caché y disponibilidad del núcleo

Clock devuelve rechazo de caché solo si lo produjo el Install ordinario antes
de confirmar la instalación. Así services puede apartar un candidate anterior
a latest_issued y abrir la recuperación sin alterar la autoridad. Un Clock de
InstallOnline o del avance posterior a una instalación correcta sigue siendo
transitorio; no se confunde una instalación durable con una caché rechazada.
No cambian el contrato control v6, la tolerancia ±300 s, expiraciones ni lápidas.
Solo el núcleo concede derechos verificados; admitir el helper no los concede.
Una huella legacy local vacía produce indisponibilidad, no rechazo del candidate:
se conserva la caché buena y el binding del disco para cuando vuelva la identidad.

## ISA-1812 — Error de perfil y sesión restaurada

El scheduler confirma sesión con un reply de cuenta correcto. Un error de
perfil conserva esa sesión ya confirmada sin reiniciar el backoff; no admite
una sesión nueva desde un error. SignedOut explícito sigue retirando la
admisión de renovación, y el reset previo a Logout no se deshace por un error.
La licencia conserva su fecha firmada, con las reglas de autoridad existentes.

## ISA-1803 — Renovación antes del vencimiento, también en carrera

La renovación empieza una hora antes del plazo firmado; reintentos 1/2/4/8/15
minutos, con suelo de un minuto en los últimos cinco minutos anteriores al plazo.
Tras vencer vuelve a aplicarse el backoff normal. Desde el paso 7, una respuesta verificada sin margen nuevo no cuenta como fallo
y espera a la siguiente comprobación sin ruido de transporte. Con el cap de 15 minutos hay al menos tres reintentos y
15 minutos reservados para sondeos y E/S dentro de una ventana completa, con app/sesión/núcleo activos y sin bloqueos prolongados.

Isaac autorizó renovar en Live dentro de esa ventana urgente y dos excepciones
explícitas: recuperar acceso cuando no hay derechos activos, y confirmar una
compra del usuario durante diez minutos después de recibir `Checkout`.
Desde el paso 9 el Hub solo observa el Feed, sin un segundo scheduler. Este origen se conserva en el supervisor, no se deduce de
`signing_in` ni se acepta desde el JSON del peer. Son operaciones únicas, con
helper bajo demanda, prioridad Windows inferior a normal y cierre al acabar,
sin avisos al piloto. Si bajar prioridad falla, continúa con diagnóstico cerrado
`services-priority-unavailable`; ese fallo no bloquea la recuperación de acceso.
Las demás solicitudes automáticas no admiten helper/red fuera de la ventana.
Control v5 publica el plazo efectivo, que puede incluir la gracia de
una hora: el cálculo reserva conservadoramente esa hora en Live (hasta dos horas
antes del plazo efectivo). No se amplían TTL, gracia ni frescura de política2s.

Hub y temporizador comparten admisión/backoff y clasificación del ACK. El resultado
se evalúa en el reloj efectivo del ACK del núcleo, sin compararlo con la hora
capturada antes de HTTP; esto evita un falso transitorio si el reloj retrocede
durante la petición. Los consumidores conservan su comprobación de frescura2s y
la autoridad conserva antirollback. Restaurar una concesión con plazo firmado y margen no
dispara HTTP por ser el primer intento: el núcleo vuelve a verificar localmente
firma y autoridad. Una concesión Owner de treinta días espera la ventana urgente.
Gratis comparte el chequeo inicial/24 h del contrato vigente cuando no hay plazo
firmado. Con plazo firmado conserva el chequeo inicial y la ventana urgente.

La v1 no tiene caducidad global desde `issued_at`: cada Pro/Plus vence en el
`paid_through` firmado; Founders/perpetuos no vencen; concesiones operativas
Tester14d, NightlyTester72h y Owner30d como máximo desde la emisión, recortadas
si termina antes su asignación. Si la red falla toda la ventana, no se puede
renovar: se conserva la fecha firmada y únicamente la gracia ya autorizada.

## ISA-1793 — Segunda revision

Al abrir, un binding firmado rechazado por reloj/lapida va a cuarentena sin
reiniciar la autoridad persistida. Si falla persistir, el nucleo sigue vivo y
denegado, disponible para una nueva concesion firmada. El recorte de archivos
ya apartados es best-effort; puede superar tres copias si una esta bloqueada.
Comprar reabre la confirmacion automatica, conservando el suelo entre intentos.
El Hub consulta avisos cada 5 s y mantiene residente el helper mientras tiene
sesion; la mejora de residencia y avisos se sigue en #1799.

## ISA-1793 — Recuperación y renovación automática

El login y la sesión restaurada contestan sin esperar una renovación HTTP.
El temporizador pide `LicenseRenewAutomatic` con sesión confirmada y política
autenticada fresca. Un rechazo automático nunca revoca el binding vigente:
solo una concesión firmada nueva o una acción explícita pueden cambiarlo.
Un resultado tipado distingue verificación, rechazo definitivo y transitorio.
Los transitorios reintentan en 1, 2, 4, 8 y 15 minutos, con tope y reloj inyectado;
un poll pendiente no reinicia el suelo de un minuto. Se registra un código
cerrado por cada motivo de omisión, solo al cambiar, sin inundar el diagnóstico.

La sonda `Probe` reconecta antes de enviar una acción y no consume avisos.
La respuesta perdida de una acción devuelve error sin segundo envío.
El límite de dispositivos conserva su variante accionable. El temporizador
no borra la admisión de un login concurrente; sin Hub limita la consulta al
núcleo a 30 segundos y cierra el helper tras renovar.

Un binding de clave retirada, formato antiguo, firma inválida o DPAPI corrupto
se aparta junto al original, sin derechos. Se intenta conservar solo las tres copias
más recientes por nombre; los errores reales de E/S se propagan sin apartar.
Se conservan reloj y lápida, y las regresiones rechazan emisiones anteriores
tras la cuarentena. El núcleo sigue disponible para una licencia nueva válida.
Un rechazo criptográfico o de fecha al renovar conserva el binding anterior;
un fallo de persistencia de una concesión nueva sigue fallando en cerrado.

# runtime — adquisición y núcleo

Adaptadores LMU/ACC privados, validación y derivaciones centrales; publicación neutral y supervisor.
El supervisor `vantare.exe` embebe ICON1 desde `build-support`, igual que Hub/UI;
los accesos apuntan al propio EXE también para su icono. `tests/windows_icon.rs`
verifica el recurso ID1 y los bytes de cada tamaño del ICO compartido sin ejecutarlo.

QA #1638: `vantare-grabar-lmu-completo` graba SHM íntegro y REST descubierto en
`.lmu.gz`; `open_replay` admite ese archivo y `vantare-verificar-lmu` produce
DTOs/informe offline por el mismo adapter y Core. [Kit, formato y límites](../../docs/telemetria/grabacion-completa-lmu.md).
Son herramientas de QA privadas; no se incorporan al instalador de producto.

## #1562 · Ocultar fuera de pista

El núcleo publica `state.driving_situation` (Unknown/OnTrack/Garage/Paused/Replay)
por DTO v10, también con demanda vacía. Una grabación `SourceKind::Replay` no
significa replay del juego. Ocultar exige 250 ms de evidencia continua; un status congelado se confirma por
el reloj del núcleo dentro de su vigencia, sin nueva muestra para series/journal. Estado OnTrack explícito,
señal ausente/caducada, silencio de 500 ms y cambio de sesión restablecen visibilidad.
Garage exige una señal explícita de garaje/stall vigente del simulador. Pits,
velocidad <=0,5 m/s y parada nativa no bastan: servicio en carrera y colas paradas
del pit lane permanecen visibles. Señal ausente nunca se infiere del movimiento.

LMU lee mInGarageStall (scoring +507) y la pausa ya confirmada por SHM detenido + REST
reciente/proceso vivo. Un cero borrado en fixtures legacy sin reloj de telemetría
conservado es ausencia, no false. No existe señal de replay del juego verificada en este adapter;
no se infiere de `inRealtime` ni del transporte. ACC usa graphics.status: 1 replay,
2 Live, 3 pausa, con su frescura propia. Sin una señal de garaje verificada no se
oculta ACC por estar parado en pits; physics/graphics/UDP no sustituyen esa señal.
Sin evidencia positiva el resultado es Unknown y nunca oculta.

Ajustes ofrece un único opt-in global, `Layout.hideOffTrack` (false por defecto).
Studio → En pista → Fuera de pista ofrece heredar / siempre visible / ocultar.
`Instance.offTrack` usa inherit/always_visible/hide y participa en el documento,
guardado atómico, conflictos, Deshacer/Rehacer y recarga de overlays. Los layouts v1
anteriores se leen con defaults; binarios anteriores pueden rechazar los nuevos campos.
La política solo afecta LiveScreens; previews Studio/Workshop y entidades permanecen
vivas. No cambia demanda, derechos, adquisición ni posiciones de ventanas.

El pipe live solo acepta v10; lectores guardados siguen aceptando v7/v8/v9/v10.
Las fixtures UI migran únicamente la etiqueta 9→10. Los goldens v9 originales y sus
hashes se conservan: la comparación elimina exclusivamente la nueva metadata y
restablece esa etiqueta, manteniendo cada byte del resto. Tests independientes
protegen situación, transiciones, política y preview. No certifica juego/OBS físicos.

## #1638 · Relojes para avisos

Pulido posterior a #1664: después de caducar, cada bloque LMU necesita dos
avances de su propio reloj separados por menos de 500 ms. Las lecturas
duplicadas no cuentan y un reloj ausente interrumpe esa confirmación. Un tick
aislado seguido de otro congelamiento conserva `Stale`; no se exige la antigua
ventana continua de 2 s. Scoring y telemetría se recuperan por separado.

El lector `.lmu.gz` limita el historial XOR a **64 MiB agregados**, incluyendo
las claves. Rechaza antes de reservar el cuerpo si no cabe; no expulsa fuentes
porque se perdería la base del siguiente delta. Sigue admitiendo hasta 16 MiB
por cuerpo, 256 KiB de metadatos y 512 claves. Los temporales de reconstrucción
y el consumidor son memoria adicional a ese historial; no es una promesa de
RSS total de 64 MiB. Al reducir una fuente libera su reserva anterior.

La energía virtual admite los tokens ASCII de clase Hyper, Hypercar, LMH y
LMDh, sin distinguir mayúsculas y con separadores/sufijos numéricos. La detección
no crea un `String` por frame. Una clase desconocida no hereda energía solo
porque REST incluya `veFraction`; se mantiene `Unavailable`.

El contrato live vigente es DTO v11 (recompilar todos los consumidores).
LMU publica `session.timing.scheduled_end_s` desde mEndET válido y la distancia
longitudinal estimada a la próxima línea de salida/meta desde mLapDist y
la longitud de pista. En boxes o sin geometría válida no hay distancia.
Se conserva el número nativo de sesión en su identidad: cambiar entre dos
prácticas también invalida el REST anterior, aunque avance el reloj.
Las capturas disponibles NO acreditan inicio/final real, fase de salida ni
agenda de próxima sesión; esos campos permanecen `Unavailable`, también ACC.
No se deducen de remaining_s, movimiento, boxes ni llegada de un coche.


## #1827 — Gracia durante Paused (paso 6b)

La pausa conserva la gracia de una hora ya reconocida para la misma sesión live,
igual que Stale. Owner mantiene el juego activo y Host conserva su hora original
de entrada. Paused por sí solo no inicia gracia; reanudar no cambia el plazo.
Salir/cambiar de sesión, replay y Logout la descartan. La credencial y la gracia
siguen caducando con el reloj durante una pausa larga. No cambia protocolo,
firma, formato durable ni contrato de la política. La única fila modificada de
caracterización es Paused, marcada previamente para este paso (ADR0102 decisión4).

Revisión del paso 7: ClockBehind.until_ms está en tiempo de pared (lápida
efectiva menos forward_millis), con aviso de fecha/hora local. El estado local
del supervisor usa el mismo aviso si omite renovar. NoCredential/RecoveryRequired/
ClockBehind frescos admiten consultas al helper; Logout sigue disponible con
canal del núcleo autenticado, incluso ante denegación o caducidad. Sin conceder
derechos ni saltar el ACK durable; ADR0102.
