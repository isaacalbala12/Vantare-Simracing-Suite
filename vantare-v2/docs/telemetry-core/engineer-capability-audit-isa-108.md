# ISA-108 / TC-08A — Auditoría de capabilities Engineer

Estado: cerrada documentalmente el 2026-08-01. Esta auditoría no modifica
comportamiento. Revalida los 30 directorios de `internal/engineer` contra el
estado canónico que llega a `derive.FinalState` después de ISA-107.

## Veredicto

La migración es viable, pero `projection/engineer` v1 no basta para activar el
Engineer actual: solo proyecta sesión parcial, controles y scoring del jugador.
El core ya demuestra la mayor parte de sesión, parrilla, vueltas, gaps, fuel y
pit; ISA-109 debe exponerlos sin depender de la proyección Overlay.

El Spotter no puede entrar en cutover todavía. Necesita posición mundo X/Y/Z,
orientación 3x3 y velocidad del jugador y de rivales. El parser Engineer legacy
contiene offsets candidatos, pero las pruebas son sintéticas y las fixtures
LMU 1.3/1.4 versionadas por TC-07 ponen a cero esa geometría por no estar en su
allowlist. Por tanto son `not-yet-observed`, no capabilities productivas.

No se propone ningún `REPLACE` o `DELETE` funcional:

- 2 directorios quedan `KEEP`;
- 13 quedan `ADAPT`;
- 7 quedan `HARDEN`;
- 8 quedan `DISABLE` en producción hasta disponer de evidencia/capability;
- los 20 monitores se conservan, aunque solo sus subfunciones demostradas
  podrán activarse.

Antes de ISA-109 se requiere ISA-130 / TC-08A.1, un microcorte aditivo para geometría
Spotter. No amplía el producto: cierra una entrada obligatoria del plan TC-08.

## Significado de los estados

| Estado | Significado operativo | Conducta del adapter/monitor |
|---|---|---|
| `available` | Señal presente, válida y con freshness permitida. | Puede participar en una decisión. |
| `unavailable` | Capability soportada, pero no presente en esta sesión/frame. | No emitir; conservar solo estado no decisorio. |
| `not-yet-observed` | Existe candidato técnico, pero falta evidencia LMU real/versionada. | Capability no se publica. |
| `unsupported` | El contrato LMU canónico no contiene esa señal. | Monitor o subfunción deshabilitados. |
| `invalid` | La fuente llegó, pero violó tipo, rango, unidad o relación. | No emitir; registrar diagnóstico sanitizado y resetear transición insegura. |
| `not-applicable` | Señal correcta, pero no aplica al estado/sesión actual. | Silencio esperado, no error. |

`stale` no es `available` para crear avisos nuevos. Puede conservarse para una
vista diagnóstica, pero nunca dispara una transición. `missing`, `false` y
`zero` no son equivalentes. Un hecho ordenado (`lap.completed`, `pit.entered`,
etc.) se consume una sola vez por secuencia.

## Fuente canónica demostrada

La allowlist vigente está en
`docs/telemetry-core/lmu-overlay-signal-provenance.md`. Aunque nació para el
cutover Overlay, los campos siguientes viven en el estado neutral y pueden ser
proyectados de forma independiente para Engineer.

| Familia | Available con evidencia LMU | No disponible en el core actual |
|---|---|---|
| Sesión | source/end time, remaining derivado, máximo de vueltas, circuito, tipo de sesión, número de vehículos | longitud de pista, game phase, finish phase, flags, clima |
| Parrilla | identidad opaca, nombre piloto/coche, clase, jugador, posición, vueltas, sector, distancia, best/last/estimated lap, pit, paradas, contador de sanciones, gaps/laps a líder y coche anterior | número/equipo, finish status, pit-state label, tipo de sanción |
| Jugador rápido | lap, gear, RPM, speed m/s, throttle/brake/clutch, fuel/capacity | Virtual Energy, steering, mundo X/Y/Z, orientación, aceleración |
| Derivados/hechos | relative gaps, self-delta, controls history; session/lap/pit/connection facts | flags, incidentes, daños, weather, tyre/engine/wheel state |
| Engineer legacy | — | temperaturas/presiones, tyre wear, brake temp, dent/wheels, driver stint, pit box/window/menu |

La proyección Engineer deberá declarar capabilities por señal o familia
cohesiva. Un grupo genérico `standings` no autoriza automáticamente finish
status, flags o geometría.

## Matriz de los 20 monitores

La columna “Salida segura” describe qué puede conservarse después de ISA-109;
no cambia comportamiento en esta issue.

