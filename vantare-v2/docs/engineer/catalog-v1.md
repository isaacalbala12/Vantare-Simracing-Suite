# Catálogo v1 del Ingeniero — rework radio bus + motor de familias (F0)

> **Issue:** #714 (hija de #713) — F0 · Catálogo v1 CrewChief-informed, CLEAN-ROOM.
> **Rama:** `vantareapp/isa-714-catalogo-ingeniero-v1` · **Base:** `origin/nightly@4ec98fea`.
> **Estado:** documentación F0 — no toca código ni checkout principal.
> **Fuente canónica de señales:** `internal/telemetry/projection/engineer` (`ObservationV1`, `Manifest`, `Capability*`) y `internal/telemetry/schema` v1. Toda disponibilidad se verifica contra esa observación; no se inventan señales.
> **Principio clean-room (D10):** el comportamiento de CrewChief es referencia; los textos, intents y priorización son 100 % propios. Jamás se copian frases ni nombres internos de CC.

---

## 0. Cómo leer este catálogo

### Qué es

Este catálogo es la **spec del QUÉ dice el Ingeniero** y la **entrada del precacheo Kokoro (F2)**: `catálogo × 4 locales × clips numéricos → tts.Cache`. Cambiar el catálogo implica regenerar audio. El motor de familias (F4) lo implementa intent a intent contra la observación canónica; el radio bus (`internal/radio`, F1) solo ve `RadioMessage{Intent, Priority, TTL, Locale, Payload}`.

### Familias

Cada familia agrupa intents por dominio de carrera. El orden del documento sigue valor en carrera + disponibilidad de señal: `spotter → banderas → fuel → penalties → laps → timings → pitstops → damage → position → racetime → sessionend → conditions → strategy/motivación`. Dentro de cada familia, los intents migrados (20 de `presentation.go`) van primero y se marcan `[migrado]`.

### Columnas por mensaje

| Columna | Significado |
|---|---|
| **intent** | Clave estable `familia.evento` (coincide con `messagepolicy.Intent*` para los 20 migrados; los nuevos siguen el mismo patrón y se registrarán en el resolver registrable de F1). |
| **ES / EN / IT / PT-BR visual · voz** | Texto visual (overlay/widget) y texto de voz (preparado para TTS). La voz usa placeholders hablados: `{n}` (número), `{gap}` (segundos), `{pos}` (posición), `{lap}` (vuelta). Las unidades se hablan (`litros`, `litres`, `litri`, `litros`; `segundos`, `seconds`, etc.), nunca abreviadas. Los 20 migrados conservan sus textos actuales como base. |
| **tipo** | `interrumpe` (corta audio no crítico, nunca al revés), `informa` (cola normal), `consulta` (readout bajo demanda — voz de entrada / PTT / botón; no se emite espontáneamente). |
| **prioridad propuesta** | Orden total del bus (`radio.v1`, spec §4.1): **P0 spotter** > **P1 banderas/peligro** > **P2 fuel/pit crítico** > **P3 carrera y motivación** (dentro de P3 ordena la antigüedad; los cooldowns largos limitan la motivación). |
| **TTL** | Ventana de relevancia tras `CreatedAtMS`; el bus nunca emite caducado. Spotter 2–4 s, peligro 8–10 s, fuel/pit 20–45 s, carrera 10–30 s, motivación 12–20 s. |
| **señal canónica + disponibilidad HOY** | Campo(s) de `ObservationV1` / `FactV1` / `Manifest` necesarios y su estado **hoy**: `disponible` (existe y es `Field.Usable()`), `parcial` (derivable con heurística o con dato limitado), `ausente` (no existe en la observación canónica; requiere que Telemetry Core lo publique). No se inventan señales: daños solo vive en el lector privado; lluvia/temperatura no existen en LMU; banderas no están proyectadas. |
| **nota personalidades** | Variación futura **sin triplicar textos**: el catálogo mantiene un único texto por locale; la personalidad modula prefijo/entonación en el resolver (`Profesional` = neutro, `Cercano` = más coloquial, `Exigente` = más directivo). No hay 3× filas. |

### Convenciones de voz

- Números como `{n}`, `{gap}`, `{pos}`, `{lap}`, `{fuel}`, `{sector}`. El precacheo genera clips numéricos separados; la voz los concatena.
- Unidades siempre habladas: `litro(s)`, `vuelta(s)`, `segundo(s)`, `minuto(s)`.
- Sin nombres de pilotos hablados en v1 (requiere TTS dinámico, fuera de alcance §9 del spec).
- Visual puede ser más corto que la voz cuando ayuda la lectura rápida.

### Disponibilidad — leyenda

- **disponible** — `ObservationV1.Player.*` o `FactV1` ya proyectado y con `Capability* == Supported` y `Field.State == Fresh`. Listo para F4 sin trabajo en Telemetry Core.
- **parcial** — existe parte de la señal pero falta derivación, granularidad o tipificación (ej. `fuel.estimatedLapsRemaining` necesita `FuelUsage` derivado aún no proyectado; `penalties.drive_through` necesita tipo de sanción; `position.class_position` necesita posición por clase). Implementable con heurística acotada o esperando un derive pequeño, sin inventar datos.
- **ausente** — no existe en `ObservationV1`/`PayloadV1`/`FactV1`. Requiere que Telemetry Core publique el dominio (ej. daños, lluvia, banderas, rueda desprendida por esquina). Se cataloga para priorizar, no para implementar en F4.

### Estado de los 20 intents migrados

