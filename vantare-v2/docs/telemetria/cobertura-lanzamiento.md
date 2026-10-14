# Cobertura de telemetría para el lanzamiento — VANTA-33 / #1638

Auditoría inicial: 14-oct-2026, base `nightly@79a1ace66e5ec397126495dc5ce99353db9beed9`.
Encargo: [#1638](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1638).
La optimización #1630 no pertenece a esta entrega. Seguimiento del orquestador
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
| track-weather (tiempo en pista) | Pista/aire, viento, lluvia, agua | `session.weather.*`, S, K/m/s/rad/0–1/Pa | OK; conversión visible °C/km/h; agua = humedad, no profundidad mm |
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