| Monitor | Inputs reales requeridos | Unidad/freshness/historia | Estado actual | Clase | Salida segura y gap |
|---|---|---|---|---|---|
| `engine` | RPM; water/oil temp; presiones | RPM fresh; temperaturas °C y presiones con procedencia; transición previa | RPM available; resto unsupported | DISABLE | No emitir temperatura, presión, stall ni all-clear hasta admitir señales reales. |
| `tyre` | temp/wear por esquina; brake temp | °C/% fresh por rueda; tendencia acotada | unsupported | DISABLE | Monitor completo silenciado; cero no significa neumático frío/nuevo. |
| `opponents` | IDs, driver/class, place, laps, best lap, pit, finish | scoring fresh; identidad estable; prev/current | parcial | ADAPT | Pits, posición y ritmo demostrables; retire/DNF/DSQ/swap quedan deshabilitados sin finish/driver-change probado. |
| `multiclass` | class, completed laps, lap distance, relative gaps, track length | clase/distancia/gaps fresh; historial corto | parcial | ADAPT | Tráfico/clase mediante gaps canónicos; cualquier cálculo que exija track length queda deshabilitado. |
| `watchedopponents` | ID estable, nombre, class, place, leader gap, selección | gaps s, freshness fresh; selección local | datos available; selección no es telemetría | ADAPT | Conserva altas/bajas y tendencia solo para IDs seleccionados; nombres no son identidad. |
| `flags` | game phase, yellow/sector/vehicle flags, blue context | enums reales y transición ordered | unsupported | DISABLE | Ningún aviso de bandera; gaps/posición no se usan para inferir flags. |
| `fuel` | litros, capacidad, lap completed, remaining/session | L y L/lap; facts ordenados; ventana acotada | available salvo Virtual Energy | ADAPT | Consumo y alcance de fuel; VE permanece ausente y nunca se trata como fuel/batería. |
| `penalties` | count y tipo/estado de sanción | contador fresh; evento ordenado para tipo/served | count available, tipo unsupported | HARDEN | Aviso genérico de cambio de contador; no drive-through/stop-go/served específicos. |
| `laps` | completed laps, last/best, position, remaining/max laps | segundos/count; facts lap; historial de vueltas | available | ADAPT | Completed/last/best/two-to-go cuando los inputs aplican; “fastest” global exige referencia demostrable. |
| `position` | place, laps, gaps, session transition | one-based/count/s; prev/current | available parcial | HARDEN | Ganancias/pérdidas simples; give-back, formation y causalidad de adelantamiento no se afirman sin flags/phase. |
| `push` | place, laps, best lap, gaps, pit, session | segundos/count; tendencia acotada | available parcial | HARDEN | Recomendación etiquetada, nunca hecho ni estrategia óptima; subreglas con track length/phase se silencian. |
| `racetime` | source/end/remaining, max laps, session type | segundos/count fresh; umbrales cruzados una vez | available | ADAPT | Avisos de tiempo/vueltas restantes; game phase no se inventa. |
| `sessionend` | session-ended fact, place/laps; finish status para resultado | hecho ordered; scoring final fresh | fact genérico available; finish unsupported | ADAPT | Fin de sesión genérico; won/podium/DNF/DSQ/pole requieren evidencia final específica. |
| `timings` | place, sector, gaps, pit | segundos con signo canónico; fresh; tendencia | available | ADAPT | Gap reports/pressured/held-up solo con gaps compatibles; stale silencia. |
| `pearls` | sesión activa, vueltas y gates de seguridad | editorial/RNG; nunca observación | gates parciales | HARDEN | Mantener contenido como consejo; no ejecutar durante datos parciales o estado de conducción inseguro. |
| `pitstops` | InPit + pit facts, lap distance, gaps, remaining | boolean/facts ordered; metros/s fresh | entrada/salida available; resto parcial | ADAPT | Entry/exit y conteo; limiter, box-now y pit window quedan deshabilitados sin señales propias. |
| `strategy` | fuel trend, sector, gaps, laps, pit | derivados versionados; confianza explícita | parcial | HARDEN | Solo consejo explicable; no declarar óptimo ni modificar Strategy Planner. |
| `driverswaps` | identidad de piloto, stint start/duration/límite | evento driver change + reloj; histórico por stint | not-yet-observed/unsupported | DISABLE | El fact existe en contrato, pero no tiene productor real demostrado; no avisar stint. |
| `damage` | daño por subsistema, ruedas detached | escala/unidad real y transición | unsupported | DISABLE | Silencio completo; los offsets legacy no son evidencia productiva. |
| `conditions` | lluvia/wetness, ambient/track temp | unidades/freshness y transición real | unsupported | DISABLE | No inferir lluvia ni temperatura desde campos no admitidos. |