Se conservan tal cual los textos de `internal/engineer/presentation/presentation.go:definitions()` y `catalogs()` (20 intents × 4 locales). En este catálogo aparecen con etiqueta `[migrado]` y con la misma redacción base; la columna de voz coincide hoy con la visual (el TTS futuro usará el mismo `VoiceText` salvo placeholders).

---

## 1. Familia spotter — P0, interrumpe

> Unifica `internal/engineer/spotter` + `builder_spotter` del frame v2 en una sola autoridad. Geometría desde `Player.WorldPosition / LocalVelocity / Orientation` + `Vehicles[].WorldPosition` bajo `CapabilitySpatial`. Es el único módulo especial del motor (D11).

| intent | es (visual · voz) | en (visual · voz) | it (visual · voz) | pt-BR (visual · voz) | tipo | prioridad | TTL | señal canónica + disponibilidad |
|---|---|---|---|---|---|---|---|---|
| `spotter.car_left` [migrado] | Coche a la izquierda · Coche a la izquierda | Car left · Car left | Auto a sinistra · Auto a sinistra | Carro à esquerda · Carro à esquerda | interrumpe | P0 `Spotter` | 3 s | `Vehicles[].WorldPosition + Orientation` (`CapabilitySpatial`) · **disponible** |
| `spotter.car_right` [migrado] | Coche a la derecha · Coche a la derecha | Car right · Car right | Auto a destra · Auto a destra | Carro à direita · Carro à direita | interrumpe | P0 | 3 s | idem · **disponible** |
| `spotter.still_there` [migrado] | Sigue ahí · Sigue ahí | Still there · Still there | È ancora lì · È ancora lì | Ainda está aí · Ainda está aí | interrumpe | P0 | 3 s | idem · **disponible** |
| `spotter.clear_left` [migrado] | Libre por la izquierda · Libre por la izquierda | Clear on the left · Clear on the left | Libero a sinistra · Libero a sinistra | Livre à esquerda · Livre à esquerda | interrumpe | P0 | 3 s | idem · **disponible** |
| `spotter.clear_right` [migrado] | Libre por la derecha · Libre por la derecha | Clear on the right · Clear on the right | Libero a destra · Libero a destra | Livre à direita · Livre à direita | interrumpe | P0 | 3 s | idem · **disponible** |
| `spotter.all_clear` [migrado] | Todo libre · Todo libre | All clear · All clear | Tutto libero · Tutto libero | Tudo livre · Tudo livre | interrumpe | P0 | 3 s | idem · **disponible** |
| `spotter.three_wide` [migrado] | Tres coches en paralelo · Tres coches en paralelo | Three wide · Three wide | Tre auto affiancate · Tre auto affiancate | Três carros lado a lado · Três carros lado a lado | interrumpe | P0 | 3 s | idem (requiere ≥2 vecinos laterales) · **disponible** |

**Nota personalidades (spotter):** Profesional = frases actuales; Cercano = “Sigue a la izquierda” con tono más breve; Exigente = “¡Izquierda!” más imperativo. Misma intent, sin duplicar.

---

## 2. Familia banderas — P1, peligro

> Hoy **ausente** en la observación canónica: no hay campo de bandera/flag en `PayloadV1`. Se cataloga para que F4 no lo prometa y para priorizar el futuro derive desde Telemetry Core si LMU expone la señal.

| intent | es (visual · voz) | en (visual · voz) | it (visual · voz) | pt-BR (visual · voz) | tipo | prioridad | TTL | señal canónica + disponibilidad |
|---|---|---|---|---|---|---|---|---|
| `flags.yellow_ahead` | Amarilla delante · Bandera amarilla delante, precaución | Yellow ahead · Yellow flag ahead, caution | Gialla davanti · Bandiera gialla davanti, attenzione | Amarela à frente · Bandeira amarela à frente, atenção | interrumpe | P1 `RaceControl` | 10 s | `FlagState` (no existe en `ObservationV1`) · **ausente** |
| `flags.yellow_clear` | Pista libre · Pista libre, amarilla retirada | Track clear · Track clear, yellow withdrawn | Pista libera · Pista libera, gialla rientrata | Pista livre · Pista livre, amarela recolhida | informa | P1 | 10 s | idem · **ausente** |
| `flags.blue_flag` | Bandera azul · Bandera azul, deja pasar | Blue flag · Blue flag, let them through | Bandiera blu · Bandiera blu, lascia passare | Bandeira azul · Bandeira azul, deixe passar | informa | P1 | 8 s | idem (requiere delta de líder + posición) · **ausente** |

**Nota personalidades:** Profesional = “Bandera amarilla delante”; Cercano = “Amarilla delante, cuidado”; Exigente = “¡Amarilla! Levanta”.

---

## 3. Familia fuel — P2, recurso crítico

> Señales disponibles: `Player.FuelLiters` + `Player.FuelCapacity` (`CapabilityFuel`). `EstimatedLapsRemaining` no está proyectado aún: se deriva de `FuelLiters` + `derive.FuelUsage.PerLap` (ventana 3 vueltas, `internal/telemetry/derive/fuel.go`), hoy **parcial**.

