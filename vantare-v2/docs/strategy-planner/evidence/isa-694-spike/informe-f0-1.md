# ISA-701 / F0-1 — Spike empírico de telemetría LMU

Fecha de ejecución: 2026-08-21  
Issue: #701, parte de ISA-694  
Rama: `vantareapp/isa-701-f0-spike-telemetria`  
Base recibida: ISA-694 `af41f14dfa0c979e1c02b62a852c58d6946bfe19`

## 1. Resumen ejecutivo

Se inspeccionaron **336 sesiones estables** de un corpus de 375 DuckDB. Se
excluyeron de forma fail-closed 38 bases con WAL y una base reciente. LMU
estaba ejecutándose durante el spike: nunca se abrió un original con DuckDB.
Cada sesión se copió por separado al worktree, se comprobó que el origen no
cambió y el helper firmado de Vantare consultó solo la copia. Hubo **0 fallos**
de staging, hash, helper o catálogo.

Veredicto corto:

| Asunción | Veredicto | Resultado |
|---|---|---|
| A1 · calidad de canales | **DEGRADED** | Fuel, VE, wear, presiones y temperaturas son ricos; compuesto y parte del clima no discriminan, y falta una cronología común. |
| A2 · forecast | **UNRESOLVED / fuera de #701** | #702 verificó el endpoint, pero este spike no validó pareja práctica→carrera ni estabilidad. |
| A3 · clasificación por metadata | **DEGRADED** | Los seis campos de identidad están presentes en 336/336; falta solo el spot-check humano de verdad semántica. |
| A4 · pit loss desglosado | **INVALID** | Hay `In Pits` y tasas observables, pero no una base temporal común ni un marcador de pit-box/servicio que permita el desglose exigido. |
| A5 · curva coste-ahorro | **INVALID** | Solo una sesión tiene más de una mezcla con vueltas utilizables; el nivel minoritario tiene N=2 y está fuertemente confundido. |
| A6 · tamaño del bundle | **VALID** | Mediana 3.959 B JSON / 1.279 B gzip; p95 5.003 / 1.532 B; corpus completo estimado 1,389 MB / 0,446 MB. |

Conclusión para ISA-694: el corpus sirve para inventario, consumo, estados de
recursos y agregados compactos. **No sostiene todavía** el contrato prometido
de alineación eventos↔continuos, degradación separada de peso de Fuel,
degradación por esquina, identidad de piloto ni pit loss desglosado.

## 2. Método y custodia

Fuentes de contrato revisadas:

- `docs/strategy-planner/isa-694-spec.md`, A1–A6;
- `docs/strategy-planner/isa-694-plan.md`, F0;
- issue #701;
- `docs/strategy-planner/isa-694-current-state-and-rework-brief.md`, §6;
- `internal/telemetryanalysis/discovery.go`;
- `internal/telemetryanalysis/historical.go`;
- `internal/telemetryanalysis/duckdbadapter/*`;
- `frontend/src/hub/strategy-orbit/strategy-events-store.ts` y sus tests.

Ruta estándar verificada en este PC:

```text
C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Telemetry
```

Herramientas:

- Python 3.12.11, solo biblioteca estándar;
- `vantare-telemetry-reader.exe` + DuckDB v1.5.5 del runtime firmado instalado
  por Vantare;
- no se instaló `duckdb` para Python ni ninguna dependencia global.

El script reproducible es `spike_f0_1.py`. Nunca envía al helper la ruta
original. El output persistido contiene metadata permitida y agregados; no
contiene telemetría cruda, SteamID, nombres de piloto ni rutas privadas.

Limitaciones deliberadas:

- 336 sesiones aportan catálogo, metadata, duración observable y vueltas;
- 19 carreras con al menos cinco vueltas y las dos sesiones con
  `Cloudy & Drizzle` forman la muestra profunda (21 sesiones);
- los estadísticos de canales de alta frecuencia usan páginas acotadas de
  inicio/mitad/final; Fuel, VE, wear y Lap Dist se cargan completos cuando el
  tamaño queda bajo el límite del spike;
- una alineación estimada por el final de dos relojes se usa solo para medir el
  problema. **No se propone como algoritmo productivo**.

Artefactos de máquina:

- `inventario-sesiones.csv` — tabla completa por sesión;
- `spot-check-metadata.csv` — ocho confirmaciones humanas, no una cola larga;
- `presencia-canales.csv` — presencia/esquema/frecuencia en las 336 sesiones;
- `resultados-f0-1.json` — resultados agregados y trazabilidad de muestra;
- `bundle-derivado-ejemplo.json` y `tamano-bundle.json`;
- `matriz-migracion-orbit.csv` y `fixtures/orbit-localstorage/*.json`.

