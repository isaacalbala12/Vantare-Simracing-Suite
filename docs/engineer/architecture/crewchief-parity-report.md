# Informe de Paridad de CrewChiefV4 para Vantare Ingeniero — HISTÓRICO

> **Estado:** **HISTÓRICO** a partir de 2026-06-27.
> **Reemplazado por:**
> [`crewchief-parity-audit.md`](crewchief-parity-audit.md) (auditoría
> adversarial 2026-06-27) +
> [`vantare-go-master-plan.md`](../vantare-go-master-plan.md) § 13
> (matriz LMU-01..48 basada en evidencia).

## 1. Por qué este doc es histórico

Este informe describe el estado del proyecto **antes** de la
auditoría adversarial de 2026-06-27 y contiene varias afirmaciones
que el código y la auditoría posteriores desmienten. Concretamente:

1. **Citas a paths inexistentes.** El informe asume
   `internal/engineer/lmu/parser.go` como parser principal de
   Ingeniero (sección "A. Gaps Críticos en el Parser del Ingeniero").
   A 2026-06-27 ese archivo existe pero solo como cambio sin commit y
   **solo lee geometría** (Position, Orientation); no Fuel, no
   GamePhase, no Penalties. El parser que sí lee esos campos es
   `internal/telemetry/lmu/parser.go` (parser público de widgets),
   que ya estaba en el repo antes de este informe y que el autor
   del informe parece no haber localizado.
2. **Claim "GAP" para features que están parcialmente hechas.** El
   informe dice "**GAP**. Vantare no lee el canal extendido de LMU
   ni realiza análisis sintáctico de strings" (Feature 6). Eso es
   cierto para Extended buffer, pero el informe trata el gap como
   solo "agregar offset", cuando en realidad requiere abrir un
   segundo reader mmap (`$rFactor2SMMP_Extended$`).
3. **Claim "MATCH" / "PARCIAL" para features no implementadas.** El
   informe afirma que la histéresis longitudinal está "Parcialmente
   implementado" (Feature 1) cuando en realidad está completamente
   implementada en `spotter/overlap.go`. Lo mismo con `ActiveSides`
   y la cancelación de pending clears.
4. **Claim sobre preemption incorrecto.** El informe dice "La cola
   en Go reproduce audios de forma secuencial y no puede detener
   físicamente un clip en reproducción" (Feature 4). En realidad
   `audio/player_windows.go:37-42` llama `stopLocked()` antes de
   cada `Play`, que sí interrumpe físicamente el clip en curso.
   Lo que NO está hecho es que `queueLoop` invoque `Player.Play`.
5. **Tabla de telemetría desactualizada.** El informe dice que
   `mFuel`, `mBestLapTime`, `mVehicleClass`, `mPlace`,
   `mTimeBehindLeader` y `mNumPenalties` son "Ausente" en Go
   Engineer. A 2026-06-27, el parser público
   `internal/telemetry/lmu/parser.go` **ya los lee** (líneas 163,
   164, 213, 219, 220, 224, 225, 228). Lo que falta es que el
   runtime de Ingeniero los consuma.
6. **Constantes CC mal citadas o simplificadas.** Por ejemplo,
   `consistencyRange = LapTime × 0.5 / 100` se presenta como
   "0.5% del tiempo de vuelta" sin notar que CC define
   `consistencyLimit = 0.5f` y luego divide por 100 para pasarlo
   a fracción (`LapTimes.cs:148,839`). El valor resultante es
   `0.005 × LapTime` que **sí** es 0.5%, pero la presentación
   debería ser explícita sobre el factor de escala.
7. **Umbrales de tyre wear mal copiados.** El informe dice "Wear >
   30% ⇒ Alerta Knackered" (Feature 15). CC define cuatro umbrales
   en `RF2GameStateMapper.cs:44-47`: `scrubbed=5, minor=20,
   major=50, wornOut=75`. Knackered (WORN_OUT) empieza a 75%, no
   30%. El claim "Worn entre 15% y 30%" tampoco encaja con CC.

## 2. Qué hacer con este doc

- **No usar como spec.** Su valor es histórico: muestra el
  razonamiento que llevó a la auditoría 2026-06-27.
- **Para implementar features de paridad**, abrir
  [`crewchief-parity-audit.md`](crewchief-parity-audit.md) como
  insumo Y crear mini-auditoría específica (ver
  [`agent-workflow.md`](../agent-workflow.md) § 4).
- **Para el estado actual de la matriz LMU-01..48**, leer
  [`vantare-go-master-plan.md`](../vantare-go-master-plan.md) § 13.

## 3. Contenido original (referencia histórica)