| intent | es (visual · voz) | en (visual · voz) | it (visual · voz) | pt-BR (visual · voz) | tipo | prioridad | TTL | señal canónica + disponibilidad |
|---|---|---|---|---|---|---|---|---|
| `fuel.low_half_tank` [migrado] | Queda medio depósito · Queda medio depósito | Half a tank remaining · Half a tank remaining | Rimane metà serbatoio · Rimane metà serbatoio | Resta meio tanque · Resta meio tanque | informa | P2 `FailureResource` | 30 s | `FuelLiters / FuelCapacity` (ratio ≤0,5) · **disponible** |
| `fuel.low_2l` [migrado] | Quedan dos litros · Quedan dos litros | Two litres remaining · Two litres remaining | Rimangono due litri · Rimangono due litri | Restam dois litros · Restam dois litros | informa | P2 | 25 s | `FuelLiters ≤ 2.0` · **disponible** |
| `fuel.low_1l` [migrado] | Queda un litro · Queda un litro | One litre remaining · One litre remaining | Rimane un litro · Rimane un litro | Resta um litro · Resta um litro | informa | P2 | 20 s | `FuelLiters ≤ 1.0` · **disponible** |
| `fuel.laps_remaining_4` [migrado] | Queda combustible para cuatro vueltas · Queda combustible para cuatro vueltas | Four laps of fuel remaining · Four laps of fuel remaining | Carburante per quattro giri · Carburante per quattro giri | Combustível para quatro voltas · Combustível para quatro voltas | informa | P2 | 30 s | `FuelLiters` + `FuelUsage.PerLap` estimado · **parcial** |
| `fuel.laps_remaining_3` [migrado] | Queda combustible para tres vueltas · Queda combustible para tres vueltas | Three laps of fuel remaining · Three laps of fuel remaining | Carburante per tre giri · Carburante per tre giri | Combustível para três voltas · Combustível para três voltas | informa | P2 | 30 s | idem · **parcial** |
| `fuel.laps_remaining_2` [migrado] | Queda combustible para dos vueltas · Queda combustible para dos vueltas | Two laps of fuel remaining · Two laps of fuel remaining | Carburante per due giri · Carburante per due giri | Combustível para duas voltas · Combustível para duas voltas | informa | P2 | 25 s | idem · **parcial** |
| `fuel.laps_remaining_1` [migrado] | Queda combustible para una vuelta · Queda combustible para una vuelta | One lap of fuel remaining · One lap of fuel remaining | Carburante per un giro · Carburante per un giro | Combustível para uma volta · Combustível para uma volta | informa | P2 | 20 s | idem · **parcial** |
| `fuel.for_pit_now` [migrado] | Combustible crítico, entra en boxes · Combustible crítico, entra en boxes | Fuel critical, pit now · Fuel critical, pit now | Carburante critico, rientra ai box · Carburante critico, rientra ai box | Combustível crítico, entre nos boxes · Combustível crítico, entre nos boxes | interrumpe | P2 | 15 s | `FuelLiters` + consumo medio, umbral crítico · **parcial** |
| `fuel.status_on_demand` | Combustible: {n} litros · Combustible, {n} litros, {gap} vueltas estimadas | Fuel: {n} litres · Fuel, {n} litres, {gap} laps estimated | Carburante: {n} litri · Carburante, {n} litri, {gap} giri stimati | Combustível: {n} litros · Combustível, {n} litros, {gap} voltas estimadas | consulta | P3 `Information` | 20 s | `FuelLiters` (+ `FuelUsage` si disponible) · **parcial** |
| `fuel.consumption_report` | Consumo {n} por vuelta · Consumo medio {n} litros por vuelta | Consumption {n} per lap · Average {n} litres per lap | Consumo {n} al giro · Consumo medio {n} litri al giro | Consumo {n} por volta · Consumo médio {n} litros por volta | consulta | P3 | 20 s | `derive.FuelUsage.PerLap` (no proyectado aún) · **parcial** |
| `fuel.pit_window_open` | Ventana de repostaje abierta · Ventana de repostaje abierta, {n} vueltas de autonomía | Pit window open · Pit window open, {n} laps of range | Finestra rifornimento aperta · Finestra rifornimento aperta, {n} giri di autonomia | Janela de reabastecimento aberta · Janela de reabastecimento aberta, {n} voltas de autonomia | informa | P2 | 30 s | `FuelLiters` + `Remaining` + consumo · **parcial** |

**Nota personalidades:** Profesional = “Queda un litro”; Cercano = “Vas justo, queda un litro”; Exigente = “¡Un litro! Entra ya si puedes”. La familia fuel mantiene umbrales en el motor, no en Telemetry Core (boundary §7 del spec).

---

## 4. Familia penalties — P3, carrera

> Disponible: `Player.PenaltyCount` (`CapabilityStandings`). Tipo de sanción (drive-through vs stop-and-go) no está tipificado → **parcial** para intents específicos.

| intent | es (visual · voz) | en (visual · voz) | it (visual · voz) | pt-BR (visual · voz) | tipo | prioridad | TTL | señal canónica + disponibilidad |
|---|---|---|---|---|---|---|---|---|
| `penalties.count_increased` [migrado] | Hay una nueva penalización pendiente · Hay una nueva penalización pendiente | A new penalty is pending · A new penalty is pending | C'è una nuova penalità da scontare · C'è una nuova penalità da scontare | Há uma nova penalização pendente · Há uma nova penalização pendente | informa | P3 `Penalty` | 20 s | `PenaltyCount` incremento vs cursor · **disponible** |
| `penalties.count_on_demand` | Penalizaciones: {n} · Tienes {n} penalizaciones pendientes | Penalties: {n} · You have {n} penalties pending | Penalità: {n} · Hai {n} penalità da scontare | Penalizações: {n} · Você tem {n} penalizações pendentes | consulta | P3 | 15 s | `PenaltyCount` lectura · **disponible** |
| `penalties.drive_through_notice` | Penalización: paso por boxes · Penalización, debes hacer paso por boxes | Penalty: drive through · Penalty, drive through required | Penalità: drive through · Penalità, devi fare un drive through | Penalização: passagem pelos boxes · Penalização, passagem obrigatória pelos boxes | informa | P3 | 20 s | `PenaltyCount` + tipo de sanción (no tipificado) · **parcial** |

