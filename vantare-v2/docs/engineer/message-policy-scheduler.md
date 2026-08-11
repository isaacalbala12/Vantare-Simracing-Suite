# ENG-05 — Policy y scheduler determinista de mensajes

> **SNAPSHOT / ISSUE EVIDENCE.** El estado inferior pertenece al corte aislado
> de ISA-158 y no describe Nightly. Consulta el [router Engineer](README.md) y
> el [handoff vivo](../vantare-program/handoffs/engineer-spotter.md); usa este
> archivo solo para contratos/evidencia focales del corte.

Estado: implementación aislada de ISA-158, pendiente de review independiente.
No existe wiring de producto, audio, UI, Wails/SSE ni adquisición nueva.

## Objetivo

Este corte coloca una frontera fail-closed entre los monitores de Engineer y
cualquier transporte futuro. Un monitor solo propone un `Candidate`; la policy
decide si puede entrar en la cola y vuelve a demostrar su validez justo antes
de producir un `Decision`.

La implementación vive en `internal/engineer/messagepolicy/`. Es síncrona: no
crea goroutines, timers, canales ni sleeps. El dueño del runtime inyecta un
reloj y llama a `Observe`, `Submit`, `Next` y `Cancel` desde su propio loop.

## Contratos v1

- `Candidate`: intención, sujeto, familia, prioridad declarada, TTL, contexto
  de epoch/identidad, versiones, claim semántico tipado y payload escalar
  acotado.
- `Decision`: copia inmutable del candidato que superó admisión y
  revalidación.
- `PolicyOutcome`: resultado observable `emitted`, `suppressed`, `expired`,
  `cancelled` o `unavailable`, con motivo tipado.
- `SchedulerState`: contadores y una ventana diagnóstica limitada; nunca
  conserva telemetría ni datos personales completos.
- `Evidence`: prueba canónica actual. Incluye versiones, contexto, manifest de
  capabilities, estado de fuente, deadline de freshness y las familias cuyos
  campos requeridos están realmente listos en la observación actual. Añade una
  vista semántica fija de presencia lateral, combustible, pit, sanciones,
  vuelta y gaps; no guarda telemetry raw.

Los payloads son `map[string]string`, no `map[string]any`: no se admiten
objetos arbitrarios ni grafos de memoria. Candidato y decisión copian el mapa
en cada frontera para impedir mutaciones externas.

## Orden y prioridad

El orden total es estable:

1. prioridad descendente;
2. instante de creación ascendente;
3. secuencia de admisión ascendente.

La escala reservada es:

1. Spotter/peligro;
2. control de carrera;
3. fallos y recursos críticos;
4. estrategia urgente;
5. penalización genérica;
6. información de carrera;
7. motivación.

Cada intención aprobada tiene una prioridad fija. Un productor no puede elevar
su urgencia: una discrepancia resulta en `unavailable / priority_mismatch`.
En este corte solo se habilitan las decisiones ya demostradas por ENG-04.

Un candidato Spotter elimina todos los pendientes de prioridad inferior con
`cancelled / preempted_by_spotter`. La policy no reproduce audio; ISA-167 /
ENG-06 consume el `Decision` y aplica la preempción en el transporte.

Spotter conserva prioridad absoluta. Para el resto, un burst configurable y
acotado permite emitir el candidato inferior más antiguo después de una racha
máxima de decisiones superiores. Esto evita starvation bajo cola sostenida sin
retrasar nunca un aviso crítico de Spotter.

### Supersession de estado Spotter

La igualdad de prioridad no basta para ordenar mensajes compatibles. La policy
deriva uno de cuatro estados finitos desde la evidencia (`all-clear`, `left`,
`right`, `three-wide`) y aplica esta tabla tipada de valor:

| Estado probado | Aviso vigente | Avisos compatibles | Recordatorio |
| --- | --- | --- | --- |
| all-clear | `all_clear` | `clear_left`, `clear_right` | — |
| left | `clear_right` | `car_left` | `still_there` |
| right | `clear_left` | `car_right` | `still_there` |
| three-wide | `three_wide` | `car_left`, `car_right` | `still_there` |

`clear_left` y `clear_right` son transiciones contextuales, no estados
autosuficientes. Solo se entregan como tales cuando un antecedente compatible
ya recibió `AcknowledgeStarted` en el mismo lifecycle y la transición de
ocupación actual lo conserva. Haber estado pendiente o haber salido por
`Next` no cuenta como comunicación. Tampoco
cuentan `still_there` ni un aviso lateral parcial de `three-wide`. Si falta ese
contexto, la policy sustituye el clear por el estado autosuficiente demostrado
por la evidencia actual (`car_left`, `car_right`, `three_wide` o `all_clear`) y
registra `suppressed / spotter_context_replaced`; no inventa un lateral. La
misma comprobación se repite justo antes de `Next`: un clear que pierde su
contexto mientras espera tampoco puede salir con una generación antigua.