## Matriz de los 10 módulos de soporte

| Directorio | Responsabilidad | Entrada/salida en la migración | Clase | Decisión |
|---|---|---|---|---|
| `audio` | cola, prioridad, router y player | consume mensajes, no telemetría | KEEP | No cambiar TTS/audio en TC-08; conservar expiry y prioridad Spotter. |
| `commands` | catálogo de intenciones | texto local -> acción | KEEP | Sin cambios; acciones mutables siguen requiriendo confirmación/capability. |
| `core` | runtime de monitores y Spotter | hoy `telemetry.Frame`; futuro adapter puro | ADAPT | Sustituir solo entrada/lifecycle; no reescribir monitores. |
| `lmu` | parser/readers Engineer paralelos | abre/decodifica fuentes fuera del core | DISABLE | Prohibido productivamente desde ISA-111; candidato de retirada auditada TC-09. |
| `pitmanager` | acciones locales LMU | comandos confirmados; no fuente de observación | HARDEN | Mantener dry-run/confirmación; no crear segundo poller de telemetría. |
| `replay` | fixtures y reproducción determinista | legacy Frame + futuro projection/facts | ADAPT | ISA-110 conserva fixtures y compara ambas entradas. |
| `service` | lifecycle, status, cola y notificaciones | suscripción canónica -> runtime | ADAPT | Un solo owner en composition root; sin selector simulator/replay productivo. |
| `simulator` | fuente sintética | tests/harness explícitos | DISABLE | No puede aparecer como connected en producción; conservar solo bajo test. |
| `spotter` | geometría y state machine | mundo/orientación/speed/pit -> eventos críticos | HARDEN | Lógica se preserva; entrada productiva deshabilitada hasta TC-08A.1. |
| `telemetry` | modelo paralelo `Frame` y source/service | adapter temporal hacia monitores | ADAPT | Se conserva hasta parity; no abre I/O. Retirada solo en TC-09 con consumidores cero. |

Cobertura: **30/30 directorios** y **20/20 monitores**. Clasificaciones
`REPLACE=0`, `DELETE=0`.

## Contrato para ISA-109

ISA-109 puede proyectar, sin nueva captura:

1. metadata/cursor/identity y estados de conexión;
2. sesión completa admitida y remaining derivado;
3. parrilla completa con scoring, fuel del jugador y relative gaps;
4. facts ordenados ya existentes;
5. quality, provenance y freshness por campo;
6. un adapter puro al `telemetry.Frame` temporal que no abra LMU/REST y que
   no convierta missing en zero.

ISA-109 no puede habilitar por sí sola:

- geometría Spotter;
- flags/game phase/finish status;
- engine/tyre/brake/damage/weather;
- tipo de sanción, driver stint o datos específicos del Pit Manager.

## ISA-130 / TC-08A.1 — Microcorte obligatorio

Antes de construir el adapter se debe admitir la geometría mediante una issue
propia, con este contrato mínimo:

1. documentar offsets/tipos/unidades y frame de referencia de world position,
   orientation y local velocity;
2. capturar al menos menú/pista y tráfico real, sanitizado y hash-pinned;
3. validar correlación scoring/telemetry por ID activo, no por índice;
4. validar finitud, matriz de orientación, signo left/right y continuidad;
5. añadir schema/catálogo/Observation/Batch/Reducer de forma aditiva;
6. probar player/opponents, stale/missing/invalid, reorder, desconexión y
   reconstrucción del estado;
7. no activar Spotter ni tocar monitores todavía.

Rollback: volver al commit de ISA-107. Esta auditoría solo añade documentos y
no necesita migración de datos.

## Gaps humanos y gates posteriores

- Spotter real left/right/three-wide/clear y latencia: obligatorio en ISA-112.
- Naturalidad/packaging del TTS y selección de dispositivo: fuera de esta
  auditoría, pero obligatorio antes del gate Engineer Beta.
- Acciones Pit Manager: continúan en dry-run hasta prueba no destructiva y
  confirmación explícita.
- Flags, daño, condiciones, tyre y engine no bloquean la migración del core si
  permanecen honestamente deshabilitados; sí bloquean declarar esas funciones
  como disponibles en el producto.
- El gate manual completo se agrupa al final del módulo conforme a la decisión
  de Isaac; tests no sustituyen esa validación.