**Nota personalidades:** Profesional = “Hay una nueva penalización pendiente”; Cercano = “Te ha caído una sanción”; Exigente = “¡Penalización! Cúmplela cuanto antes”.

---

## 5. Familia laps — P3, carrera

> Disponible: `Player.LapNumber`, `Player.CompletedLaps`, `Player.Sector`, `Player.BestLapTime`, `Player.LastLapTime`, hechos `lap.completed` (`FactV1`).

| intent | es (visual · voz) | en (visual · voz) | it (visual · voz) | pt-BR (visual · voz) | tipo | prioridad | TTL | señal canónica + disponibilidad |
|---|---|---|---|---|---|---|---|---|
| `laps.lap_completed` [migrado] | Vuelta completada · Vuelta completada | Lap completed · Lap completed | Giro completato · Giro completato | Volta concluída · Volta concluída | informa | P3 `Information` | 10 s | `Fact: lap.completed` · **disponible** |
| `laps.personal_best` | Mejor vuelta personal · Mejor vuelta personal, {gap} | Personal best · Personal best, {gap} | Miglior giro personale · Miglior giro personale, {gap} | Melhor volta pessoal · Melhor volta pessoal, {gap} | informa | P3 | 15 s | `LastLapTime < BestLapTime` previo · **disponible** |
| `laps.session_best` | Mejor vuelta de sesión · Mejor vuelta de sesión, {gap} | Session best · Session best, {gap} | Miglior giro della sessione · Miglior giro della sessione, {gap} | Melhor volta da sessão · Melhor volta da sessão, {gap} | informa | P3 | 15 s | `BestLapTime` vs mejor de `Vehicles[].BestLapTime` · **disponible** |
| `laps.sector_time` | Sector {n}: {gap} · Sector {n}, {gap} segundos | Sector {n}: {gap} · Sector {n}, {gap} seconds | Settore {n}: {gap} · Settore {n}, {gap} secondi | Setor {n}: {gap} · Setor {n}, {gap} segundos | informa | P3 | 12 s | `Sector` + `LastLapTime` parcial por sector (estimado) · **parcial** |
| `laps.last_lap_report` | Última vuelta {gap} · Última vuelta, {gap} segundos | Last lap {gap} · Last lap, {gap} seconds | Ultimo giro {gap} · Ultimo giro, {gap} secondi | Última volta {gap} · Última volta, {gap} segundos | consulta | P3 | 12 s | `LastLapTime` · **disponible** |

---

## 6. Familia timings — P3, carrera

> Disponible: `TimeBehindLeader`, `TimeBehindNext`, `RelativeTimeGap`, `RelativeLapDelta` (`CapabilityGaps`). `EstimatedLapTime` disponible para ritmo.

| intent | es (visual · voz) | en (visual · voz) | it (visual · voz) | pt-BR (visual · voz) | tipo | prioridad | TTL | señal canónica + disponibilidad |
|---|---|---|---|---|---|---|---|---|
| `timings.gap_report` [migrado] | Diferencias actualizadas · Diferencias actualizadas | Gaps updated · Gaps updated | Distacchi aggiornati · Distacchi aggiornati | Diferenças atualizadas · Diferenças atualizadas | informa | P3 `Information` | 15 s | `RelativeTimeGap` / `TimeBehindLeader` · **disponible** |
| `timings.gap_ahead` | Delante a {gap} · El de delante está a {gap} segundos | Ahead by {gap} · Car ahead is {gap} seconds ahead | Davanti a {gap} · Quello davanti è a {gap} secondi | À frente a {gap} · Carro à frente a {gap} segundos | informa | P3 | 15 s | `TimeBehindNext` / `RelativeTimeGap` (vecino delante) · **disponible** |
| `timings.gap_behind` | Detrás a {gap} · El de detrás está a {gap} segundos | Behind by {gap} · Car behind is {gap} seconds behind | Dietro a {gap} · Quello dietro è a {gap} secondi | Atrás a {gap} · Carro atrás a {gap} segundos | informa | P3 | 15 s | `RelativeTimeGap` (vecino detrás) · **disponible** |
| `timings.position_gained` | Has ganado una posición · Has ganado una posición, vas {pos}º | Position gained · Position gained, you are P{pos} | Posizione guadagnata · Hai guadagnato una posizione, sei {pos}º | Posição ganha · Ganhou uma posição, está em {pos}º | informa | P3 | 12 s | `Position` decremento vs cursor · **disponible** |
| `timings.position_lost` | Has perdido una posición · Has perdido una posición, vas {pos}º | Position lost · Position lost, you are P{pos} | Posizione persa · Hai perso una posizione, sei {pos}º | Posição perdida · Perdeu uma posição, está em {pos}º | informa | P3 | 12 s | `Position` incremento · **disponible** |
| `timings.leader_pace` | Ritmo de cabeza {gap} · Ritmo de cabeza, {gap} por vuelta | Leader pace {gap} · Leader pace, {gap} per lap | Passo del leader {gap} · Passo del leader, {gap} al giro | Ritmo do líder {gap} · Ritmo do líder, {gap} por volta | consulta | P3 | 15 s | `EstimatedLapTime` del líder vs propio · **disponible** |

---

## 7. Familia pitstops — P2/P3, según criticidad

> Disponible: `Player.InPit`, `Player.PitStopCount` (`CapabilityPit`) + hechos `pit.entered` / `pit.exited`. Ventana estratégica y “crew ready” requieren estado de boxes del sim no proyectado → parcial/ausente.