El permiso se liga a una generación de ocupación y se pierde al expirar el
antecedente, cambiar otra vez el estado, cancelar o cruzar un boundary. El
límite es exactamente el `ExpiresAtMS` de la decisión autosuficiente: justo
antes sigue siendo válido; en el límite y después ya no autoriza un clear.
`still_there` no renueva ese deadline ni convierte un recordatorio en estado
completo. Cada `Decision` devuelta por `Next` es solo una selección. El
transporte llama a `AcknowledgeStarted` inmediatamente antes de hacer visible
la notificación o iniciar audio; únicamente entonces avanza el contexto. Una
decisión expirada, cancelada o rechazada antes del ACK nunca lo establece.
`all_clear` sigue siendo autosuficiente y no necesita historial.

El aviso de mayor valor reemplaza pendientes Spotter menos informativos con
`suppressed / spotter_state_superseded`, incluso si siguen siendo literalmente
ciertos. Un aviso posterior de menor valor no puede reemplazar al más específico
sin un cambio de evidencia. Los empates conservan el orden determinista de
admisión. Esta regla no se aplica a ninguna otra familia.

## Admisión y revalidación

Antes de encolar y antes de emitir se comprueba:

- versión del contrato;
- versión canónica y de proyección;
- epoch e identidad completos y coincidentes;
- fuente `live` o `degraded`;
- freshness todavía vigente;
- capabilities `supported` requeridas por la familia;
- disponibilidad actual de todos los campos requeridos por esa familia;
- intención aprobada y prioridad exacta;
- timestamps coherentes y TTL no vencido;
- límites de ID, intención, sujeto, clave dedup y payload.
- regla semántica finita correspondiente a la intención y prueba de que sigue
  siendo cierta en la observación más reciente.

Las reglas semánticas sustituyen expresiones libres. Cubren presencia/clear de
Spotter, umbrales y repostaje de combustible, estado de pit, contador de
sanciones, vuelta actual y gaps. Si la situación cambia mientras el candidato
espera —por ejemplo `car_left` pasa a clear, se reposta, se sale del pit o
cambia el gap— se cancela con `semantic_invalidated`; nunca se verbaliza un
hecho caducado.

Un cambio válido de epoch, evento, sesión, coche, equipo o piloto cancela
pendientes y resetea completamente el contexto Spotter antes de observar el
nuevo estado incluido en esa misma llamada. Un cambio de identidad inválido
según el contrato de proyección falla cerrado y no conserva su evidencia.
`session.started`, desconexión y demás hechos de lifecycle llaman a `Cancel`,
limpian cooldowns e invalidan la evidencia. Tras `Cancel` no se admite otro
candidato hasta recibir una observación nueva. Un candidato vencido, stale o
semánticamente falso nunca se emite tarde.

## Dedupe, coalescing y presión

- La clave es `intent + subject` y tiene tamaño máximo.
- Un candidato más reciente con la misma clave sustituye al pendiente anterior
  y produce `suppressed / coalesced`.
- El cooldown se registra únicamente después de `AcknowledgeStarted`; una
  decisión seleccionada cuyo transporte falla antes de comenzar puede volver a
  intentarse.
- La tabla de cooldowns tiene capacidad fija y descarta la entrada menos
  reciente cuando se llena.
- La cola tiene capacidad fija. Bajo presión, un candidato solo desplaza a uno
  de prioridad inferior; nunca expulsa seguridad para admitir información.
- Cuando la cola está llena, se poda contra la última evidencia todo hecho que
  ya sea stale, inválido o semánticamente falso antes de coalescing y presión.
  Spotter hace además esta poda antes de su regla de supersession. Así un
  `all_clear` vigente no se pierde frente al `car_left` obsoleto que sustituye,
  incluso con capacidad uno y la misma prioridad P0.
- Los diagnósticos recientes son un ring lógico con límite fijo.

Límites por defecto: 64 pendientes, 16 campos y 2 KiB de payload por candidato,
256 bytes de clave dedup, 128 diagnósticos, 256 cooldowns y burst no crítico de
8 decisiones. ID, familia, intención, sujeto y cada componente de identidad
tienen máximos duros. El máximo duro de pendientes es 256, igual al laboratorio
ENG-04. Entradas o evidencias inválidas se rechazan sin conservar strings,
colecciones, manifests, payloads o motivos de cancelación arbitrarios.

