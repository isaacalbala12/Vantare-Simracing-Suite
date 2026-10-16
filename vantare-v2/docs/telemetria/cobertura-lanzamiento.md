# Cobertura de telemetría para el lanzamiento — VANTA-33 / #1638

Auditoría inicial: 14-oct-2026, base `nightly@79a1ace66e5ec397126495dc5ce99353db9beed9`.

## Evidencia vigente: pulido posterior a #1664 — 16-oct

[M-1…M-6 y regresión lifecycle](pulido-1638-2026-10-16.md),
[pasada completa actualizada por widget](imola-practica-pulido-2026-10-16.md).
Código `8d53d2cf1`, PR draft #1679 desde `nightly@bcaa0e3f2`.
Mismo archivo Imola, dos avances cercanos tras caducar: **287.495 fotos por
cada widget, cero rechazos; 196.376 Live y 91.119 Stale (31,6941 %)**.
37 rivales con movimiento fiable; jugador parado, cero vueltas/inputs.
Fastest-lap sin aviso nuevo; mapa sin geometría acreditada. Inicio/fin reales,
qualy/carrera, formación/salida y próxima sesión no cubiertos por esta captura.
CI del código: Windows Nextest 1870/1870 y Engineer lifecycle 5/5 PASS;
gates locales 935/935 y cinco tandas lifecycle 25/25. VANTA-33 sigue En curso.
Los números siguientes conservan las ejecuciones históricas; no son el resultado actual.

## Histórico: práctica de Imola recibida — 16-oct

**Kit A/B listo para VANTA-118:** [13 minutos y procedimiento del worker](ab-lmu-2026-10-16.md).
Control solo SHM + A/B/A/B con dos GET productivos; B añade únicamente race/car.
Grabación del jugador rodando, QPC/PresentMon y verificación offline por condición.
Kit compilado en `C:/VantareServer/share/kit-ab-lmu/kit-ab-lmu.zip`; ejecución física pendiente.

**Investigación prioritaria de frescura:** [causa y corrección](imola-frescura-2026-10-16.md).
El 99,9833 % original combinaba huecos SHM reales con recuperación bloqueada.
Corregida la espera de 2 s, el mismo Replay/Core completo da **25,4488 % Stale**;
se mantiene el límite de 500 ms. Los 2.233 huecos del jugador se solapan uno a
uno con GET `/rest/race/car` del inventario del grabador, ajeno al adapter normal.
Pendiente A/B para certificar continuidad en vivo; no es una nueva QA de los 18 widgets.

Recibidos 77 min 18 s de práctica Imola/IA, LMU 1.4.2.0, 38 coches totales.
Jugador Alpine #35 fuera del garaje pero parado, sin vueltas/inputs. La
verificación íntegra offline terminó: **287.495 fotos por cada widget, 0 rechazos**.
**287.447 fotos Stale (99,9833 %)**: no acredita funcionamiento continuo,
conducción ni carrera. 26 rivales con movimiento fiable; jugador con ruido
~1,8e-7 m/s, cero vueltas e inputs. Calma/seco REST se verifican en 45 fotos fiables.
[Informe vigente por widget, cambios y pendientes](imola-practica-2026-10-16.md).
Sincronizado `nightly@354c207aa` en la rama de issue (`6db5879f5`); conflicto
README resuelto con DTO v11 / Services v10 / derechos v5. Clippy y fmt PASS;
Nextest CI workspace runtime/domain/ipc + corpus: **673/673 PASS**, 5 skips.
**No se abrirá LMU en el servidor**. Supervisor 16280 cancelado y salida `cancelled` verificada.
[Kit release y verificación offline](grabacion-completa-lmu.md): SHM completo,
REST descubierto desde la UI instalada, gzip/XOR con hashes y cierre verificado,
replay por adapter/Core/DTO y proyecciones de los 18 widgets, más calidades de
los siete campos de Avisos. El catálogo declara rutas no resueltas/excluidas y
no acredita endpoints ocultos. Los datos crudos privados no se versionan.
La entrega recibida es **solo práctica**, 6 h configuradas, destino
`C:/VantareServer/evidence/grabacion-lmu-imola/`. El informe se
ejecuta con `--recording-scope practice-only`: separa recepción/datos realmente
observados de inicio/fin de sesión, clasificación, carrera, formación y salida,
que **no quedan cubiertos**. Parar la grabación no acredita terminar la sesión.