| intent | es (visual · voz) | en (visual · voz) | it (visual · voz) | pt-BR (visual · voz) | tipo | prioridad | TTL | señal canónica + disponibilidad |
|---|---|---|---|---|---|---|---|---|
| `pitstops.entry` [migrado] | Entrando en boxes · Entrando en boxes | Entering the pits · Entering the pits | Ingresso ai box · Ingresso ai box | Entrando nos boxes · Entrando nos boxes | informa | P3 `Information` | 10 s | `Fact: pit.entered` / `InPit: true` · **disponible** |
| `pitstops.exit` [migrado] | Saliendo de boxes · Saliendo de boxes | Leaving the pits · Leaving the pits | Uscita dai box · Uscita dai box | Saindo dos boxes · Saindo dos boxes | informa | P3 | 10 s | `Fact: pit.exited` / `InPit: false` · **disponible** |
| `pitstops.stop_completed` | Parada completada · Parada completada, {n} paradas en total | Stop completed · Stop completed, {n} stops total | Sosta completata · Sosta completata, {n} soste totali | Parada concluída · Parada concluída, {n} paradas no total | informa | P3 | 12 s | `PitStopCount` incremento · **disponible** |
| `pitstops.window_open` | Ventana de parada abierta · Ventana de parada abierta | Pit window open · Pit window open | Finestra pit aperta · Finestra pit aperta | Janela de parada aberta · Janela de parada aberta | informa | P2 `StrategyUrgent` | 25 s | `Remaining` + `Fuel` + `MaximumLaps` (heurística) · **parcial** |
| `pitstops.crew_ready` | Equipo listo · Equipo listo para tu parada | Crew ready · Crew ready for your stop | Squadra pronta · Squadra pronta per la sosta | Equipe pronta · Equipe pronta para sua parada | informa | P3 | 15 s | Estado de crew del sim (no proyectado) · **ausente** |

---

## 8. Familia damage — P2, recurso crítico (hoy ausente en canónica)

> Auditoría G3 §1: 37 mensajes CC vs 8 eventos Vantare. La observación canónica **no expone daños**: solo existe en el lector privado (`internal/engineer/damage/monitor.go`, no canónico). Familia catalogada para priorizar el futuro dominio `vehicle/damage` en Telemetry Core; no implementable en F4 sin ese dominio. Textos propios, sin copiar carpetas CC.

| intent | es (visual · voz) | en (visual · voz) | it (visual · voz) | pt-BR (visual · voz) | tipo | prioridad | TTL | señal canónica + disponibilidad |
|---|---|---|---|---|---|---|---|---|
| `damage.aero_minor` | Daño aerodinámico leve · Daño aerodinámico leve | Minor aero damage · Minor aero damage | Danno aerodinamico lieve · Danno aerodinamico lieve | Dano aerodinâmico leve · Dano aerodinâmico leve | informa | P2 `FailureResource` | 25 s | Dominio `damage` no proyectado · **ausente** |
| `damage.aero_severe` | Daño aerodinámico grave · Daño aerodinámico grave | Severe aero damage · Severe aero damage | Danno aerodinamico grave · Danno aerodinamico grave | Dano aerodinâmico grave · Dano aerodinâmico grave | informa | P2 | 20 s | idem · **ausente** |
| `damage.suspension_minor` | Suspensión tocada · Suspensión con daño leve | Minor suspension damage · Minor suspension damage | Sospensione danneggiata lieve · Sospensione danneggiata lieve | Suspensão com dano leve · Suspensão com dano leve | informa | P2 | 25 s | idem · **ausente** |
| `damage.suspension_severe` | Suspensión grave · Suspensión con daño grave | Severe suspension damage · Severe suspension damage | Sospensione gravemente danneggiata · Sospensione gravemente danneggiata | Suspensão com dano grave · Suspensão com dano grave | informa | P2 | 20 s | idem · **ausente** |
| `damage.engine_minor` | Motor con daño leve · Motor con daño leve | Minor engine damage · Minor engine damage | Motore con danno lieve · Motore con danno lieve | Motor com dano leve · Motor com dano leve | informa | P2 | 25 s | idem · **ausente** |
| `damage.engine_severe` | Motor con daño grave · Motor con daño grave | Severe engine damage · Severe engine damage | Motore con danno grave · Motore con danno grave | Motor com dano grave · Motor com dano grave | informa | P2 | 15 s | idem · **ausente** |
| `damage.component_busted` | Componente crítico dañado · Componente crítico dañado, revisa el coche | Component failure · Critical component failure, check the car | Componente fuori uso · Componente critico fuori uso, controlla la vettura | Componente com falha crítica · Componente com falha crítica, verifique o carro | interrumpe | P2 | 15 s | idem · **ausente** |
| `damage.detached_part` | Pieza desprendida · Pieza desprendida | Part detached · Part detached | Pezzo staccato · Pezzo staccato | Peça desprendida · Peça desprendida | interrumpe | P2 | 15 s | idem (requiere esquina/rueda) · **ausente** |
| `damage.status_on_demand` | Estado del coche: revisado · Estado del coche, sin daños detectados / daños leves (según lectura) | Car status · Car status, no damage / minor damage | Stato vettura · Stato vettura, nessun danno / danno lieve | Estado do carro · Estado do carro, sem dano / dano leve | consulta | P3 `Information` | 15 s | idem · **ausente** |

**Nota:** pinchazos por esquina, rueda faltante por esquina, vuelco y flujo “¿estás bien?” de CC quedan fuera de v1 por requerir presión de neumáticos / orientación fina no canónica; se reevaluarán si Telemetry Core publica `wheels`/`spatial` con esa granularidad.