## Deudas legacy resueltas en la frontera

### Penalización genérica

El runtime legacy todavía crea el text key
`penalties.new_drivethrough` cuando únicamente aumenta un contador. El adapter
test-only lo transforma en la intención neutral y demostrable
`penalties.count_increased`. La policy nunca admite el claim de drive-through.
No se ha modificado el monitor ni se ha creado una frase/audio productivo.

### Pits

Solo `pitstops.entry` y `pitstops.exit` son decisiones aprobadas. Box-now,
limitador, velocidad, ventana y tráfico de salida continúan como
`unavailable / decision_not_approved` hasta que una capability real los
demuestre.

## Integración con ENG-04

`internal/engineer/replayoracle` conserva el runtime legacy real como productor
de candidatos, adapta su salida a `Candidate` y la atraviesa por la nueva
policy. El oráculo sigue siendo test-only y no forma parte del grafo de
producto.

El golden v1 cambió de forma deliberada:

- la sanción genérica ya no aparece como drive-through no aprobado, sino como
  `penalties.count_increased` emitido;
- las decisiones de pits no demostradas siguen indisponibles;
- entrada y salida siguen siendo las únicas decisiones de pits emitidas;
- el orden refleja que rechazos de admisión son observables antes del drenado
  de las decisiones aceptadas de la misma tanda.

## Pruebas y presupuesto

Las regresiones cubren:

- tabla fail-closed de versiones, identidad, capability, freshness, intención
  y prioridad;
- orden total estable;
- preempción P0;
- coalescing y cooldown;
- TTL y revalidación al emitir;
- invalidación semántica de car-left/clear, repostaje, pit entry/exit, gaps,
  sanciones y vueltas;
- matriz exhaustiva de estados y mensajes Spotter de igual prioridad con colas
  de capacidad uno y mayor que uno, orden/diagnóstico deterministas, y
  coalescing neutral de sanciones 1 -> 2;
- matriz delivery-aware Spotter con capacidades 1/4/64: antecedente pendiente
  frente a despachado, `both -> left/right`, cambios laterales, expiración,
  cancelación y ocupaciones intermedias no comunicadas; ningún clear contextual
  omite el estado lateral vigente, incluso si la evidencia cambia mientras el
  clear ya está pendiente;
- boundaries válidos de epoch/identidad con estado nuevo igual o distinto,
  rechazo de identidad inválida, deadline del antecedente justo antes/en/después
  del límite, recordatorio sin renovación y revalidación del deadline en `Next`;
- límites de payload, dedup, cola, cooldown y diagnósticos;
- copias de ownership;
- cancelaciones de lifecycle;
- presión de cola sin pérdida de seguridad y starvation no crítico acotado;
- 10.000 iteraciones de soak virtual reproducible;
- fuzz de todos los strings/payloads no confiables;
- benchmark con cola saturada y sin tiempo real;
- integración con el `Runtime` y golden de ENG-04.

No se ha añadido ninguna dependencia. El benchmark saturado es evidencia local,
no un SLA de producto. El gate Go global pasa. El test heredado
`cmd/vantare.TestHandleDiscoverAppsEmitsDetected` usa discovery real de Windows
y es lento, pero también pasa sin cambios. Es deuda ajena a ENG-05: esta rama
no modifica Launcher ni `cmd/vantare`.

`go vet` pasa en los paquetes focales. El vet global conserva tres avisos
Win32 preexistentes por `unsafe.Pointer` en el reader/versionado LMU y en la
extracción de iconos de Launcher; ninguno de esos archivos pertenece al diff.
La corrección delivery-aware pasa el focal 50 veces, fuzz 10 s, ambos
benchmarks cinco veces, Engineer, Telemetry Core y el gate Go global. El race
no pudo repetirse después de esta corrección en el entorno actual: Go requiere
CGO y no existe un toolchain C con headers Win32; no se añadió una dependencia
para alterar ese entorno.

## Integración posterior

ISA-167 / ENG-06 conecta esta policy a `EngineerService` y documenta el ACK,
transporte y preempción en `docs/engineer/delivery-runtime.md`. ENG-05 sigue sin
crear TTS/STT, UI, nuevas capabilities o una fuente alternativa.

Rollback: revertir el commit de ISA-158. No existen migraciones, datos
persistidos ni estado remoto.