Encargo: [#1638](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1638).
La optimización #1630 quedaba fuera del encargo inicial; el buzón del orquestador
la incorpora después como fase 4 (véase abajo). Seguimiento histórico del relevo por
`C:/tmp/buzon/1638.md`, entonces sin Plane/Notion, PR ni merge. El encargo
del 15-oct en el servidor reemplaza esas excepciones, según la sección siguiente.

## Revisión de gates — 15-oct, R2

Código corregido `aa14ffa89`, PR draft #1664: Clippy workspace con todos los
targets y `-D warnings` **PASS**; Nextest runtime/domain/ipc con `--workspace`
**640/640 PASS**, 5 skips; fmt y diff **PASS**. Gates en serie por la cola con
`VANTARE_CARGO_MIN_GB=0`, autorizado por el orquestador tras la primera entrega.
Logs finales en `C:/VantareServer/logs/1638-r2-clippy-4.log` y
`1638-r2-nextest-2.log`; no se repiten UI/lifecycle/telemetría larga en este
encargo acotado. Servicios pasa sus cuatro tests de proceso al incluir su
binario mediante workspace.

El test de distancia exigía un dato imposible en `lmu-1.4-outlap-fixture.bin`:
longitud original **0 m** y distancia de vuelta **159,606201171875 m**.
Se mantiene la ausencia productiva correcta y se fijan resultados esperados
por fixture: **3586,8802490234375 m** en el caso con longitud válida, ausencia
sin longitud o en boxes. Las capturas originales no cambian. Los campos sin
fuente acreditada y la fase B siguen pendientes; estos gates no son QA LMU.

## Histórico de continuación — 15-oct, servidor

El encargo actual autoriza Plane y PR draft a nightly, sin merge ni A/B.
Worktree `C:/VantareServer/wt/isa-1638`, target `C:/VantareServer/targets/isa-1638`,
buzón `C:/tmp/buzon/telemetria-1638.md`. El merge local de nightly se hizo sin
conflictos. Los estados y gates del relevo de abajo son históricos, no los
resultados del diff actual.

Nuevo contrato de [Avisos de sesión](session-alerts-contract.md) (DTO v11): fin
programado válido y metros longitudinales a salida/meta fuera de pits; fase,
inicio/fin reales y próxima sesión siguen sin productor admitido. Se corrige
la identidad de dos sesiones consecutivas del mismo tipo para invalidar REST.
Los campos sin evidencia siguen ausentes; contrato preparado no significa
señal física entregada. Las regresiones nuevas aún esperan gates por RAM.

Clasificación de los pendientes de la tabla: presentación/selección/centrado,
frases de radar, opciones y formato pertenecen al porte #1629; geometría de
pista exige un pack verificado; daño exacto, forecast, ABS/TC/FFB y sanciones
tipadas carecen de fuente positiva en las capturas. No hay un dato demostrado
oculto que permita cerrar esas filas solo cambiando el adapter. La fase B debe
aportar transiciones y evidencia nueva; no se marca toda la cobertura completa.

Fmt e integridad/anti-slop 456/456 PASS. Compilación Rust espera cola (1–2 GB libres, mínimo 5).
El smoke de los 18 widgets se ha adaptado para `--target-dir` explícito; no se
ha ejecutado con juego en esta continuación ni se han abierto ventanas.
PR draft [#1664](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1664),
Plane En curso. Check local cancelado mientras esperaba RAM, sin compilador;
Clippy/Nextest/lifecycle/telemetría sin ejecutar. Fase A incompleta.

## Qué significa la tabla

**OK**: el adapter y el contrato neutral entregan la señal; no certifica pantalla
física ni todas las situaciones del juego. **Parcial**: una parte existe o depende
de historia, geometría o evidencia que aún falta. **Falta**: no hay señal productiva
o no hay equivalencia demostrada. Nunca convertir ausencia en cero/verde/intacto.
Los 17 HTML de `C:/tmp/design-system/widgets/` corresponden a 18 entradas del
catálogo: el diseño de daños une `car-damage-visual` y `car-damage-numbers`.

Fuentes: `native/runtime/src/adapter/lmu/{frame,translate,rest,live}.rs`,
`native/runtime/src/core/{derive,merge}.rs`, `native/domain/src/*.rs`,
`native/ipc/src/{dto,demand}.rs`, `native/ui/src/{registry,demand}.rs`.
Services no adquiere telemetría: Hub/overlays reciben el DTO del mismo Core.
Las proyecciones actuales no implementan todos los nuevos diseños #1629.

## Fuente, unidades, frecuencia y calidad

- **S**: SHM `LMU_Data`, layout verificado 1.3.0.0/1.4.0.0/1.4.1.3/1.4.2.0.
  Lectura máxima 60 Hz (`live::READ_INTERVAL`); scoring y telemetría tienen
  relojes propios. Lectura no equivale a frecuencia de actualización del juego.
  Frescura 500 ms. Valores medidos `Reliable`, congelados `Stale`, ausencia
  `Unavailable`; filas inválidas rechazan el frame completo.
- **R**: GET local `/rest/watch/standings` y `/rest/watch/sessionInfo`.
  Sondeos secuenciales + espera de 250 ms: máximo inferior a 4 Hz por endpoint;
  depende de latencia, backoff hasta 2 s, deadline 750 ms por GET. TTL 2 s desde
  inicio de petición y barrera de sesión. No crea coches ni sustituye SHM.
- **D**: derivación central sobre S/R; `Estimated` para predicciones. Exige
  referencias e historia válidas: la primera vuelta, boxes y huecos pueden
  impedir delta/consumo/relative. Cadencia de publicación según `Demand` y
  preferencias del widget; no se aumenta adquisición por subir el look.
- **G**: geometría de pista local/pack, además de S. No es una señal REST.

Publicación por `ui/src/performance.rs`: tablas 30/20/15/10/5 Hz según nivel
Máximo/Alto/Equilibrado/Ahorro/Mínimo; instrumentos sin tope/60/40/30/20 Hz.
Flags se actualiza sin tope de host, por cambios. Esto limita publicación/pintado,
no demuestra esos Hz medidos en LMU ni modifica su adquisición.

## Widget × dato — estado en la base auditada

| Widget | Dato requerido por diseño | Campo/fuente/unidad | Estado inicial y calidad/límite |
| --- | --- | --- | --- |
| standings (gratis) | Piloto, clase, posición global/clase, vueltas | `Car.driver/class/position/class_position/laps`, S+D, ordinal/conteo | OK; clase derivada, posiciones frescas |
| standings | Dorsal, modelo del coche | `number`, R; `vehicle`, S, texto | Parcial; dorsal casado por slot+etiqueta, modelo leído pero no publicado |
| standings | Mejor/última vuelta, tres sectores, gap/intervalo clase | `best_lap_s/last_lap_s/*sectors_s/gap_class_*`, S+D, s/vueltas | OK; S3 mejor es el de mejor vuelta, no récord independiente |
| standings | Compuesto, paradas, posiciones ganadas | `tyre_compound/pit_stops/grid_position`, S/R | Falta en LMU; campos neutrales ya existen |
| standings | Lanzada, BOX/SAL, garaje ajeno, FCY, última vuelta | `in_pits`, S; flags/state/estado por coche | Parcial; pits sí, sesión/flags/estado de cada rival incompletos |
| relative (gratis) | Vecinos en pista, jugador, clase/dorsal/gap y vueltas | `relative_s/relative_laps`, S+D, s/vueltas | OK condicionado; sin ritmo/progreso o en boxes puede no haber gap |
| relative | Modelo, tendencia, DR/SR | `vehicle/relative_trend_s_per_lap/driver_rating/safety_rating` | Parcial; tendencia D, modelo omitido, ratings sin fuente admitida |
| relative | Lanzada/delta rival, entrada/salida boxes y pérdida | estado/delta por rival, `pit_loss_s` | Falta; `in_pits` no distingue todas esas fases |
| delta (gratis) | Delta personal, vuelta estimada, sectores y progreso | `delta_best_s/estimated_lap_s/*sectors_s/lap_*`, S+D, s/m | OK condicionado a referencia; negativos = gana |
| delta | Óptima/pole según sesión, invalidada, boxes | `delta_optimal_s/delta_leader_s/lap_invalid/in_pits`, S+D | Parcial; exige sectores/ritmo, invalidación solo con bloque temporizado |
| pedals (gratis) | Gas/freno/embrague, pico de frenada, limitador | `telemetry.{throttle,brake,clutch}`, S, 0–1; `pit_limiter_active`, S | OK en datos; pico es historia de presentación |
| pedals | ABS/TC actuando, FFB y CLIP | sin campo neutral | Falta; no inferir ABS/TC del pedal ni FFB de steering |
| multiclass-relative | Vecinos de todas clases, jugador siempre centrado | clases/posición/`relative_s`, S+D | Parcial; VM selecciona por clasificación y desplaza ventana en extremos |
| multiclass-relative | Alcance «en 2 curvas», tendencia y FCY | velocidad S; tendencia D; flags | Parcial; velocidad disponible, falta proyección/semántica de curvas |
| delta-trace | Traza completa y anterior por distancia, delta/sectores | `delta_best_s/lap_distance_m/track_length_m`, S+D | OK condicionado; historial local del widget, no serie REST duplicada |
| delta-trace | Óptima/pole e invalidación | mismas señales de delta | Parcial; la proyección actual usa referencia personal |
| radar | Poses propias/rivales, orientación, solape | `pose`, S, m/rad; `velocity_mps`, S, m/s | OK; VM calcula lados y distancias; no usa posiciones de tabla |
| radar | Frases izquierda/derecha/tres, cierre km/h, clases | solape VM, velocidad relativa S+D, `class` | Parcial; señales existen, VM actual no expone frase ni cierre/clase |
| input-telemetry | Trazas gas/freno 6 s, marcha/RPM | `telemetry.*`, S, 0–1/marcha/rad/s | OK; historia temporal por source_time; no es tasa de muestras garantizada |
| input-telemetry | ABS, bloqueo, luces calibradas del coche | ABS/ruedas/max RPM | Falta; RPM existe, régimen de cambio/ABS no admitidos |
| pedals-telemetry | Pedales, marcha, velocidad, steering | `telemetry.*`, S, 0–1/m/s/−1..1 | OK; steering normalizado, no grados físicos |
| pedals-telemetry | Grados, ABS, limitador | ángulo/rango volante; `pit_limiter_active` | Parcial; limitador existe en DTO, grados físicos y ABS faltan |
| track-map | Coches/posición/clase, trazado/sectores/meta/pit lane | `pose/position/class/track_name`, S+G | Parcial; coches sí; pack válido necesario, no inventar trazado |
| track-map | Amarilla por sector, lanzada, salida boxes predicha | flags S/R; estado rival; `pit_loss_s`, D | Falta en LMU actual; geometría no sustituye pérdida de boxes |
| track-weather (tiempo en pista) | Pista/aire, viento, lluvia, agua | `session.weather.*`, S, K/m/s/0–1 | Parcial; temperaturas, viento escalar y lluvia sí; humedad cero ambigua en legacy; no profundidad mm |
| track-weather | Dirección del viento y presión | `wind_direction_rad/pressure_pa` | Falta; vector de pista no da norte meteorológico; presión de neumático no es atmosférica |
| track-weather | Forecast 15 min, probabilidad, secado/recomendación | sin campo neutral/fuente verificada | Falta; no extrapolar lluvia actual como forecast oficial |
| track-weather | Vertical 132×440 con mismos datos | mismas señales de weather | OK en telemetría; formato vertical corresponde a UI #1629 |
| racing-flags | Amarilla global/local/doble, FCY/SC, verde/roja/cuadros | `State.flags`, R/S, enumeración/ámbito | Parcial; solo amarillo global numérico REST, equivalencia sin captura positiva |
| racing-flags | Azul/blanca/negra, naranja, resultado, límite FCY | flags por coche; estado/resultado/speed | Falta salvo velocidad; negra significa descalificación, no sanción DT |
| racing-flags | Drive-through/stop&go, segundos/vueltas, avisos límites | `pending_penalties`, S, conteo | Parcial; contador sí, tipo/plazo/avisos faltan; separados de banderas |
| fastest-lap | Récord global/clase/personal, piloto/coche, tiempo/mejora | `best_lap_s/driver/class/vehicle/*sectors_s`, S+D, s | Parcial; tiempos y cambios sí, modelo omitido; aviso requiere cambio de récord |
| head-to-head | Rival, último/mejor, gap, tendencia, sectores | mismas señales de posiciones/relative/laps | OK condicionado; tendencia estimada, sin rival no hay duelo |
| head-to-head | Alcance y comparación contra pole | ritmo/gap D | Parcial; no convertir predicción en medición |
| broadcast-tower | Fichas por clase/posición/código/gap, batalla | `cars/class/driver/position/gap_class_*`, S+D | OK; batalla por gap vigente, sin escritura al juego |
| broadcast-tower | Lanzada, FCY y última vuelta | estado/flags | Parcial; fuente de fase de sesión no admitida |
| car-damage-visual | Integridad aero/carrocería/suspensión por zona | `damage.{aero,body,suspension}` | Falta; dents ordinales no equivalen a porcentajes/componentes |
| car-damage-visual | Pinchazo/alerón perdido, impacto/dirección, reparar s | señales crudas sin contrato neutral | Falta; no fabricar 100 % intacto ni tiempo de reparación |
| car-damage-numbers | Goma restante en cuatro ruedas | `damage.tyre_wear[FL,FR,RL,RR]`, S, 0–1 | OK; cero requiere reloj telem, resto ausente queda guion |
| car-damage-numbers | Integridad exacta por zona/rueda, reparación | daño estructural/rueda/suspensión por zona | Falta; el diseño aprobado la une con vista coche |
| fuel-strategy | Litros/capacidad/media/últimas 10/vueltas restantes | `fuel.*`, S+D, L/L por vuelta/vueltas | OK condicionado a vueltas limpias; no inventar consumo al arrancar |
| fuel-strategy | Stint y parada recomendada/carga mínima | `stint.*`, D, s/vueltas; proyección fuel | Parcial; recomendación exige duración/ritmo y preferencias |
| fuel-strategy | Energía virtual Hypercar | `fuel.energy/energy_per_lap`, sin productor LMU | Falta; REST vivo tiene `veFraction`, falta admitir con calidad/identidad |
| fuel-strategy | Repostaje/progreso/segundos, efecto FCY | `pit_service.*`, sin productor; flags | Falta; no confundir velocidad cero con servicio |

## ACC: qué promete y qué cubre

El binario admite `--simulator acc` (SHM physics/graphics/static y Broadcasting
UDP v4), el catálogo de pilotos ofrece ACC y el contrato de producto lo incluye
entre simuladores objetivo. Eso no certifica paridad de los 18 diseños.
`adapter/acc/translate.rs` entrega pedales/steering/marcha/velocidad/RPM/fuel,
sesión/relojes/vueltas, coches UDP/posición/clase/gaps/poses, flags graphics y
clima disponible. Velocidad planar estimada tras historia consistente, no vector
nativo; TTL SHM 500 ms, UDP 1 s. Sin Broadcasting solo hay cobertura parcial de
parrilla/radar/relative. `acc/REVIEW.md`, corpus/goldens/conformidad protegen esto.
No entrega daños LMU por zonas, energía virtual LMU, forecast ni tipos/plazos de
sanción completos. No se ha ejecutado ACC físico en esta entrega.

## Evidencia inicial y orden de trabajo

Corpus existentes: `testdata/lmu*.bin`, `testdata/rust-port/lmu47-high-rate-60s.tar.gz`,
`native/runtime/testdata/oracle/`, goldens y `ui/fixtures/telemetry-real/`.
LMU47 está en boxes; no demuestra tráfico en pista/daño/sanción positiva.
Los corpus REST 30-sep son menú/carga fallida, no validación en pista.

Sondeo solo GET del 14-oct: LMU responde PRACTICE1, 37 coches, sectorFlag
`[YELLOW,YELLOW,YELLOW]`, yellowFlagState `NONE`, gamePhase 9. Standings contiene
flag/finishStatus/veFraction/pitstops. Esto demuestra forma real de respuesta,
no movimiento ni equivalencia de todos los códigos. Se sanitizarán antes de tests.

Prioridad: flags que dejan el widget vacío; señales ya leídas pero no publicadas;
energía virtual y datos de tablas; proyecciones radar/multiclase que pueden usar
las señales existentes. Daños exactos, forecast, ABS/TC/FFB y sanciones tipadas
necesitan fuente/equivalencia probada o decisión de producto. Se informa DUDA y
se continúa con los datos demostrables. No hay dependencia nueva autorizada.

## Datos completados en esta rama

- Flags: tres sectores por los códigos REST textuales explícitos, conservando
  su ámbito; bandera personal casada por slot **y etiqueta**. No se deriva verde
  global de `NONE`, de una lista vacía ni de `GREEN` de un coche. La proyección
  muestra amarilla local y la negra del jugador dice «DESCALIFICADO». El contador
  de sanciones sigue separado: no produce banderas DT/SG ni tipos inventados.
  La demanda del widget incluye Penalties para recibir la identidad del jugador;
  sin ella, un layout con solo flags perdía la bandera personal en el pipe
  selectivo. Regresión sobre LMU47 y pipe real: guion → DESCALIFICADO con bandera
  positiva controlada. No se modifica el protocolo ni la regla IPC de selección.
- `Car.vehicle`: etiqueta SHM que se leía pero se omitía del DTO. `pit_stops`:
  contador REST entero 0–10000; ausencia/campo roto no es cero. Un dorsal inválido
  no impide publicar las otras señales de una fila inequívoca.
- `fuel.energy`: `veFraction` 0–1 del jugador Hypercar, con la frescura REST y
  SHM y barrera de sesión; no son litros. `energy_per_lap`: media **estimada** de
  vueltas completas sin boxes/recharge/huecos, reutilizando la ventana existente
  con estado independiente. Las pruebas de consumo positivo son controladas;
  la captura real detenida solo acredita el nivel, no consumo por vuelta.
- Sin campo DTO nuevo ni cambio de VERSION: todos esos campos y FlagScope ya
  estaban en v10. Sin nueva dependencia, segundo lector productivo ni cambios
  en instalación/datos, Services, Hub, cadencias o worktree #1630.

Captura nueva: `native/runtime/testdata/lmu-rest-2026-10-14/`, allowlist, hashes y
limitaciones en su README. Cuatro regresiones adapter → DTO live, caducidad,
slot reutilizado/nueva sesión y etiquetas contra seis fixtures SHM existentes.
Se verifica además cada una de las 3839 fotos LMU47 para modelos y paradas.
Los goldens congelados no se reescriben: su vista histórica excluye únicamente
esos dos campos LMU recién publicados, comprobados por separado contra el corpus.
El resto conserva la comparación exacta y la tolerancia previa exclusiva de yaw.

## Tabla final para el orquestador

«Esenciales» es la cobertura de datos actual; no confirma que el renderer actual
reproduzca el HTML aprobado. Las opciones nuevas de presentación de #1629 no se
portan en esta tarea de adquisición. La comprobación de entrega admite una sesión
parada, pausada o en garaje. Las transiciones positivas de cada señal siguen
necesitando su escenario propio; el movimiento no es precondición del A/B.

| Entrada del catálogo | Datos esenciales tras el cambio | Qué falta para todo el diseño |
| --- | --- | --- |
| standings | OK condicionado; añade modelo/paradas | Compuesto/grid, estado rival por vuelta/garaje, FCY/fin verificados |
| relative | OK condicionado; añade modelo | DR/SR, delta rival, estado de lanzamiento/boxes y pérdida |
| delta | OK condicionado a referencia | QA óptima/pole/invalidación en conducción; formato HTML |
| pedals | OK | ABS/TC/FFB y clipping; pico/avisos en presentación |
| multiclass-relative | OK condicionado, mismas clases/gaps | Selección en pista y centrado del renderer; alcance en curvas |
| delta-trace | OK condicionado | Selector óptima/pole y estados del diseño en presentación |
| radar | OK: poses, velocidades nativas, clases | Frases/cierre/luz por clase en ViewModel/presentación; no falta otro lector |
| input-telemetry | OK: entradas y reloj propio | ABS/bloqueo/régimen de cambio calibrado |
| pedals-telemetry | OK: pedales/steering normalizado/marcha/velocidad | Ángulo físico, ABS y presentación del limitador |
| track-map | Parcial: coches/identidad/posición/sectores amarillos | Pack de pista, lanzada y predicción de salida de boxes |
| track-weather | Parcial: condiciones actuales | Forecast 15 min, recomendación, dirección/agua cero verificadas; vertical en UI |
| racing-flags | Parcial: locales/personales y contador separado | FCY/SC/final/verde y códigos no capturados; DT/SG/tipo/plazo/avisos/naranja |
| fastest-lap | OK condicionado a vuelta medida | QA de evento efímero, récord/clase y resultado de sesión |
| head-to-head | OK condicionado a rival/gap/ritmo | QA alcance estimado, sectores y referencia pole |
| broadcast-tower | OK condicionado a parrilla/ritmo | Lanzada, FCY y fin de sesión verificados |
| car-damage-visual | Falta daño estructural medible | Fuente/contrato para zonas, impacto, desprendimiento, reparación; no convertir dents a % |
| car-damage-numbers | Parcial: cuatro gomas restantes | Integridades exactas por zona/rueda y reparación |
| fuel-strategy | OK condicionado; añade energía y media estimada | Servicio/refuel/segundos restantes y efecto FCY; QA de consumo en marcha |

Las integridades 0–1 de daños no representan los ocho dents ordinales de LMU.
La decisión pendiente es cómo mostrar esos ordinales/desprendimientos con su
fuente real, o aportar una fuente que sí mida integridad: no se pueden prometer
porcentajes exactos ni reparación en segundos con la evidencia disponible.
El endpoint archivado `/rest/sessions/weather` expone presets START/25/50/75/FINISH;
no acredita forecast actual de servidor cada 15 min. No se sustituye por una
predicción inventada. ABS/TC actuando, FFB, sanciones tipadas y plazos siguen DUDA.

El orquestador asigna a #1629 el contrato de domain
`PenaltyKind { DriveThrough, StopGo, Disqualified }`. No existe en esta base;
#1638 lo consumirá cuando esté disponible y haya una fuente LMU positiva.
No se redefine ese tipo ni se transforma el contador de pendientes en DT/SG.

## LMU físico y gates

Prueba opt-in solo lectura, `launch_coverage::live_lmu_launch_probe`:
Core productivo + adapter LMU, 3 s, **Paused, 37 coches, jugador, 0 avances**.
La primera aserción de conducción falló explícitamente, sin ocultarlo. El buzón
del orquestador corrige el requisito: basta una sesión incluso parado/garaje,
sin IA ni movimiento. La prueba admite Live/Paused con parrilla y jugador y
continúa informando avances por separado. Una sesión pausada no acredita QA
conduciendo. Logs `C:/tmp/1638-lmu-live*.log`. No hubo ventanas, escritura al juego ni acciones
en la instalación. Repetir con una sesión cargada, incluso pausada/parada:

```powershell
$env:CARGO_BUILD_JOBS='2'
$env:CARGO_TARGET_DIR='C:/tmp/target-1638'
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo test --manifest-path native/Cargo.toml -p vantare-runtime --test launch_coverage live_lmu_launch_probe --locked --offline -j 2 -- --ignored --nocapture
```

La prueba no imprime nombres ni cuerpos y no guarda datos reales. Una fuente
live válida aún necesita QA de los 18 widgets/variantes y escenarios positivos
de flags/daño/sanciones. ACC físico no ejecutado. Estado global del lanzamiento:
**parcial, no listo para aceptación** mientras esos límites permanezcan.

Hito de señales `7ae70eeb`: build/fmt/Clippy PASS, Nextest 630/630 (5 skips),
lifecycle 13/13, telemetría 30/30 (1 opt-in físico omitido y ejecutado aparte),
ACC completo 999,416 s. Integridad/anti-slop 456/456; hashes de captura 3/3
verificados contra disco **y contenido Git**, con textos LF. Demanda de flags:
RED «—», GREEN «DESCALIFICADO» por pipe; UI 321/321 (4 skips), Clippy/Release PASS.
QA no acredita toda la apariencia HTML. SHAs posteriores y medidas se registran
en el handoff vivo y buzón #1638.
Logs locales `C:/tmp/1638-*.log`, jobs 2 y target aislado. Los cuatro fallos de
proceso Services en la primera pasada de `--lib` se deben al auxiliar aún sin
compilar; se conservan en `1638-lib.log`. Services se compiló con `network`
antes de la repetición. Hub/storage no modificados: no se afirma build/QA Hub,
ni se necesitan sus gates DuckDB para los tres crates seleccionados.

## Fase 4 incorporada por el orquestador

El buzón `C:/tmp/buzon/1638.md` pide unir #1630/VANTA-20 a esta entrega y
reutilizar su arnés. Su segunda corrección elimina IA, velocidad y fuera de
garaje como precondiciones. Se conserva la evidencia: LMU cargado, 37 coches,
relojes detenidos/Paused. No se llamará conducción viva a esta medida.

Arnés QA copiado a `native/ui/examples/telemetry_live.rs`; scripts/resultados
aislados en `C:/tmp/1638-perf`. No se modifica el worktree #1630 ni sus archivos.
Usa feed/demanda/layout/pintores productivos, sin sesión/derechos UI reales,
sin Hub, Engineer, recording ni datos de Isaac. Workload original fijo:
Standings+Pedals. Por ello sus medidas no representan los 18 widgets ni una
sesión autenticada. `paint-stats` igual en ambos extremos; profiling separado.

Se mantienen el lock atómico `pc-medicion.lock`, pantalla libre, ausencia de
compilación y de otros Vantare, 60 s de calentamiento y 180 s por toma. Seis
tomas basales para ruido; tres pares alternados para cada candidato. CPU del
árbol completo por GetProcessTimes; working set/privada por GetProcessMemoryInfo.
Mejora: reducción mayor que ruido en CPU o memoria y ninguna métrica empeora
más que su ruido. Cada mejora necesita tests, antes/después y commit propio;
se termina tras diez intentos consecutivos sin mejora. Campañas inválidas y
preparación no cuentan como intentos. Sin PR/merge, push solo al final del encargo.

Actualización 15-oct local: **6 tomas basales válidas / 0 candidatos evaluados /
0 mejoras**. Cinco tomas descartadas: cuatro por builds/QA #1634 y una al
coincidir con nuestro cargo fmt por la cola. Diagnostic-03
validó el arnés y el árbol completo (incluye conhost.exe de System32), pero solo
duró 10 s con profiling y no se acepta como baseline. Ningún proceso ajeno fue
cerrado. Slots/locks/reserva de pantalla propios liberados; sin campaña activa.
La prioridad del PC está consultada. `campaign_baseline.py`, `measure.py`,
`lmu_probe.py`, `summarize.py`, protocolo y resultados quedan en `C:/tmp/1638-perf`;
control hasheado `builds/baseline-6dab6930`. No se afirma bucle terminado ni mejora
CPU/RAM. La campaña pudo continuar al quedar el PC libre de Hub/builds; no
faltaba IA ni sesión LMU. Control `baseline-6dab6930`, seis tomas completas
sin profiling, 60 s + 180 s. Resultados originales en `baseline-progress.json`,
`baseline.json` y carpetas baseline-05/06/07/09/10/11 de `C:/tmp/1638-perf`:

| Métrica del árbol completo | Mediana basal | Rango/ruido mínimo medido |
| --- | ---: | ---: |
| CPU de un núcleo | 4,746961 % | 1,556382 puntos |
| CPU del equipo (16 CPUs lógicas) | 0,296685 % | 0,097274 puntos |
| Memoria residente | 94,366391 MiB | 0,334759 MiB |
| Memoria privada | 89,129430 MiB | 0,320356 MiB |

Todas: PRACTICE1, 37 coches, fase SHM 5 y cero avances de reloj; no conducción.
Estos datos son una línea base, no una mejora. Candidato REST preparado sin
commit para evitar almacenar campos descartados conservando la validación
JSON; Nextest 631/631, Clippy/fmt/Release y LMU (11 captura/oráculo + 10
conformidad) PASS en la ejecución anterior; los tres pares A/B, B/A, A/B se
interrumpieron al apagarse el PC. No contar preparación ni
controles como diez intentos de optimización. Push verificado `13fea744`,
rama de issue; sin PR/merge/promoción/release y sin runs CI de esa rama.

## Continuación tras el reinicio del 15-oct

La primera toma `rest-discard-01-a1-01` conserva solo logs/directorio de datos,
sin `result.json`, `samples.csv` ni comparación: **0 pares completos, 0 intentos
evaluados, 0 mejoras**. No se transforma una toma cortada en un resultado.
El identificador `a49d9d9d8e92` es un digest de los dos archivos fuente del
candidato, guardado después en el commit `9eff05cb`. Su manifiesto `build.json` conserva hashes de
binarios y fuentes; solo cambia `vantare-core.exe` respecto al control.

El sondeo inicial de esta continuación no encontraba `Le Mans Ultimate.exe` ni el mapping
`LMU_Data`. Esto bloquea únicamente las fases 3/4 físicas. No se arranca el juego,
se controlan coches ni se leen/escriben ajustes o datos reales. No se espera IA.
Hay además dos marcadores heredados de la toma cortada: `pc-medicion.lock`
(#1638, PID 13928) y `pantalla-ocupada` (#1638, PID 25728), creados a las 00:57.
Ningún PID existe en la continuación. Se comunicaron al orquestador y el script
QA respetó el lock. El orquestador autoriza retirarlos expresamente por el buzón;
se vuelven a verificar ambos PID con tasklist y sus propietarios JSON, y se
retiran únicamente esos dos archivos. No quedan reservas antiguas de #1638.
Al cerrar los gates LMU aparece abierto (PID 20388), pero `LMU_Data` sigue sin
parrilla activa y `sessionInfo` no ofrece JSON admitible. Ahora el bloqueo físico
es **sesión no cargada/usable**, no ausencia del proceso ni necesidad de conducir.
Antes de medir se vuelve a comprobar con `tasklist` que no esté el Hub de #1634;
una toma con QA/builds ajenos se descarta y no cuenta como intento sin mejora.
Tras el reinicio hay que volver a estimar el ruido con seis controles del mismo
contexto LMU de los pares nuevos; la tabla histórica anterior se conserva.
Los scripts locales admiten una campaña nueva y un archivo de ruido explícito,
y saltan nombres ya existentes sin sobrescribir evidencia cortada. Liberan la
reserva ante un bloqueo de otra QA. Sintaxis Python verificada; falta ejecución
física del protocolo después de estos cambios. En un hueco exclusivo con LMU:

```powershell
python -I C:/tmp/1638-perf/campaign_baseline.py --name baseline-reboot-20261015
python -I C:/tmp/1638-perf/campaign_pair.py --candidate C:/tmp/1638-perf/builds/candidate-01-rest-discard --sha 13fea74431d44d2b1bed67207fb8006edbbf59fb+rest-discard-a49d9d9d8e92 --name rest-reboot-01 --noise C:/tmp/1638-perf/baseline-reboot-20261015.json
```

La fase 2 ha conectado las señales con evidencia positiva disponible. Los
restantes huecos de adquisición no tienen equivalencia admitida en los corpus:

| Pendiente | Evidencia y siguiente dependencia |
| --- | --- |
| Compuesto/grid y ratings | Los cuerpos REST sanitizados del 14-oct solo conservan identidad, dorsal, flags, finishStatus, paradas y energía; los corpus anteriores no acreditan esos campos. Hace falta una captura positiva y su equivalencia; no inferir compuesto del índice sin catálogo ni grid de la primera posición observada. |
| Fase de sesión/FCY/fin, estado rival/pit loss | Los ceros SHM legacy fueron borrados por el sanitizador; la fase actual observada no demuestra las transiciones. Ver `runtime/src/adapter/lmu/REVIEW.md`, ISA-1425. `in_pits` no equivale a servicio, entrada/salida o garaje ajeno. |
| Daños exactos/zonas/segundos de reparación | Dents ordinales sin correspondencia a integridad/componentes. Necesita decisión de representación o fuente nueva demostrada. |
| DT/SG/tipo/plazo | Contador separado ya publicado; depende del contrato PenaltyKind de #1629 y de una fuente LMU positiva. No redefinirlo. |
| ABS/TC/FFB, grados/calibración RPM, forecast | No hay fuente/equivalencia positiva en las capturas admitidas; exige decisión/fuente. |
| Radar, centrado multiclase, vertical y nuevos looks | Señales base disponibles; pendiente portar los diseños aprobados en #1629 a ViewModels/presentación, sin segundo pipeline de adquisición. #1629 sigue siendo una tarea de diseño HTML. |

Resumen de esenciales: **13 OK/condicionados, 4 parciales, 1 falta**. Esto no
certifica que los diseños completos estén listos para lanzamiento.

### Comprobación física preparada para los 18 widgets

Desde `vantare-v2/`, con Core y tests UI previamente compilados en el target
aislado y LMU con una sesión cargada:

```powershell
python -I native/scripts/verify-lmu-widget-coverage.py
```

El script arranca solo un Core QA con datos temporales, pipe y entorno propios;
lo cierra por EOF al terminar. No abre ventanas ni guarda snapshots/nombres.
El test opt-in `demand::tests::live_lmu_photos_preserve_every_widget_projection`
comprueba simulador LMU, origen Live (rechaza replay), parrilla/jugador y estado
Live/Paused. Sobre esa misma foto recibida del Core físico, compara la proyección
completa con la seleccionada por la demanda productiva de cada widget a través
de otro pipe aislado: 18 entradas y cuatro configuraciones adicionales.
Imprime una línea por configuración. No prueba apariencia, series completas ni
señales ausentes; una proyección que conserva ausencia no acredita daño/forecast.
Los tests ordinarios hacen esa comparación con capturas reales LMU/ACC y menú/
caducidad. La prueba física permanece opt-in y no sustituye esos gates.

Validación de la guarda: Core QA aislado reproduciendo el fixture real
`lmu-1.4.2.0-track-fixture.bin` → el opt-in rechaza explícitamente
`Replay != Live` (exit 101 esperado, `C:/tmp/1638-replay-guard.log`). No es una
prueba física positiva. El comando completo se ejecutó después y respetó el
lock heredado sin crear Core (`C:/tmp/1638-live-coverage-resume.log`).
Después de retirar las reservas con autorización se ejecuta el comando completo:
Core QA aislado y test opt-in terminan con exit 101, «LMU sin sesión usable en
el pipe QA» (`C:/tmp/1638-live-coverage-final.log`, espera acotada de 10 s).
El Core se cierra por EOF. No se transforma este fallo de precondición física en
un PASS ni en una comparación de rendimiento; los 18 diseños siguen sin QA
física positiva en esta continuación.

### Gates de la continuación

Siempre cola, `CARGO_BUILD_JOBS=2`, `-j 2` y `CARGO_TARGET_DIR=C:/tmp/target-1638`.
No se modifica Hub/storage ni se afirma su build/QA. Network está activado para
Services; Clippy incluye todos los targets de runtime/domain/ipc/UI y paint-stats.

| Gate | Resultado | Log local en C:/tmp |
| --- | --- | --- |
| Build runtime/domain/ipc/UI | PASS, 8 min 09 s | `1638-resume-build.log` |
| Clippy `-D warnings` | PASS, 5 min 14 s | `1638-resume-clippy.log` |
| Fmt workspace | PASS | `1638-recovered-fmt.log` |
| Nextest runtime/domain/ipc | 631/631 PASS, 5 skips | `1638-resume-nextest.log` |
| Nextest UI | 321/321 PASS, 5 skips (incluye el opt-in nuevo) | `1638-recovered-ui.log` |
| Lifecycle runtime | 13/13 PASS | `1638-recovered-lifecycle.log` |
| Telemetría completa | 30/30 PASS, 1 opt-in físico omitido; ACC completo 974,046 s | `1638-recovered-telemetria.log` |
| Anti-slop y retirada | 456/456 PASS | Salida de los dos verificadores |

El disco se agotó entre Clippy y los siguientes gates: fallaron la compilación
UI (os error 112), el enlace de lifecycle (LNK1108) y el primer intento de commit.
No fallaron assertions de producto. Se conservan `1638-resume-ui-nextest-final.log`
y `1638-resume-lifecycle.log`. Recuperación con `cargo clean` limitado a los
paquetes runtime/UI y al perfil Release del **target propio**; fuentes, logs,
capturas y binarios de A/B fuera del target intactos. La repetición anterior
acredita UI/lifecycle; el corpus completo terminó con exit 0 en 1038,911 s.

Hitos de continuación: candidato REST `9eff05cb`, QA/demanda y cobertura
`99b5963c`, seguidos por este cierre documental de gates. Rama
`vantareapp/isa-1638-telemetria-lanzamiento`, base `79a1ace6` (nightly obtenida de
nuevo sin cambiar). Push/SHA remoto y CI se verifican al terminar en el buzón;
sin PR, merge, promoción ni release. GitHub #1638 se leyó OPEN, última
actualización `2026-10-14T19:41:08Z`, sin labels/milestone/Project; el orquestador
lleva ese seguimiento por la excepción explícita, sin escribir Plane/Notion.
Entrega **parcial**: siguen las decisiones/fuentes pendientes y LMU sin sesión
usable. Reservas heredadas retiradas con autorización. No hay comparación A/B
ni mejora CPU/RAM acreditada.