---

## 9. Familia position — P3, carrera

> Disponible: `Player.Position`, `CompletedLaps`, `LapDistance`, `Sector` (`CapabilityStandings`). Posición por clase requiere `VehicleClass` + agrupación por clase → parcial.

| intent | es (visual · voz) | en (visual · voz) | it (visual · voz) | pt-BR (visual · voz) | tipo | prioridad | TTL | señal canónica + disponibilidad |
|---|---|---|---|---|---|---|---|---|
| `position.gained` | Has ganado posición, {pos}º · Has ganado posición, ahora {pos}º | Position gained, P{pos} · Position gained, now P{pos} | Posizione guadagnata, {pos}ª · Hai guadagnato una posizione, sei {pos}ª | Posição ganha, {pos}º · Posição ganha, agora {pos}º | informa | P3 `Information` | 12 s | `Position` vs cursor · **disponible** |
| `position.lost` | Has perdido posición, {pos}º · Has perdido posición, ahora {pos}º | Position lost, P{pos} · Position lost, now P{pos} | Posizione persa, {pos}ª · Hai perso una posizione, sei {pos}ª | Posição perdida, {pos}º · Posição perdida, agora {pos}º | informa | P3 | 12 s | idem · **disponible** |
| `position.held` | Mantienes {pos}º · Mantienes posición {pos}º | Holding P{pos} · Holding position P{pos} | Mantieni la {pos}ª · Mantieni la posizione {pos}ª | Mantendo {pos}º · Mantendo posição {pos}º | informa | P3 | 12 s | `Position` estable + readout periódico · **disponible** |
| `position.race_start_grid` | Salida: {pos}º en parrilla · Sales {pos}º en parrilla | Starting P{pos} · Starting from P{pos} on the grid | Partenza {pos}ª · Parti {pos}ª in griglia | Largada em {pos}º · Largando em {pos}º no grid | informa | P3 | 20 s | `Position` en `Fact: session.started` · **disponible** |
| `position.class_position` | {pos}º en tu clase · Vas {pos}º en tu clase | P{pos} in class · You are P{pos} in class | {pos}ª di classe · Sei {pos}ª di classe | {pos}º na classe · Você está em {pos}º na classe | informa | P3 | 15 s | `VehicleClass` + posición filtrada por clase · **parcial** |
| `position.on_demand` | Posición {pos}º · Vas {pos}º, {gap} segundos al líder | Position P{pos} · You are P{pos}, {gap} seconds to leader | Posizione {pos}ª · Sei {pos}ª, {gap} secondi dal leader | Posição {pos}º · Você está em {pos}º, {gap} segundos do líder | consulta | P3 | 12 s | `Position` + `TimeBehindLeader` · **disponible** |

---

## 10. Familia racetime — P3, carrera

> Disponible: `SourceTime`, `EndTime`, `Remaining`, `MaximumLaps` (`CapabilitySession`). Sesiones por tiempo vs por vueltas se distinguen por qué campo está `Fresh`.

| intent | es (visual · voz) | en (visual · voz) | it (visual · voz) | pt-BR (visual · voz) | tipo | prioridad | TTL | señal canónica + disponibilidad |
|---|---|---|---|---|---|---|---|---|
| `racetime.ten_minutes_remaining` | Quedan diez minutos · Quedan diez minutos de sesión | Ten minutes remaining · Ten minutes remaining | Dieci minuti alla fine · Dieci minuti alla fine | Dez minutos restantes · Dez minutos restantes | informa | P3 `Information` | 30 s | `Remaining ≈ 600s` · **disponible** |
| `racetime.five_minutes_remaining` | Quedan cinco minutos · Quedan cinco minutos | Five minutes remaining · Five minutes remaining | Cinque minuti alla fine · Cinque minuti alla fine | Cinco minutos restantes · Cinco minutos restantes | informa | P3 | 30 s | `Remaining ≈ 300s` · **disponible** |
| `racetime.one_minute_remaining` | Queda un minuto · Queda un minuto de sesión | One minute remaining · One minute remaining | Un minuto alla fine · Un minuto alla fine | Um minuto restante · Um minuto restante | informa | P3 | 20 s | `Remaining ≈ 60s` · **disponible** |
| `racetime.halfway_point` | Mitad de carrera · Mitad de carrera superada | Half distance · Half distance reached | Metà gara · Metà gara raggiunta | Metade da prova · Metade da prova alcançada | informa | P3 | 20 s | `Remaining` vs `EndTime` o `CompletedLaps` vs `MaximumLaps` · **disponible** |
| `racetime.laps_remaining` | Quedan {n} vueltas · Quedan {n} vueltas para el final | {n} laps remaining · {n} laps remaining | Mancano {n} giri · Mancano {n} giri alla fine | Faltam {n} voltas · Faltam {n} voltas para o final | informa | P3 | 20 s | `MaximumLaps - CompletedLaps` (sesión por vueltas) · **disponible** si la sesión es por vueltas, **parcial** si es por tiempo |
| `racetime.time_expired` | Tiempo agotado · Tiempo de sesión agotado | Time expired · Session time expired | Tempo scaduto · Tempo di sessione scaduto | Tempo esgotado · Tempo de sessão esgotado | informa | P3 | 15 s | `Remaining ≤ 0` · **disponible** |

---

## 11. Familia sessionend — P3, carrera

> Hechos `session.ended` (`FactV1`) disponibles. Bandera a cuadros no está tipificada como flag; se infiere de `session.ended` + `Remaining`.