## 3. Inventario del corpus y A3

### 3.1 Volumen y variedad

| Métrica | Resultado |
|---|---:|
| DuckDB encontrados | 375 |
| Estables y leídos desde copia | 336 |
| Excluidos por WAL | 38 |
| Excluidos por recientes | 1 |
| Fallos de inspección | 0 |
| Pistas | 16 |
| Layouts | 23 |
| Coches | 27 |
| Clases | 5 |
| Combinaciones pista+layout+coche+clase | 56 |
| Practice / Qualify / Race | 265 / 26 / 45 |

`WeatherConditions` contiene seis valores: `Clear` (48), `Light Clouds`
(167), `Mostly Cloudy` (35), `Overcast` (16), `Partially Cloudy` (68) y
`Cloudy & Drizzle` (2).

### 3.2 Riqueza y fiabilidad de metadata

Los seis campos pedidos están presentes y no vacíos en **336/336 (100 %)**:

- `TrackName`;
- `TrackLayout`;
- `CarName`;
- `CarClass`;
- `SessionType`;
- `WeatherConditions`.

La separación `TrackName`/`TrackLayout` es útil, no una inconsistencia: por
ejemplo, Fuji tiene layout normal y Classic, y Bahrain tiene circuito completo
y Outer. `SessionType` usa solo `Practice`, `Qualify` y `Race` en este corpus.

No se detectó metadata pobre. Sí existen muchas capturas muy cortas o sin
vuelta completa; esto es calidad de la sesión, no ausencia de identidad. F3
debe clasificarlas como sesión identificada pero no utilizable para cada
familia de derivación.

**Spot-check solicitado a Isaac:** confirmar solo las ocho filas de
`spot-check-metadata.csv`, elegidas por combinar captura corta/sin vuelta y un
layout específico. Si las ocho coinciden con lo corrido, A3 puede promocionarse
de `DEGRADED` a `VALID`. Hasta entonces no se ha medido precisión contra ground
truth.

**Veredicto A3: DEGRADED.** Completitud y riqueza: PASS. Veracidad semántica:
pendiente de ocho confirmaciones.

## 4. A1 — Calidad de canales

### 4.1 Presencia y esquema

Todos los canales pedidos aparecen en **336/336 sesiones** con esquema y
frecuencia estables:

| Canal | Forma | Cadencia | Muestra empírica profunda |
|---|---|---:|---|
| Fuel Level | continuo, 1 valor | 20 Hz | 0,073–88 L; 0 nulos; paso mediano 0,00134 L |
| Virtual Energy | continuo, 1 valor | 20 Hz | 0–100 %; 0 nulos; paso mediano 0,00232 pp |
| Tyres Wear | continuo, FL/FR/RL/RR | 10 Hz | 52,77–100 %; 0 nulos; paso mediano 0,000488 pp |
| TyresPressure | continuo, 4 ruedas | 10 Hz | 120,80–206,81 kPa; 0 nulos; paso mediano 0,102 kPa |
| TyresCarcassTemp | continuo, 4 ruedas | 5 Hz | 16,02–125,52 °C |
| TyresRubberTemp | continuo, 4 ruedas | 10 Hz | 16,02–109,38 °C |
| TyresRimTemp | continuo, 4 ruedas | 50 Hz | 16,02–126,12 °C |
| TyresTemp L/C/R | continuo, 4 ruedas × zona | 100 Hz | 16,02–100,95 °C |
| FuelMixtureMap | evento | al cambiar | códigos 0–5; 30 eventos en 21 sesiones |
| TyresCompound | evento, 4 ruedas | al cambiar | códigos 0–2; 84 valores, sin mapping semántico en el catálogo |
| Minimum Path Wetness | evento | al cambiar | seco 0; llovizna 0/5/12,5 % |
| OffpathWetness | evento | al cambiar | booleano `false`, incluso con llovizna |
| CloudDarkness | evento | al cambiar | booleano `false`, incluso con llovizna |
| Ambient / Track Temperature | continuo | 1 Hz | 16,02–31,03 / 19,66–44,10 °C |

### 4.2 Resolución, ruido y anomalías

- Fuel, VE y wear tienen resolución float suficiente y trazas suaves. Los
  saltos positivos son útiles para detectar servicio/cambio, pero no bastan
  para fecharlo contra eventos sin cronología común.
- Las temperaturas y presiones tienen resolución sobrada. Sus rangos son
  plausibles para estado frío/caliente; el spike no encontró nulos en la
  muestra profunda.
