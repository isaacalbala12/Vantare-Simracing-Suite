# #1474 — Revisión de datos nativos LMU/ACC

Base local `13ae6945524b1b33dbd73b8df1ee2ae758707e7b`, rama
`vantareapp/isa-1474-telemetria-revision`. Encargo:
`C:/tmp/beta/r4/brief-1474-telemetria.md`. Entrega local para revisión del
orquestador; no aceptación, integración, promoción ni publicación.

## Inventario de ramas

| Trabajo anterior | Decisión en esta base |
| --- | --- |
| #1463 simplificación: `6c35b814`, `a3a08a91`, `e83e512f`, cierre documental `c15a76ce` | Los tres cambios productivos ya están recuperados/adaptados en `fd505f6f`, ancestro comprobado. Conserva pausas, fase fija de lectura, recorrido único y buffers IPC. Cierre documental leído: campaña antigua ruidosa/descriptiva, no prueba de esta rama. No cherry-pick duplicado ni traslado de sus cifras como resultado actual. |
| #1461 instrumentación: `c4fbd278` | Ancestro comprobado; banco de fases y ablaciones presentes. No nueva instrumentación. |
| #1461 invalidación: `4726e0c0` | Base conserva normalización del intervalo oculto y tests de demanda/historial. No cambios al render de Standings. |
| #1462 crítica: `6f7f040b` | Leída desde su worktree; sus cifras son históricas y sus propuestas hipótesis. P2 y parte de P6 ya adaptadas por #1463; el resto no se incorpora sin reproducción/medida. |
| #1468 widgets | Informes leídos. Fastest Lap 4,3109% era deuda visual; este encargo trata datos y no la corrige. |

Decisión sobre cada propuesta de la crítica #1462, contrastada con esta base:

| Propuesta | Situación / decisión #1474 |
| --- | --- |
| P0 perfil causal/latencia | Instrumentación apagable y banco ya presentes (`c4fbd278`). Perfil por función y dato→pantalla no se sustituyen por goldens; pendientes de campaña equivalente. |
| P1 reproyectar solo señales entregadas | `app.rs::ingest` todavía recorre widgets visibles; posible optimización, no fallo de datos demostrado. No introducir otra frontera de entrega sin campaña y regresiones. |
| P2 dormir hasta lectura | `service.rs` usa `Adapter::next_poll` y deadline de frescura; LMU mantiene fase 60 Hz (`fd505f6f`). Ya adaptada; no recuperar código antiguo. |
| P3 motivo de frescura | `freshness::log_transition` y `Core::freshness_reason` presentes. No quitar watchdogs que protegen relojes distintos. |
| P4 limitar ACC a 60 Hz | Sigue lectura de 5 ms y construcción de estado; limita publicación si no cambió. Cambiar cadencia requiere campaña/contrato temporal: no aporta un arreglo reproducido aquí. |
| P5 menos copias IPC | Buffers de escritor/receptor reutilizados en S3; otras copias/identidad por frontera siguen candidatas de perfil, no se reescribe protocolo/DTO. |
| P6 lectura LMU más barata | Un recorrido de coches y alineación ya adaptados en S1/S2. La copia/validación estable del mapping completo sigue protegiendo lecturas rasgadas; no reducirla por hipótesis. |
| P7 eventos sin sondeo | No se cambia el journal/Engineer fuera del alcance de errores de datos. Haría falta demostrar el coste y conservar ACK/lifecycle. |
| P8 espaciar REST | Cadencia 250 ms/backoff 2 s revisados; sin nuevo defecto de flags/dorsales en el corpus. No cambiar frescura para optimizar sin medida. |
| P9 un hilo pipe→GPUI | Revisión arquitectónica pendiente de latencia/cambios de contexto; no necesaria para los fallos de demanda encontrados. |
| P10 perfil Release | #1465 aporta perfil `prueba`, no perfil de rendimiento certificado. No introducir LTO/codegen nuevos; la medición productiva usa Release y LMU real. |

## Método y evidencia

Lectura de `ui/src/registry.rs`, las 18 demandas, proyecciones puras de
`domain`, filtrado/restauración `ipc/src/dto.rs`, adaptadores `runtime/src/adapter`,
saneamiento/derivación y trackers del núcleo. Las tablas describen el contrato
que existe y su cobertura; **ok no significa validación física de todas las
transiciones**. Los test vectores de límites se distinguen del corpus real.

