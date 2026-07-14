# Prealpha Gate — Vantare Ingeniero Go

> **Estado:** activo desde 2026-06-27 (corregido tras auditoría 2026-06-27).
> **Adaptado de:** Vantare Ingeniero Go original
> (`docs/testing/prealpha-gate.md`).
> **Estado real del worktree:** ver
> [`INDEX.md`](../INDEX.md) § 5 antes de evaluar estos criterios.

Prealpha puede cerrarse cuando **todos** los criterios siguientes son
verificables:

## 1. Criterios verificables

### 1.1 Build y tests

- [ ] `scripts/verify-prealpha.ps1` pasa en limpio (cero output de
      error).
- [ ] `go test ./...` verde, incluyendo los tests de spotter,
      replay, audio y runtime.

### 1.2 Geometría spotter (LMU-01, LMU-02, LMU-03)

- [ ] LMU mock debug imprime geometría con `Row2`, `yaw`,
      `alignedX`, `alignedZ`, `side`, `inOverlap` (con
      `go run ./cmd/lmu-debug -mock -once`).
- [ ] Al menos **una sesión LMU real** grabada a JSONL con
      ≥3 minutos de tráfico donde se observa un coche claramente a
      izquierda, derecha y en curva.
- [ ] Spotter left/right geometry sigue convención LMU/rFactor
      documentada en
      [`architecture/spotter-geometry-findings.md`](../architecture/spotter-geometry-findings.md).
- [ ] Bugs conocidos del spotter tracked en
      [`testing/spotter-bug-log.md`](spotter-bug-log.md) y resueltos
      o aceptados como riesgo.

### 1.3 Replay JSONL (LMU-37)

- [ ] Replay fixtures cubren left, right, all clear, three-wide
      bajo `internal/engineer/replay/testdata/`.
- [ ] Cada fixture tiene ≥5 frames reproducibles desde disco.
- [ ] Test `go test ./internal/engineer/replay -v` reproduce los
      fixtures sin mensajes stale.

### 1.4 Audio queue y stale validation

- [ ] `cmd/spotter-debug` (NO `cmd/lmu-debug -jsonl`) exporta por
      oponente
      `alignedX/alignedZ/side/inOverlap/rejectReason`.
      > **Nota auditoría 2026-06-27:** el flag `-jsonl` citado en
      > la versión previa de este doc no existe en
      > `cmd/lmu-debug/main.go`. Se sustituye por un binario nuevo
      > `cmd/spotter-debug`. Ver `current-plan.md` § 6 Tarea 1.
- [ ] `ValidityRule` añadido a `audio.Message` y
      `Runtime.IsMessageStillValid` invocado antes de `Enqueue`.
- [ ] Spotter messages se enquean con expiración y **ningún stale
      playback** en los tests de regresión.
- [ ] Speed gate `minSpotterSpeedMPS=10.0` implementado en
      `Classify` con test `TestClassify_PlayerBelowMinSpeed_NoZones`.

### 1.5 TTS y voz

- [ ] Frases críticas en español presentes en catálogo y resuelven
      a cache keys.
- [ ] TTS engine sintetiza y cachea frases críticas como `.mp3` vía
      Edge TTS.
- [ ] Audio playback module reproduce `.mp3` en Windows.
- [ ] Pre-caching de 7 frases críticas corre en arranque.
- [ ] `internal/tts/` existe y `Engine.SynthOrCache` está
      implementado (estado actual: NO_IMPLEMENTADO, ver
      [`INDEX.md`](../INDEX.md) § 5).

### 1.6 Defaults Locked en pista

- [ ] Defaults Locked verificados en pista al menos en **un
      circuito** (Le Mans, Spa o Monza).
- [ ] Sin contradicción entre `vantare-go-master-plan.md` § 5
      (Defaults Locked) y código (`INDEX.md` § 5).

### 1.7 Voice contract y cambios sin commit

- [ ] Voice contract matriz VC-A01..VC-R04 en verde para los casos
      que aplican al prealpha (VC-A01, VC-A03, VC-A05, VC-A06,
      VC-A13, VC-P01, VC-P06, VC-Q03, VC-Q04, VC-R02, VC-R03).
- [ ] Cambios sin commit del worktree
      (`internal/engineer/lmu/`, `OverlaysLiveAdapter`,
      `/api/engineer/health`) auditados y reconciliados con este
      gate.

## 2. Comando canónico de validación

```powershell
cd C:\Users\isaac\Desktop\Vantare-Ingeniero-Go
.\scripts\verify-prealpha.ps1
```

El script debe ejecutar en orden:

1. `go test ./...`
2. `go run ./cmd/lmu-debug -mock -once`
3. Validar fixtures de replay
4. Verificar TTS cache cuenta ≥7 archivos `.mp3` (cuando
   `internal/tts/` exista)
5. `pnpm --dir frontend test` (placeholder por ahora)
6. `pnpm --dir frontend build`

## 3. Smoke manual obligatorio

Sin el LMU abierto, el comando mínimo es:

```powershell
go run ./cmd/lmu-debug -mock -once
```

Esperado:

- Output con `track=Circuit de Barcelona` (o similar mock).
- Una línea por frame con yaw, Row2, vehículos.
- Sin panic.

Con LMU abierto, el comando mínimo es:

```powershell
go run ./cmd/spotter-debug -mock -out logs/spotter-verification.jsonl
```

> **CORRECCIÓN auditoría 2026-06-27:** este comando usa el nuevo
> binario `cmd/spotter-debug`, no `-jsonl` en `cmd/lmu-debug` (que
> no existe).

Durante ≥3 minutos, conducir con coches cerca. Verificar:

- Spotter audible sin parpadeo `car_right → clear_right → car_right`
  cuando el coche sigue al lado.
- `clear_left/right` no audible cuando el lado reaparece antes del
  delay.
- JSONL explica cada decisión con
  `alignedX/alignedZ/side/inOverlap/rejectReason`.

## 4. Cierre y promoción a alpha 1

Cuando todos los criterios pasan:

1. Commit de cierre `chore: close prealpha gate`.
2. Tag `v0.1.0-prealpha`.
3. Actualizar [`current-plan.md`](../current-plan.md) a "alpha 1
   activo".
4. Crear mini-plan para alpha 1 siguiendo orden de
   [`architecture/crewchief-parity.md`](../architecture/crewchief-parity.md) § 11 y 12
   (race-control + core race).

## 5. Lo que NO se exige para cerrar prealpha

Race-control modules (flags, penalties, damage, fuel, laps, session
end, push now, pit stops). Esos son alpha 1.

TTS provider cloud premium (Gemini). Es beta.

Voice clone. Es 1.0.

iRacing, AC, AC EVO. Es 1.0/1.1.

Pit Manager LMU REST write. Es alpha 3.

Suite Go overlay opcional. Es 1.1.

Multiclass warnings, tyre monitor, engine monitor. Es alpha 2.

## 6. Cambios respecto a la versión previa

- Sustituido `cmd/lmu-debug -jsonl` por `cmd/spotter-debug` (flag
  `-jsonl` no existía en `cmd/lmu-debug`; ver
  [`architecture/crewchief-parity-audit.md`](../architecture/crewchief-parity-audit.md)
  § B.1).
- Añadido criterio § 1.4 sobre `ValidityRule` y
  `minSpotterSpeedMPS` (eran `GAP` no declarados).
- Añadido criterio § 1.7 sobre cambios sin commit del worktree
  (estado real a 2026-06-27).
