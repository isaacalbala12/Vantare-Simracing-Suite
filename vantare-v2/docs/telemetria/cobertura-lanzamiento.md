# Cobertura de telemetría para el lanzamiento — VANTA-33 / #1638

Auditoría inicial: 14-oct-2026, base `nightly@79a1ace66e5ec397126495dc5ce99353db9beed9`.
Encargo: [#1638](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1638).
La optimización #1630 quedaba fuera del encargo inicial; el buzón del orquestador
la incorpora después como fase 4 (véase abajo). Seguimiento del orquestador
por `C:/tmp/buzon/1638.md`, sin Plane/Notion, PR ni merge.

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
portan en esta tarea de adquisición. Todos requieren QA **conduciendo** pendiente.

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

## LMU físico y gates

Prueba opt-in solo lectura, `launch_coverage::live_lmu_launch_probe`:
Core productivo + adapter LMU, 3 s, **Paused, 37 coches, jugador, 0 avances**.
La primera aserción de conducción falló explícitamente, sin ocultarlo. El buzón
del orquestador corrige el requisito: basta una sesión incluso parado/garaje,
sin IA ni movimiento. La prueba admite Live/Paused con parrilla y jugador y
continúa informando avances por separado. Una sesión pausada no acredita QA
conduciendo. Logs `C:/tmp/1638-lmu-live*.log`. No hubo ventanas, escritura al juego ni acciones
en la instalación. Repetir cuando esté en pista y el reloj avance:

```powershell
$env:CARGO_BUILD_JOBS='2'
$env:CARGO_TARGET_DIR='C:/tmp/target-1638'
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo test --manifest-path native/Cargo.toml -p vantare-runtime --test launch_coverage live_lmu_launch_probe --locked --offline -j 2 -- --ignored --nocapture
```

La prueba no imprime nombres ni cuerpos y no guarda datos reales. Una fuente
live válida aún necesita QA de los 18 widgets/variantes y escenarios positivos
de flags/daño/sanciones. ACC físico no ejecutado. Estado global del lanzamiento:
**parcial, no listo para aceptación** mientras esos límites permanezcan.

Gates finales y SHA: se registran al terminar en el handoff vivo y buzón #1638.
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