- `FuelMixtureMap` sí discrimina niveles, pero casi todas las sesiones usan un
  único nivel.
- `TyresCompound` está estructuralmente presente y usa códigos 0–2 en 84
  valores, pero el catálogo no aporta el mapping semántico. No puede sostener
  curvas por compuesto con etiqueta honesta sin ese mapping y cambios
  repetidos demostrados.
- `Minimum Path Wetness` aporta buckets discretos útiles. En las dos sesiones
  `Cloudy & Drizzle` solo hay dos transiciones por sesión; la señal sirve para
  estado/bucket, no para una curva climática fina.
- `CloudDarkness` y `OffpathWetness` llegan tipados como booleanos pese a unidad
  `%` y no cambian de `false`. Son **no informativos** en este corpus.
- El mayor problema no es ruido numérico: es que los continuos declaran
  `TimeOriginUnknown` y no comparten una cronología demostrada con eventos.

### 4.3 Encaje con los cinco nodos del forecast (#702)

No se investigó REST en #701. Tomando como dato externo verificado que
`GET /rest/sessions/weather` publica cinco nodos de progreso:

1. conservar cada nodo forecast en su dominio normalizado de progreso;
2. comparar el clima realizado usando eventos timestamped de
   `Minimum Path Wetness` como función escalonada;
3. usar `WeatherConditions` solo como etiqueta resumen de sesión;
4. no convertir `CloudDarkness=false` u `OffpathWetness=false` en 0 % con
   falsa precisión;
5. no casar nodos con continuos por índice hasta resolver el reloj común.

Esto permitiría un backtest de forecast en dominio de evento/progreso. No
valida A2: sigue haciendo falta una pareja práctica→carrera real.

**Veredicto A1: DEGRADED.** Las señales numéricas principales pasan presencia,
cadencia y resolución. Caen identificabilidad, compuesto, dos canales de clima
y la alineación estructural necesaria para las derivaciones prometidas.

## 5. Prerrequisitos estructurales

| Prerrequisito | Veredicto | Evidencia |
|---|---|---|
| Alineación continuos/eventos | **INVALID** | 21/21 sesiones profundas difieren >5 s entre fin continuo y último evento; 6 difieren >60 s; rango de delta −9.985,14 a +435,60 s. En carreras largas el continuo cubre solo una ventana del coche/piloto y comprime el resto. No existe offset único demostrado. |
| Segmentación de vueltas | **DEGRADED** | `HistoricalSession.Laps` sigue vacío. `Lap Dist` resets y eventos de lap coinciden exactamente en 7/21, quedan a ±1 en 10/21 y difieren hasta 6. Se pueden reconstruir con guards de incompletas/out/in-lap, no por una sola fuente ciega. |
| Identidad de stint y piloto | **INVALID** | Se infieren 2–4 stints en cinco sesiones por saltos de Fuel/wear, pero no hay ID explícito ni piloto. La ventana continua puede ser solo la participación del piloto local dentro de una sesión global. |
| Localización vuelta/esquina | **DEGRADED** | `Lap Dist`, GPS y lateral/track edge permiten distancia por vuelta si se acepta la segmentación. No existe ID/nombre de esquina ni mapping versionado; degradación por esquina no es entregable directo. |

Recomendación mínima de contrato antes de F3:

- `ContinuousSegment { segmentId, sourceStart, sessionStartTs, sessionEndTs,
  driverId?, reason }` o equivalente, sin comprimir huecos en silencio;
- `LapBoundary` reconciliado con fuente y calidad;
- `StintBoundary` con causa (`pit`, `fuel_jump`, `tyre_change`, `driver_change`)
  y confianza;
- `TrackLocation` por distancia normalizada y mapping de esquina versionado,
  donde ausencia de mapping siga siendo `missing`.

## 6. Peso de Fuel frente a edad de neumático

Cinco sesiones permiten una regresión aparente con 2–4 stints. El resultado no
es identificable:

| Sesión | N vueltas | Stints | corr(Fuel, edad) | R² | β Fuel (s/L) | β edad (s/vuelta) |
|---|---:|---:|---:|---:|---:|---:|
| S026-08a1e626 | 56 | 3 | −0,946 | 0,119 | +0,078 | −0,408 |
| S059-e4f6b210 | 12 | 2 | −0,410 | 0,416 | −0,367 | −1,970 |
| S125-35438326 | 30 | 2 | −0,504 | 0,170 | −0,098 | −0,544 |
| S266-6b912640 | 63 | 4 | −0,863 | 0,142 | +0,046 | −0,023 |
| S287-bda9a70a | 23 | 2 | −0,855 | 0,092 | +0,015 | −0,043 |