| intent | es (visual · voz) | en (visual · voz) | it (visual · voz) | pt-BR (visual · voz) | tipo | prioridad | TTL | señal canónica + disponibilidad |
|---|---|---|---|---|---|---|---|---|
| `sessionend.checkered_flag` | Bandera a cuadros · Bandera a cuadros, final de sesión | Checkered flag · Checkered flag, session finished | Bandiera a scacchi · Bandiera a scacchi, sessione terminata | Bandeira quadriculada · Bandeira quadriculada, sessão encerrada | informa | P3 `Information` | 20 s | `Fact: session.ended` (+ `Remaining`) · **disponible** |
| `sessionend.session_ended` | Sesión terminada · Sesión terminada | Session ended · Session ended | Sessione terminata · Sessione terminata | Sessão encerrada · Sessão encerrada | informa | P3 | 20 s | `Fact: session.ended` · **disponible** |

---

## 12. Familia conditions — hoy ausente (G3 §2)

> Auditoría G3 §2: 30 mensajes CC vs 4 eventos Vantare heurísticos. LMU no expone lluvia ni temperaturas de forma fiable en la proyección canónica; el dominio `weather` existe en `schema/weather` pero no está alimentado. Se cataloga como referencia para no prometerlo en F4.

| intent | es (visual · voz) | en (visual · voz) | it (visual · voz) | pt-BR (visual · voz) | tipo | prioridad | TTL | señal canónica + disponibilidad |
|---|---|---|---|---|---|---|---|---|
| `conditions.track_temp_high` | Pista muy caliente · Temperatura de pista alta, {n} grados | Track very hot · Track temperature high, {n} degrees | Pista molto calda · Temperatura pista alta, {n} gradi | Pista muito quente · Temperatura da pista alta, {n} graus | informa | P3 | 30 s | `weather.Temperature` pista · **ausente** |
| `conditions.track_freezing` | Pista fría · Temperatura de pista baja, {n} grados | Track cold · Track temperature low, {n} degrees | Pista fredda · Temperatura pista bassa, {n} gradi | Pista fria · Temperatura da pista baixa, {n} graus | informa | P3 | 30 s | idem · **ausente** |
| `conditions.rain_started` | Lluvia detectada · Lluvia detectada en pista | Rain detected · Rain detected on track | Pioggia rilevata · Pioggia rilevata in pista | Chuva detectada · Chuva detectada na pista | informa | P1 `RaceControl` | 30 s | `weather.RainDensity` (LMU no expone) · **ausente** |
| `conditions.rain_stopped` | Lluvia parada · La lluvia ha parado | Rain stopped · Rain has stopped | Pioggia cessata · La pioggia è cessata | Chuva parou · A chuva parou | informa | P1 | 30 s | idem · **ausente** |

**Nota:** granularidad por intensidad (drizzle/light/mid/heavy/storm), tendencia `increasing/decreasing` y forecasts ACC/PCars quedan fuera de v1; LMU no expone la señal base.

---

## 13. Familia strategy / motivación — P3, valor informativo (cooldowns largos)

> Sin señal dedicada; se apoya en gaps/posición/tiempo restante. Es la capa de “carrera > rendimiento/motivación” del orden del spec. Se mantiene corta en v1 para no anticipar el segundo productor Strategy (D8) que hablará por el mismo bus.

| intent | es (visual · voz) | en (visual · voz) | it (visual · voz) | pt-BR (visual · voz) | tipo | prioridad | TTL | señal canónica + disponibilidad |
|---|---|---|---|---|---|---|---|---|
| `strategy.advice_overtake` | Oportunidad de adelantar · Tienes ritmo para adelantar, ataca cuando veas hueco | Chance to overtake · You have pace to overtake, go when you see a gap | Occasione di sorpasso · Hai il passo per sorpassare, attacca quando vedi lo spazio | Chance de ultrapassar · Você tem ritmo para ultrapassar, ataque quando houver espaço | informa | P3 | 20 s | `RelativeTimeGap` + `EstimatedLapTime` vs rival · **parcial** (heurística de ritmo, no estrategia completa) |
| `strategy.advice_defend` | Defiende posición · Defiende posición, el de detrás está a {gap} | Defend position · Defend position, car behind is {gap} behind | Difendi la posizione · Difendi la posizione, quello dietro è a {gap} | Defenda posição · Defenda posição, o carro atrás está a {gap} | informa | P3 | 20 s | `RelativeTimeGap` detrás < 0,8 s · **disponible** (heurística simple) |
| `strategy.encouragement` | Buen ritmo, sigue así · Buen ritmo, sigue así | Good pace, keep it up · Good pace, keep it up | Bel passo, continua così · Bel passo, continua così | Bom ritmo, continue assim · Bom ritmo, continue assim | informa | P3 | 15 s | `LastLapTime` vs `BestLapTime` estable · **parcial** |

**Nota personalidades (global):** Profesional = “Buen ritmo, sigue así”; Cercano = “Vas muy bien, sigue así”; Exigente = “No levantes, mantén el ritmo”. La personalidad no crea intents nuevos; el resolver elige variante de entonación/prefijo sobre el mismo `VoiceText`.

---

## 14. Resumen cuantitativo

| Familia | Mensajes | Disponibles | Parciales | Ausentes |
|---|---|---|---|---|
| spotter | 7 | 7 | 0 | 0 |
| banderas | 3 | 0 | 0 | 3 |
| fuel | 11 | 3 | 8 | 0 |
| penalties | 3 | 2 | 1 | 0 |
| laps | 5 | 4 | 1 | 0 |
| timings | 6 | 6 | 0 | 0 |
| pitstops | 5 | 3 | 1 | 1 |
| damage | 9 | 0 | 0 | 9 |
| position | 6 | 5 | 1 | 0 |
| racetime | 6 | 5 | 1 | 0 |
| sessionend | 2 | 2 | 0 | 0 |
| conditions | 4 | 0 | 0 | 4 |
| strategy/motivación | 3 | 1 | 2 | 0 |
| **Total** | **70** | **38** | **14** | **18** |