El informe original se conserva abajo como referencia histórica.
**Su información puede contener errores que la auditoría 2026-06-27
corrige; no tomar decisiones de implementación basadas en este
contenido sin verificar contra código fuente y tests.**

````markdown
# Informe de Paridad de CrewChiefV4 para Vantare Ingeniero

Este informe detalla las fórmulas matemáticas, algoritmos, lógica de estados, políticas de audio y mapeos de datos del repositorio oficial de **CrewChiefV4** y los compara con la implementación actual de **Vantare Ingeniero Go** en `vantare-v2-engineer`.

El objetivo es establecer la ruta técnica clara para lograr una paridad real y funcional (no aproximada) en el asistente de ingeniero y el spotter de Vantare.

---

## 1. Catálogo Detallado de Features de CrewChief (Fichas de Comportamiento)

### Feature 1: Detección y Clasificación del Spotter (Hold/Clear/3-Wide)
* **Clase de CrewChief:** NoisyCartesianCoordinateSpotter.cs
* **Campos de Telemetría LMU/rF2 Utilizados:**
  * Jugador: mPos (vector de posición mundial), mOri (matriz de orientación).
  * Oponentes: mPos (vector de posición mundial).
* **Fórmulas Matemáticas:**
  * Yaw = atan2(mOri[RowZ].x, mOri[RowZ].z) mod 2π
  * alignedX = cos(yaw)*diffX + sin(yaw)*diffZ
  * alignedZ = cos(yaw)*diffZ - sin(yaw)*diffX
* **Condiciones y Umbrales de Disparo:**
  * alignedZ < 0 => Oponente delante. Solape si |alignedZ| < carLength.
  * alignedZ > 0 => Oponente detrás. Solape si alignedZ < carLength + 0.4m.
  * Separación lateral: |alignedX| < carWidth + 0.5m. > 20m se ignora.
* **Directorios de Sonido:** spotter/car_left, car_right, still_there, clear_left, clear_right, three_wide.
* **Estado en Vantare Go:** Parcialmente implementado en overlap.go y alignment.go.
* **Tarea de Desarrollo:** Integrar histéresis longitudinal 0.5m y tolerancia trasera 0.4m.

### Feature 2: Agrupamiento de Coches en Fila (Stacked Cars Check)
* **Clase de CrewChief:** NoisyCartesianCoordinateSpotter.cs.
* **Fórmulas:** separationDelta = maxLateralSeparation - minLateralSeparation; si < carWidth => carsOnLeft = 1.
* **Estado en Vantare Go:** GAP. No implementado.
* **Tarea:** Implementar agrupamiento de oponentes en línea india en Classify.

### Feature 3: Determinación del Lado en Parrilla (Grid Side Math)
* **Clase de CrewChief:** Events/Spotter.cs.
* **Condiciones:** Evalúa alignedX del rival más cercano por delante; umbral ±2 metros.
* **Estado en Vantare Go:** GAP.
* **Tarea:** Cálculo en GamePhase=4 para avisar colocación inicial.

### Feature 4: Interrupción en Caliente de Audio (Preemption)
* **Clase de CrewChief:** PlaybackModerator.cs + AudioPlayer.cs.
* **Condiciones:** Si entra SPOTTER y el sonido actual no es spotter ni beep => InterruptCurrentlyPlayingSound.
* **Estado en Vantare Go:** GAP (cola secuencial).
* **Tarea:** Interrupción física del dispositivo.

### Feature 5: Filtro Dinámico por Tráfico (Auto-Verbosity)
* **Clase de CrewChief:** PlaybackModerator.cs.
* **Condiciones:** CarSpeed > 5 m/s + gap < 1s => LOW; gap < 2s => MED.
* **Estado en Vantare Go:** GAP.

### Feature 6: Extracción de Sanciones desde Consola
* **Clase de CrewChief:** Penalties.cs + RF2GameStateMapper.cs (Extended buffer).
* **Campos:** mLastHistoryMessage, mTicksLastHistoryMessageUpdated.
* **Estado en Vantare Go:** GAP.

### Feature 7: Media Móvil y Rango de Combustible
* **Clase de CrewChief:** Fuel.cs.
* **Fórmulas:** averageUsagePerLap = suma de 3 vueltas / 3.
* **Estado en Vantare Go:** GAP.

### Feature 8: Cuenta Atrás de Boxes
* **Clase de CrewChief:** PitStops.cs.
* **Condiciones:** distanceToStall ≈ 100m / 50m / 10m.
* **Estado en Vantare Go:** GAP.

### Feature 9: Alertas de Vueltas Finales Diferenciadas
* **Clase de CrewChief:** LapCounter.cs.
* **Ramas:** Place==1 => leading; Place<=3 => top_three; resto => regular.
* **Estado en Vantare Go:** GAP.