Los signos cambian y cuatro coeficientes de edad dicen que el coche acelera al
envejecer el neumático. Esto no demuestra mejora del neumático: Fuel, learning,
goma de pista, tráfico y selección de vueltas dominan el ajuste; además, la
alineación temporal no está resuelta.

La curva combinada normalizada por stint sí se midió. Resultado resumido:

- vuelta 1: mediana +7,19 s (out-lap/calentamiento);
- vuelta 3: −0,07 s respecto a la mediana de las tres primeras;
- vuelta 9: −1,20 s (N=14);
- vuelta 20: −1,14 s (N=6);
- vuelta 28: −3,60 s (N=3).

La curva combinada es descendente: en esta muestra, el alivio de Fuel y otros
efectos pesan más que cualquier degradación observable. No se puede extraer
una curva de desgaste causal.

**Veredicto de separabilidad: INVALID.** Entregable provisional admisible:
`CombinedStintPaceCurve` con `identifiability=combined_only`, rango y N. No
publicar `FuelWeightCurve` ni `TyreAgeCurve` separadas como observadas.

## 7. Pit events y A4

En 21 sesiones profundas aparecen 10 intervalos `In Pits`:

- cuatro muestran subida de Fuel;
- tasas observadas: 1,851–3,997 L/s;
- dos muestran recarga de VE;
- tasas observadas: 2,495–2,498 puntos porcentuales/s.

Estas tasas demuestran que el recurso cambia durante ventanas de pit en casos
concretos. No prueban un desglose productivo porque:

- `In Pits` cubre el carril completo, no marca llegada/salida del cajón;
- no hay eventos de inicio/fin por servicio;
- servicios paralelos no se distinguen;
- tránsito y servicio viven en eventos, Fuel/VE en continuos con origen
  desconocido y huecos comprimidos;
- seis pits sin subida detectada pueden ser tránsito, parada sin recurso o
  desalineación: el dato no permite decidir.

**Veredicto A4: INVALID.** Se puede conservar `ObservedPitLaneInterval` y tasas
con calidad degradada; no `PitLossBreakdown` exacto. F3 necesita reloj común y
marcadores de pit-box/servicio o debe pedir tránsito/servicio manualmente.

## 8. Mezcla y A5

`FuelMixtureMap` está presente en 336/336 y usa códigos 0–5. Sin embargo, de
las 21 sesiones profundas solo S026 tiene vueltas utilizables en dos niveles:

- mezcla 2: N=2, 2,887 L/vuelta y 145,38 s;
- mezcla 3: N=54, 3,047 L/vuelta y 99,04 s.

La diferencia de 46 s no es un coste causal de mezcla; las dos vueltas
minoritarias están confundidas con estado de vuelta/pista y no hay repetición
equilibrada. No existe soporte para ajustar litros o VE ganados frente a
segundos perdidos por nivel.

**Veredicto A5: INVALID.** Mantener procedencia manual. Para validarlo se
requiere un protocolo A/B: ≥5 vueltas limpias alternadas por nivel, mismo
stint/compuesto/clima, exclusión de out/in/pit/tráfico e idealmente repetición
en dos sesiones por combinación.

## 9. Bundle derivado y A6

El bundle de ejemplo incluye solo:

- identidad de combinación permitida;
- agregados de stint;
- agregados de pit;
- curva de mezcla si existe;
- calidad agregada de canal.

No contiene samples crudos, nombres de piloto, SteamID ni rutas.

| Medida | JSON | gzip nivel 9 |
|---|---:|---:|
| Mediana por sesión | 3.959 B | 1.279 B |
| p95 por sesión | 5.003 B | 1.532 B |
| Estimación 336 sesiones | 1.388.944 B | 445.792 B |

La estimación no incluye el futuro envelope de firma, historial de consentimiento
ni índices de storage; incluso con un overhead conservador de 10× seguiría en
orden de decenas de KB por sesión.

**Veredicto A6: VALID.** El volumen no bloquea subida opt-in ni predigestión.

## 10. Command Orbit: matriz y corpus golden

Se auditaron las dos claves:

```text
vantare.v03orbit.strategy.events
vantare.v03orbit.strategy
```

La matriz completa tiene 28 filas en `matriz-migracion-orbit.csv`. Hallazgos
de mayor riesgo:

1. JSON corrupto, raíces inválidas y fallos de `setItem` se silencian.
2. Eventos sin ID o sin piloto válido se descartan sin preview.
3. Drivers y variantes solo validan un `id`; el shape interno pasa casteado.
4. `durationMin=60`, `tankL=90` y `pitLossSec=60` se materializan sin
   procedencia; `startAt` cae al instante de lectura, no determinista.