- **Disponible hoy:** 38 mensajes (54 %) — implementables en F4 sin tocar Telemetry Core.
- **Parcial:** 14 mensajes (20 %) — requieren derivar `FuelUsage`, tipificar sanción/clase o pequeña heurística; no bloquean el bus.
- **Ausente:** 18 mensajes (26 %) — requieren nuevo dominio canónico (`damage`, `weather`, `flags`, `crew`). Catalogados para priorizar, no para prometer en F4.
- Los **20 intents migrados** están incluidos tal cual (7 spotter + 8 fuel + 1 penalties + 1 laps + 1 timings + 2 pitstops).

---

## 15. Orden de implementación propuesto (por disponibilidad + valor en carrera)

> Criterio: señal disponible primero; dentro de lo disponible, valor en carrera (seguridad > recurso crítico > carrera). Lo ausente queda al final y solo avanza cuando Telemetry Core publique el dominio.

### Fase F4 — primer corte (spotter + base disponible, 3 familias nuevas mínimo)

1. **Spotter (7)** — P0, carril rápido <150 ms, clips WAV. Señal `CapabilitySpatial` ya disponible. Es el gate de F3 y el único módulo con geometría propia.
2. **Fuel crítico (8 migrados + `pit_window_open` parcial)** — P2. `FuelLiters/Capacity` disponible; `laps_remaining_*` y `for_pit_now` pasan a **parcial** hasta proyectar `FuelUsage.PerLap` (derive ya existe, falta proyección). Alto valor: evita abandono por combustible.
3. **Pitstops base (`entry/exit/stop_completed`)** — `InPit` + hechos disponibles. Cierra el loop fuel→pit.

### Siguiente oleada (alto valor, señal disponible)

4. **Penalties (`count_increased` + `count_on_demand`)** — `PenaltyCount` disponible; neutral y sin inventar tipos.
5. **Laps (`lap_completed` + `personal_best` + `session_best` + `last_lap_report`)** — `LapNumber/BestLapTime/LastLapTime` disponibles; feedback inmediato de ritmo.
6. **Timings (`gap_report` + `gap_ahead/behind` + `position_gained/lost`)** — `RelativeTimeGap/TimeBehindLeader` disponibles; núcleo de carrera.
7. **Position (`gained/lost/held/on_demand/race_start_grid`)** — `Position` disponible.
8. **Racetime (`ten/five/one_minute_remaining` + `halfway` + `lapses...`)** — `Remaining/MaximumLaps` disponibles.

### Oleada parcial (pequeño trabajo en derive/proyección, sin dominio nuevo)

9. **`fuel.status_on_demand` + `consumption_report`** — requiere proyectar `FuelUsage` (código ya en `derive/fuel.go`).
10. **`position.class_position`** — requiere agrupar por `VehicleClass`.
11. **`strategy.advice_defend/encouragement`** — heurísticas sobre gaps/tiempos ya disponibles.
12. **`timings.leader_pace` / `sector_time`** — `EstimatedLapTime`/`Sector` parcial por granularidad.

### Futuro — requiere dominio canónico nuevo (no F4)

13. **Banderas (3)** — necesita `FlagState` en Telemetry Core; depende de que LMU exponga la señal.
14. **Damage (9)** — necesita dominio `damage` canónico; hoy solo lector privado. Incluye `detached_part` por esquina, pinchazos y vuelco si se publican `wheels`/`spatial` finos.
15. **Conditions (4 + granularidad futura)** — necesita `weather` alimentado (temperaturas, `RainDensity`); LMU hoy no expone lluvia.
16. **`pitstops.crew_ready` + `strategy.advice_overtake` completo** — requiere estado de boxes del sim y Strategy como segundo productor del bus (D8).

### Dependencias explícitas

- **F1 (radio bus):** debe estar mergeado antes de F4; este catálogo es su contrato de intents.
- **F2 (precacheo Kokoro):** consume este catálogo cerrado; cualquier cambio de texto/locales ⇒ regeneración de audio. A2 (escucha perceptual de Isaac) gatea la voz.
- **Telemetry Core:** los 18 ausentes y 14 parciales deben esperar a que el dominio suba a canónica; no se “simulan” en el motor.

---

## 16. Referencias

- Spec rework: `docs/engineer/rework-spec-referencia.md` (copia de referencia F0; el canónico lo commitea F1) — D1-D11, A1-A5, §5 catálogo.
- Auditoría CrewChief: `docs/engineer/audits/g3-parity-audit.md` — inventario 37 damage / 30 conditions / pit REST / commands.
- Intents actuales: `internal/engineer/presentation/presentation.go:definitions()` y `catalogs()` — 20 intents × 4 locales.
- Observación canónica: `internal/telemetry/projection/engineer/{v1.go, adapter.go, contract.go}` — `ObservationV1`, `Manifest`, `CapabilitySession/Standings/Controls/Pit/Fuel/Gaps/Spatial`, `FactV1`.
- Schema: `internal/telemetry/schema/{types.go, energy, session, standings, spatial, weather, wheels}`.
- Presentación: `docs/engineer/presentation-contract.md`.

---

*Documento generado para PR draft `ISA-714: catálogo v1 del Ingeniero (F0 rework)` → `nightly`. No modifica código ni el checkout principal.*