### Feature 10: Clasificación Dinámica de Velocidad Multiclase
* **Clase de CrewChief:** MulticlassWarnings.cs.
* **Fórmulas:** bestClassLap por clase; comparación con player.
* **Estado en Vantare Go:** GAP.

### Feature 11: Filtro "Luchando por Posición"
* **Clase de CrewChief:** MulticlassWarnings.cs.
* **Umbral:** deltaDist < 30 metros.
* **Estado en Vantare Go:** GAP.

### Feature 12: Predicción de Salida de Pitlane
* **Clase de CrewChief:** Strategy.cs.
* **Estado en Vantare Go:** GAP.

### Feature 13: Box Compartido Ocupado
* **Clase de CrewChief:** Strategy.cs.
* **Campo:** PitGroup (offset 480 scoring).
* **Estado en Vantare Go:** GAP.

### Feature 14: Analizador de Consistencia
* **Clase de CrewChief:** LapTimes.cs.
* **Fórmula:** consistencyRange = LapTime * 0.5 / 100 (0.5%).
* **Estado en Vantare Go:** GAP.

### Feature 15: Monitoreo Térmico y Desgaste de Neumáticos
* **Clase de CrewChief:** TyreMonitor.cs.
* **Umbrales (informe):** Wear > 30% => Knackered; 15-30% => Worn.
  **(NOTA: los umbrales reales de CC son scrubbed=5, minor=20,
  major=50, wornOut=75. La auditoría 2026-06-27 corrige.)**
* **Estado en Vantare Go:** GAP.

### Feature 16: Suficiencia de Batería Híbrida (KERS)
* **Clase de CrewChief:** Battery.cs.
* **Fórmulas:** avgEnergyPerLap, energyRequired.
* **Estado en Vantare Go:** GAP.

## 2. Gaps de Mapeo de Telemetría (LMU/rF2)

### A. Gaps Críticos en el Parser del Ingeniero
El archivo internal/engineer/lmu/parser.go (claim del informe)
implementa una lectura muy reducida en comparación con el parser de
Overlays.

| Módulo | Campo | Offset | Estado (informe) |
|---|---|---|---|
| Filtros/Gates | mInRealtime | 1747 | Ausente |
| Filtros/Gates | mGamePhase | 1740 | Ausente |
| Flags | mYellowFlagState | 1741 | Ausente |
| Flags | mSectorFlag | 1742 | Ausente |
| Penalties | mLastHistoryMessage | Extended | Ausente |
| Penalties | mTicksLastHistoryMessageUpdated | Extended | Ausente |
| Fuel | mFuel | 524 | Ausente |
| Fuel | mFuelCapacity | 608 | Ausente |
| LapTimes | mBestLapTime | 144 | Ausente |
| LapTimes | mLastLapTime | 168 | Ausente |
| Tyre | mTyreWear | ruedas | Ausente |
| Tyre | mTyreTemp | ruedas | Ausente |
| Tyre | mBrakeTemp | ruedas | Ausente |
| Engine | mEngineWaterTemp | motor | Ausente |
| Engine | mEngineOilTemp | motor | Ausente |
| Battery | mElectricBatteryPercentage | eléctrico | Ausente |
| Battery | mElectricBatteryCapacity | eléctrico | Ausente |
| Damage | mSuspensionDamage | daños | Ausente |
| Damage | mAeroDamage | daños | Ausente |
| Damage | mLocalAccel | 208 | Ausente |

**NOTA auditoría 2026-06-27:** el parser público
`internal/telemetry/lmu/parser.go` ya lee `mFuel`, `mFuelCapacity`,
`mGamePhase`, `mBestLapTime`, `mLastLapTime`, `mTimeBehindLeader`,
`mTimeBehindNext`, `mVehicleClass`, `mNumPenalties`, `mPlace`. La
columna "Estado" de la tabla del informe está desactualizada.

### B. Ausencia de Múltiples Mappings de Memoria
Solo se abre el buffer unificado LMU_Data. Faltan:
1. Extended Buffer ($rFactor2SMMP_Extended$).
2. PitInfo Buffer ($rFactor2SMMP_PitInfo$).

## Roadmap de Tareas Recomendadas

### Fase 1 (P0)
1. Modificar parser de telemetría para mapear campos de estado y
   consumo.
2. Infraestructura de Audio: preemption física.
3. Implementar ValidityRule para validación stale.

### Fase 2 (P1)
1. Histéresis en solapes + velocidad relativa de oponentes.
2. Filtro Stacked Cars.
3. Promedios de combustible sobre 3 vueltas.
4. Cálculos multiclase dinámicos.

### Fase 3 (P2)
1. Buffer Extended para penalties.
2. Ruedas, motor e híbridos para alertas de desgaste, temp y batería.
````