5. `availability` se castea sin validar segmentos, IDs, rangos ni solapes.
6. `activeStrategyId` no se valida contra las estrategias sobrevivientes.
7. `fillMode="telemetry"`, permitido por el tipo declarado, se borra al leer;
   solo `manual` sobrevive.
8. La clave legacy admite dos shapes: wrapper `{variants, availability}` y mapa
   plano. Ninguno valida las variantes.
9. Una variante local sin `order` no vacío se descarta; las que sobreviven
   reciben defaults sin procedencia.

Corpus golden versionado:

- events full;
- events sparse con defaults 60 min / 90 L / 60 s y `startAt=now`;
- events mixto con descartes y activeId colgante;
- events JSON corrupto;
- legacy wrapper;
- legacy mapa plano;
- legacy JSON corrupto.

Regla para F2: backup byte a byte antes de parsear; dry-run con preview;
cuarentena en vez de descarte; defaults marcados `legacy_synthetic_default`,
nunca `observed`; journal/fingerprint idempotentes; refs validadas después de
mapear IDs; error de persistencia visible; rollback semántico sin borrar
revisiones posteriores.

## 11. Candidatas a sanitizar para `testdata/`

No se copió ninguna base al repo. Selección recomendada:

| Sesión | Motivo |
|---|---|
| S026-08a1e626 | carrera larga, 60 vueltas, VE+Fuel, dos pits, varios stints aparentes y dos mezclas; caso adversarial de hueco temporal global/local |
| S040-3ebe91db | práctica `Cloudy & Drizzle`, 15 vueltas, wetness 12,5→5 %, gran hueco temporal; fixture climático |
| S045-ac539faa | carrera seca corta pero completa; baseline simple de lap resets/eventos |
| S125-35438326 | 38 vueltas y pit con subida de Fuel/tasa observable |
| S266-6b912640 | 70 vueltas, cuatro stints aparentes y delta temporal extremo; fixture negativo de alineación |
| S287-bda9a70a | 30 vueltas, dos stints aparentes; segunda combinación para curva combinada |

Proceso de sanitización posterior:

- partir otra vez del original estable mediante copia privada;
- retirar `CarName`/team, fechas absolutas, hashes y cualquier identificador;
- conservar esquema, frecuencias, unidades, transiciones y relaciones
  numéricas necesarias;
- producir manifest de transformación reproducible y revisar que no queden
  rutas, SteamID, piloto ni nombres de equipo;
- no promocionar estas IDs/hash abreviados como identificadores públicos.

## 12. Cambios recomendados al spec antes de F1/F3

1. A1 debe separar **calidad intracanales** de **derivabilidad cruzada**. La
   primera pasa para Fuel/VE/wear/temperatura/presión; la segunda queda
   bloqueada por tiempo/identidad.
2. Sustituir la promesa inmediata de curvas separadas por:
   `CombinedStintPaceCurve` obligatorio y `FuelWeightCurve` / `TyreAgeCurve`
   solo si un gate de identificabilidad pasa.
3. Degradación por esquina queda condicionada a `LapBoundary` reconciliado y
   mapping de esquina versionado; no inferir nombres desde distancia sola.
4. A4 debe aceptar dos ramas explícitas: breakdown observado solo con clock y
   service markers; si faltan, pit total/rates degradados + inputs manuales.
5. A5 debe incorporar el N mínimo/protocolo A/B anterior. El mero hecho de que
   exista `FuelMixtureMap` no valida una curva.
6. La clasificación A3 puede seguir automática por metadata, pero el gate de
   aceptación es el spot-check de ocho filas, no presencia de campos.
7. En clima, tratar `Minimum Path Wetness` como bucket de evento; no usar
   `CloudDarkness`/`OffpathWetness` booleanos como porcentajes.
8. Antes de F3a, congelar el contrato de segmentos temporales y decidir cómo
   representar huecos/no-participación del piloto sin comprimir el tiempo.

## 13. Decisión de fase

**F0-1: COMPLETADO como spike, no GO de implementación sin revisar el spec.**

F1 puede usar ya:

- matriz/corpus golden Orbit;
- contratos de presencia/calidad por canal;
- presupuesto de bundle;
- clasificación por metadata condicionada al spot-check.

F3/F4 no deben congelar todavía:

- alineación evento↔continuo;
- identidad de piloto/stint;
- pit loss desglosado;
- curvas causales separadas Fuel/neumático;
- curva coste-ahorro observada;
- degradación por esquina.

El gate humano debe decidir si modifica el spec con estas degradaciones o pide
una nueva campaña controlada de captura antes de continuar esas familias.