Corpus obligatorio: LMU47 SHA-256
`c5b827ce1cfa558e732da934f11eb0f83f5dfb9e8a3c793f4d3f65ef8ca2a01c`;
ACC SHA-256 `422481dc88b1e7f9cb9ebaf025cc615d08453bea8fded36ca881b996ba386071`.
Goldens originales sin modificación: 10 DTO LMU, 3839 LMU47, ocho cortes ACC
y hash de sus 190308 DTO. Los cuatro cortes nuevos para probar demanda UI son
copias exactas de estos goldens; el replay contrasta su procedencia byte a byte.
Inventario reproducible de calidad/rangos: `C:/tmp/1474-evidence/corpus-fields.json`.
Además de las dos fotos activas, UI prueba el menú real y el fixture LMU real
degradado por el núcleo a 500 ms: cuatro regímenes × 18 widgets, más columnas
completas, pie Relative y multiclase configurables y H2H detrás (88 contrastes).
Su procedencia
también se compara byte a byte contra el replay/golden, sin fabricar valores.
El contraste común incrementa únicamente `Snapshot.sequence`, metadato de
transporte del test existente; no modifica ningún campo del simulador. Las
regresiones específicas H2H/Relative publican la foto sin ese incremento.

Contraste adicional con el [PDF Kunos SHM 1.8.12, espejo fijado](https://github.com/rrennoir/PyAccSharedMemory/blob/d08ae99739fe638de2785c67e8684bafcadf80de/ACCSharedMemoryDocumentationV1.8.12.pdf):
página 1 documenta fuel en kg y steering normalizado; página 4 viento en m/s,
sectores en ms y numberOfLaps completadas; página 5 consumo en L/vuelta;
página 7 no fija unidad de maxFuel. PDF/texto extraído y hash fuera del repo.
Esto confirma la discrepancia documental de fuel, **no su unidad física**.
El [header ISI InternalsPlugin](https://github.com/cosimo/rFactor2-DeltaBest/blob/master/Include/InternalsPlugin.hpp)
contrasta litros, velocidades locales m/s, RPM, marchas, steering y sectores
acumulados. Describe `mTimeIntoLap` como estimado por la fuente: el adaptador
conserva ese campo, no lo sustituye por otro reloj. `Reliable` significa aquí
declarado por fuente fresca; no acredita precisión física de ese tiempo. Header
y hash conservados fuera del repo; no se cambia el contrato/golden por hipótesis.

## Widget → campos → estado

Identidad `Cars` incluye coche/piloto/clase/dorsal y jugador; se solicita
automáticamente con señales por coche. Capabilities, origen, sesión ID y
estado de fuente son metadatos comunes. Cadencias son mínimas del **IPC**,
no una promesa de frecuencia del simulador.

| Widget | Campos/señales consumidos; cadencia | Estado dentro de la evidencia |
| --- | --- | --- |
| Standings | Identidad; puestos global/clase; pit; tipo/duración; gaps general/clase, last/best, vueltas según columnas; reloj/banderas cabecera; clima/pista/vueltas/tiempos según pie; 250 ms | ok en corpus/demanda; fase LMU y banderas positivas pendientes |
| Radar | Pose XY/yaw; vueltas/distancia; longitud de pista; 33 ms | ok en corpus; orientación/solape físico live pendiente |
| Pedals | Throttle/brake/clutch; marcha/velocidad/rpm; 16 ms | ok en capturas; conducción y cambios físicos live pendientes |
| Delta | Delta a mejor propia; vueltas/last/best para estado; 16 ms | ok al conservar datos; signo positivo/negativo conduciendo pendiente |
| Car Damage Visual | Aero/body/suspensión, cuatro gomas; 500 ms | ok en conservación; integridades ausentes en LMU/ACC, pendiente fuente |
| Input Telemetry | Pedales/clutch/marcha/velocidad/rpm; cada foto | ok en corpus y tests de historia; conducción temporal pendiente |
| Multiclass Relative | Puestos, identidad/clases, relativo al jugador, pit; 33 ms | ok en demanda; relative_s positivo y multiclase deportiva live pendientes |
| Broadcast Tower | Tipo/reloj/vueltas; puestos/gaps general y clase/last/best/pit/banderas; clima opcional 500 ms, resto 250 ms | ok en corpus; banderas LMU pendientes |
| Delta Trace | Delta, contador y tiempos de vueltas; cada foto | ok en conservación/historia; vuelta de referencia real conducida pendiente |
| Track Map | Poses y nombre de pista; 33 ms; geometría externa explícita | ok en demanda; disponibilidad de geometrías y alineación física pendientes |
| Track Weather | Aire/pista K; viento m/s/dirección; lluvia/humedad; presión; 500 ms | ok para señales admitidas; dirección/presión ausentes, lluvia positiva live pendiente |
| Car Damage Numbers | Mismos siete valores que Damage Visual; 500 ms | ok en conservación; mismas ausencias |
| Head-to-Head | Identidad/puestos y relative_s del rival elegido; 33 ms | corregido: demanda omitía Relative; entrega de familia con dato real verificada; gap positivo live pendiente |
| Fuel Strategy | Nivel/capacidad L, consumo L/vuelta, autonomía e historial; vueltas restantes con proyección; 500 ms | ok en conservación; ACC nivel/capacidad ausentes (kg no son L); consumo/repostaje real pendiente |
| Pedals Telemetry | Pedales/clutch/steering/marcha/velocidad/rpm; 16 ms | ok en señales/ausencias; entrada ±1 y marchas físicas pendientes |
| Relative | Identidad/puestos/clase, relative_s/relative_laps, pit, tipo/pista; last/best y reloj 250 ms; clima 500 ms o slots 250 ms; relativo 33 ms | corregido: track conserva temperatura y el pie stale conserva reloj/clima; gap positivo del jugador pendiente |
| Racing Flags | Flags con scope sesión/sector/coche; 33 ms | ACC verde real ok; LMU sin evidencia positiva, pendiente |
| Fastest Lap | Identidad/clase/jugador; vueltas, last/best, pista; 250 ms | ok en corpus/demanda; primera mejora observada y cambios live pendientes; deuda visual fuera de alcance |

## Trazabilidad campo a campo

LMU: `frame.rs::{admit,vehicle,inputs,weather}`, `translate.rs::{car,player,session}`,
`rest.rs`. ACC: `translate.rs::{car,player,player_car,session_model,weather,flags}`,
`protocol.rs::{read_session,read_car,lap}`. Núcleo: `core/{merge,derive,fuel,delta}.rs`.
IPC: `dto.rs::SnapshotDto::restore`. `Quality::Unavailable` no es cero;
`Stale` no es una lectura nueva; `Estimated` no es un dato nativo medido.

| Campo | LMU | ACC | Unidades, límites y ausencia |
| --- | --- | --- | --- |
| Coche/jugador | Slot SHM + asignación estable/gracia 30 frames | carIndex UDP/playerCarID SHM, nunca índice de array | IDs únicos por sesión; slots que vuelven y relevos protegidos por tests |
| Piloto | Nombre SHM → DriverId | Entry/driverIndex, fallback nombre jugador static | No inventar identidad de un rival sin Entry |
| Clase/puesto de clase | Clase SHM; puesto derivado de global | cupCategory/cupPosition UDP | ACC cup no equivale a categoría de vehículo; multiclase física pendiente |
| Dorsal | REST casado por slot y vehicleName | Entry.number >=0 | Caduca REST a 2 s; floor de sesión impide reutilizar respuesta vieja |
| Puesto global | SHM 1..104 | UDP o jugador graphics >0 | Cero/negativo no líder; incompletos no permiten vecino H2H inequívoco |
| Vueltas | SHM contador >=0 | SHM/UDP; estable fuera de spline 0,93→0,07 | Completadas, no vuelta en curso; columna/footer Standings conservan ese contador igual que el VM V2 React |
| Last/best | SHM positivos | SHM/UDP positivos ms/1000 | 0, -1, MAX ausentes; no récord estimado/stale |
| Estimación vuelta | SHM +472 positiva | graphics @1396 positiva y !=MAX | Segundos, Estimated; no tiempo medido |
| Sectores última vuelta | S1, acumulado S1+S2, last; diferencias estrictamente positivas | UDP last.splits, ms/1000 | No colocar lastSectorTime graphics en todos los sectores |
| Sector actual | SHM raw 0→2,1→0,2→1 | Graphics 0..2; UDP primer split ausente, estimado | Índice desde cero; evidencia física ACC pendiente |
| Lap distance | SHM metros no negativos | Spline 0..1 × longitud, Estimated | Antes de línea LMU negativo no se publica como distancia actual |
| Lap elapsed | SHM mTimeIntoLap finito | SHM currentTime o UDP CurrentLap, ms/1000 | Segundos; no confundir mLapStartET; fixture cero puede ser sanitización |
| Gap leader/ahead | SHM seconds/laps | Ahead jugador graphics @1580 válido fuera de pits; resto derivación | Gap::Time segundos o Gap::Laps contador; no restar vueltas como segundos |
| Gap class leader/ahead | Derivado conservador por clase | Cup posiciones + derivación cuando operandos existen | Estimated; no restar gaps no temporales ni ordenar posiciones ausentes |
| Relative seconds/laps | Núcleo por progreso y periodo best/last jugador | Misma derivación neutral | + delante/- detrás; Estimated. Sin best/last, relative_s ausente. Corpus no acredita esa señal positiva |
| Pit | SHM bool | Graphics isInPit/isInPitLane o UDP location 2..4 | UDP location desconocida no falso; transición física pendiente |
| Pose/velocidad | SI SHM; scoring alineado con telemetría; vector rotado por orientación | Pose SHM/UDP; velocidad estimada con reloj de vuelta por coche | Metros/radianes/m/s; ACC 300 ms TTL, tres poses y límites de plausibilidad |
| Penalizaciones | SHM numPenalties >=0 | Enum graphics: none→0, DT/SG→Estimated(1) | ACC límite inferior, no contador exacto; nunca contar segundos de penaltyTime |
| Throttle/brake/clutch | Telem @420/428/444 en 0..1 | Physics @4/8/364 en 0..1 | Fuera de rango/NaN ausente; cero admitido cuando corresponde |
| Steering | Telem unfiltered @404 | Physics @24 | -1 izquierda/+1 derecha; no radianes; ausencia no centro medido |
| Gear | Telem entero -1..15 | Physics raw−1, -1..8 | -1 reversa/0 neutral; no confundir UDP raw−2 |
| Speed/engine | Telem módulo velocidad; RPM×TAU/60 | Physics km/h÷3,6; RPM×TAU/60 | Modelo m/s y rad/s; formateador convierte para UI |
| Fuel level/capacity | Telem @524/@608; 0<=nivel<=capacidad positiva | Ausente; physics documenta kg y no densidad | Litros; ninguna conversión kg→L inventada |
| Fuel per-lap/laps-left/history | Tracker: ventana 3, historial 10, cruce observado sin pit/repostaje | Graphics fuelXLap L y fuelEstimatedLaps; tracker sin nivel no inventa consumos | Estimated cuando derivado; repostaje +0,05 L invalida vuelta; cambio sesión/coche reinicia |
| Delta best | Telem @696 abs<10000; cero sin best no tapa tracker | Graphics delta ms, signo isDeltaPositive; UDP delta sesión no se usa | Segundos: negativo más rápido; respaldo requiere vuelta completa cubierta |
| Pit limiter | Telem @604, exige reloj y disponibilidad @656 | Physics @248 bool | No turboBoost; ausencia no apagado, TTL de su bloque |
| Pit stopped | SHM mPitState 3, cero requiere bloque presente | Ausente | No equivale a reparación/repostaje cumplidos |
| Aero/body/suspensión | Ausentes; dents ordinal no integridad | Ausentes; carDamage no escala común | No transformar ceros sanitizados en coche intacto |
| Cuatro gomas | mWear restante 0..1 FL/FR/RL/RR | Ausentes, campos no usados por ACC | UI muestra 1−restante; cero LMU solo con bloque temporizado |
| Tipo/fase sesión | Kind SHM/REST; fase ausente | Tipo SHM/UDP; fase UDP, estado SHM estimado | No inferir bandera verde LMU por movimiento/reloj/REST inRealtime |
| Session elapsed/remaining | mCurrentET y mEndET−elapsed >=0 | UDP ms/1000; SessionEndTime ya restante; graphics restante ms/1000 | Segundos; no doble resta en ACC |
| Total/remaining laps | maximumLaps positivo <=10000 !=MAX; remaining derivado | Total ausente: numberOfLaps ambiguo | Sesión por tiempo no fabrica vueltas; remaining Estimated cuando deriva |
| Track name/length | SHM, nombre REST auxiliar; longitud positiva | Static nombre y UDP TrackData longitud | Metros; nombre no fabrica geometría |
| Air/track temperature | SHM Celsius +273,15; par 0/0 ambiguo | Physics Celsius +273,15, respaldo UDP byte+273,15 | Kelvin; no afirmar clima de un bloque caducado |
| Wind speed/direction | SHM módulo m/s; cero sanitizado ambiguo; dirección ausente | Graphics m/s; dirección no convención verificada | No inventar norte/origen con atan2 |
| Rain/wetness | mRaining 0..1; avgPathWetness cero sanitizado ambiguo | UDP byte/10; graphics ordinal lluvia solo 0 exacto | Fracciones; grip no humedad, oscuridad nubes no lluvia |
| Pressure | Ausente | Ausente | Pa; presión de neumático/densidad aire no presión atmosférica |
| Flags | Solo amarillo global REST códigos exactos 2..5 | Graphics flags/scope; eventos UDP no persistentes | Ausencia LMU no verde ni lista vacía fiable; fase/sector/blue LMU pendientes |

Ausencias del contrato visual revisadas: compuesto de neumático en Standings;
equipo/comparaciones de sectores en H2H; deltas por sector, trackPath/turnInsight
en Delta Trace; energía virtual en Fuel Strategy; posición en Pedals Telemetry.
Delta solo admite la referencia personal transportada. Esos ajustes no autorizan
al adaptador a inventar señales ni a reinterpretar campos parecidos. Track Map
usa geometría externa explícita, no una pista reconstruida de poses incompletas.

## Frescura y transiciones

LMU adquisición con fase de 60 Hz; scoring y telemetría independientes:
500 ms sin avance → stale, recuperación sostenida 2 s. Pausa solo con scoring
parado + REST compatible reciente (<500 ms) + proceso vivo; no alterar esta
regla a partir de un fixture. Tipo/pista o reloj retrocedido crean sesión;
floor retira REST anterior. Corpus LMU47 tiene una sola sesión y 47 coches
constantes: **no demuestra práctica→qualy→carrera ni altas/bajas reales**.
REST consulta cada 250 ms y aplica backoff hasta 2 s si falla; la petición IPC
Flags a 33 ms no crea observaciones nativas de banderas a esa frecuencia.

ACC sondeo de 5 ms; páginas physics/graphics 500 ms, UDP 1 s, vector de
velocidad 300 ms. PacketId repetido no refresca; physics cero conserva valor
stale; static confirma versión. Sesión cambia por firma SHM/UDP o reloj
retrocedido. EntryList elimina coches; cambio piloto/lista/conexión corta
historial de velocidad. Corpus tiene una sola sesión, jugador detenido en
boxes, parrilla que se hidrata hasta 32 coches y tres frames rasgados
descartados: **no demuestra conducción del jugador ni reconexión real**.

Conformidad obligatoria contrasta crudos y DTOs; vectores existentes cubren
umbrales, ausencias, cambios de sesión, pit, vuelta 0/1, coches que salen/vuelven,
replay determinista y reconexión IPC. No presentar esos vectores como capturas.
Los goldens completos conservan el comportamiento temporal; igualdad frente
a base no demuestra por sí sola que cada dato nativo sea correcto.

| Escenario revisado | LMU: evidencia y límite | ACC: evidencia y límite |
| --- | --- | --- |
| Práctica→clasificación→carrera | `track_session`: firma pista/tipo y retroceso; floor REST. Todos los fixtures reales son práctica o menú; transición deportiva pendiente | `reset_session`, firmas SHM/UDP y rewind; test `rewind_index_and_track_change_start_new_sessions_without_old_entries`. Corpus real solo práctica; transición deportiva pendiente |
| Pit/garage/outlap | Cuatro capturas 1.4 reales distintas; `lmu_1_4_captures_do_not_invent_session_phase_or_clear_flags`; pit bool real. No constituyen una secuencia temporal continua congelada | Corpus real jugador en pit, 31 rivales en pista; `fresh_udp_player_survives_stale_graphics_and_invalid_shm_fields` y `native_fuel_liters_and_estimated_range_use_graphics_clock_only` son vectores. Pit-stop servicio ausente |
| Silencio/disconexión | Golden a 500 ms de captura real y tests `Core`/IPC; degradación inmediata al error Disconnected. Cierre físico LMU no ejecutado | Relojes independientes y corpus/tres rasgados; `udp_does_not_rejuvenate_shm_and_packet_repeats_stay_stale` es vector; desconexión real pendiente |
| Pausa/reanudación | Tests de gate y pausa REST/proceso de #1455; no mezcla de reloj telem con scoring. Captura cruda de pausa con REST/telemetría independiente pendiente | Physics cero/status 3, corte de velocidades; `off_and_zero_physics_degrade_honestly` vector; replay pausado real pendiente |
| Replay/tiempos | Corpus 3839 eventos ordenados; `replaying_the_same_events_twice_gives_identical_observations`; origen Replay y fuente frozen | `replay_clock_is_deterministic_and_no_event_arrives_early`: 80000 eventos a dos ritmos idénticos; replay dentro del juego no acreditado |
| Multiclase | Fixture de 44 coches con clases reales y oráculo Go de 12 fixtures + 60 cortes; LMU47 anonimiza nombres/classes. Cambios de puesto/doblajes físicos pendientes | Corpus real Pro/ProAm/etc y puestos por cup consecutivos; cupCategory no acredita categorías GT2/GT3/GT4 diferentes |
| Entradas/salidas/relevo | Gracia 30 frames/continuidad/DriverId/floor revisados; `a_slot_keeps_its_car_through_a_short_blink_and_a_driver_swap_but_not_a_long_absence` es vector sobre fixture. Corpus no tiene altas/bajas reales | EntryList elimina indices y acota 104; `driver_swap_keeps_car_and_driver_ids_follow_names` vector. Corpus sí hidrata 1→32, no relevo/baja física |
| Vueltas 0/1/cruce | Contador completado + tiempos sentinel; delta/fuel invalidan saltos/no miden primera parcial; fuente de lap_elapsed revisada. Primer cruce real jugador pendiente | `lap_line_window_freezes_lap_count_best_and_last_for_udp_and_player` vector; corpus rivales sí cruzan meta, jugador no |
| Banderas | 239 sessionInfo raw: yellowFlagState invalid; phase/sector/vehicle flags cero sanitizado no green. Positivas pendientes | Verde global positivo real; rojo/amarillo/azul/scope/sentinel cubiertos por vectores. Capturas positivas del resto pendientes |
| Demanda/reconexión/frontera | IPC hidrata primera entrega, compara epoch/session/source/jugador/conjunto de coches; tests de reconnect y layout, cuatro regímenes UI reales | Mismo transporte neutral, mismas reglas; corpus ACC valida ID distinto de slot y foto de 32 coches. No confundir replay IPC con reconexión al juego |

Los nombres de tests de esta tabla señalan evidencia verificable, no una
certificación física de escenarios que el corpus no contiene. Las capturas
1.4 de pit/outlap se conservan sin ordenar arbitrariamente como carrera grabada.

## Fallos corregidos y límites

H2H consumía `relative_s` en `domain/head_to_head.rs::row`, pero pedía Gaps,
ClassGaps, LapTimes y Sectors, **ninguna de las cuales transporta Relative**.
`SnapshotDto::restore` retiraba el dato y el núcleo tampoco activaba su
derivación si H2H era el único consumidor. La escena H2H anterior usaba al
líder mirando delante (SIN RIVAL), por eso el test por defecto no lo detectaba.

La regresión nueva entrega por un pipe real la foto LMU47 sin editarla y exige
conservar `relative_laps` (presente) y `relative_s` (ausente en ese corte), más
demanda explícita de Relative. QA existente comprueba el texto firmado; falta
captura con gap positivo para certificación semántica física. Los 18 widgets
se contrastan con demanda sobre fotos congeladas LMU/ACC. No cambia el DTO,
admisión, bucle, render, dependencia ni golden.

Relative tenía dos pérdidas dentro de la misma demanda del pie: `track`
solicitaba TrackName aunque `footer_slots` pinta temperatura; además, con
slots personalizados se retiraban reloj/clima que el painter común sí usa
cuando la fuente está stale. La regresión recorre `track`, `ambient` y `time`
sobre ACC fresco y LMU stale (seis casos), por pipe solicitado y sin modificar
la foto. Antes del arreglo ACC `40°` y LMU `23°` pasaban a `—`; el pie stale
perdía `58:12`, `16°` y `23°` según el slot. Log `relative-red.log`.
Ahora se conservan SessionClock 250 ms y Weather 500 ms para ese pie y se
reutiliza el mapeo común de slots: los climáticos, incluido track, solicitan
Weather a 250 ms. No hay nuevo estado ni cambio de renderer. El
gate completo confirma la conservación de los seis casos: GREEN UI 172/172
y Nextest workspace 1158/1158 PASS, sin modificar los goldens.

No se ejecuta `measure-cost.ps1`: exige LMU live en primer plano y una campaña
autorizada, que el brief excluye. No se inventa un banco offline equivalente ni
se certifica CPU/RAM. Revisión por Isaac: H2H solo, delante y detrás, completar
mejor vuelta y comprobar gap; después alternar junto a Relative. Repetir pausa,
pit, desconexión y práctica→qualy→carrera; añadir capturas reales faltantes antes
de declarar todos los campos validados.

## Hallazgos siguientes y fuera de alcance

Standings con footerSlots: el contraste experimental solo difiere en `Vm.track`
(nombre de circuito oculto); renderer utiliza footer_cells en esa configuración.
Datos visibles conservados, pero ingest solicita repaint. Hallazgo documentado
como [#1475](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1475),
fuera de la capa de datos. Se retiró ese escenario del test de igualdad de VM
completa y se mantienen las columnas completas/multiclase con su pie por defecto.
No se amplía la demanda ni se modifica el renderer para esconderlo.

## Gates y estado

Primer hito H2H (`76518fe1ee31`): fmt workspace y módulo tocado, check y Clippy PASS; Nextest
1157/1157 PASS, seis skips previos; lifecycle 5 tests Engineer por IPC + 12
escenarios launcher/runtime PASS. Logs `h2h-*.log` en la carpeta de evidencia. Los cinco ignored
previos son tres live y dos benchmarks; Nextest excluye además lifecycle para
ejecutarlo aparte. No se activan juegos ni se debilitan tests.
La captura debug con referencia vigente difería en 1/292160 px (delta 1);
con el procedimiento indicado y perfil `prueba`, Standings da **0/292160 px**,
Threshold 0 / MaxPercent 0 / delta máximo 0. Referencia, captura y diff
inspeccionados; estructura, textos y detalle coinciden. Log
`standings-final.log`. Tras el arreglo Relative se repitió sobre el binario
final: **0/292160 px**, delta 0; hash del artefacto/copia capturada iguales,
referencia/captura/diff inspeccionados de nuevo.
Segundo hito Relative: fmt workspace + módulos macro-incluidos, check y
Clippy `-D warnings` PASS; Nextest 1158/1158 PASS (seis skips previos,
761,462 s; golden ACC 599,523 s), lifecycle 5 Engineer IPC + 12
launcher/runtime PASS. No retries ni fallos en esta ejecución final.

Resultados exactos, SHAs y omisiones se registran en
`C:/tmp/beta/r4/informe-1474-telemetria.md`; logs en `C:/tmp/1474-evidence/`.
Entrega local lista para revisión del orquestador: fmt/check/Clippy/Nextest
con goldens/lifecycle y Standings 0 px PASS. No equivale a validación física,
aceptación, integración ni promoción.
`docs/roadmap/plan.md` no existe en la base asignada; no se crea un roadmap
paralelo ni se modifica publicación remota. Sin push, PR, merge ni release.
