# ISA-372 / F10 — Capabilities extremo a extremo, fusion compartida y driver sintético SimX

Fecha: 2026-08-20.

Rama: `vantareapp/isa-372-tc-f10-capabilities-multisim`.

Base: `tc-integration@74e1a5a6f7ee925df0eac4daa9dabe94db0fd85c` (F0–F8 lote 1 + F11).

## Resultado

Un simulador nuevo entra sin tocar un widget, y su degradación se declara en vez
de aparecer como un hueco silencioso. Cinco fugas concretas del análisis
multi-sim quedan cerradas, la fusión deja de ser privada del driver LMU y el
composition root deja de estar instanciado sobre el tipo de observación de LMU.

**El diff de esta rama no contiene ningún archivo bajo `frontend/` ni bajo
`internal/telemetry/projection/overlayv2/`.** Es la demostración central de la
fase y está asertada en `TestBranchDiffContainsNoFrontendFile`.

## 1. Fugas cerradas (antes / después)

| # | Fuga (04-multisim-model §1.3) | Antes | Después |
| --- | --- | --- | --- |
| 9 | Manifiesto de Engineer hardcodeado | `telemetry_core_runtime.go:170-177` construía siete `CapabilitySupported` literales sin preguntar al driver | `engineerCapabilities(set)` lo deriva de la declaración del driver activo (`internal/app/telemetry_capabilities.go`). Con LMU sale idéntico; con SimX, `spatial` sale `Unsupported` |
| 9b | Composition root sobre el tipo de LMU | `manager *telemetrycore.DriverManager[lmu.Observation]`, `mapper *lmu.BatchMapper` (`runtime:117-118`) | Un solo campo `simulator telemetrycore.SimulatorRuntime`, con el tipo de observación borrado (`internal/telemetry/core/registry.go`) |
| 9c | Sink y clasificación de errores en dialecto LMU | `WriteObservation(ctx, observation lmu.Observation)` y `lmu.IsUnmappableFrame(err)` (`runtime:612, :627`) | El puente de observaciones vive en `core` y recibe el predicado por inyección; el runtime solo cuenta (`recordRejectedObservation`) |
| — | Fusión privada del driver | `drivers/lmu/fusion.go`: dos slots fijos, `ruleFor` con búsqueda lineal y `panic("LMU authority rule is missing")` | `internal/telemetry/fusion`: N slots abiertos, índice por `SignalID`, `ErrRuleMissing` en vez de `panic` |
| — | Capabilities implícitas | Tres nociones incompatibles y ninguna conectada; Overlay v2 inferí­a soporte del canal de adquisición | `internal/telemetry/capability`: `Supported` (compilado), `Available` (por sesión) y `Modes` (cómo se resolvió), con `spatial.longitudinal` y `spatial.lateral` separadas |

`ruleFor` sigue existiendo como fachada del driver LMU, pero ya no puede
entrar en pánico: un signal no cubierto degrada a una regla sin fuente y el
campo se reporta `missing`.

## 2. Contratos

### `internal/telemetry/fusion`

```go
type SlotID string                       // abierto: "shared-memory", "rest", "synthetic", …
type Candidate struct{ Slot SlotID; TTL time.Duration }
type Rule struct{ Signal catalog.SignalID; Sources []Candidate; Equivalent bool }

func NewMatrix(rules []Rule) (*Matrix, error)   // rechaza duplicados y reglas sin fuente
func (*Matrix) Lookup(catalog.SignalID) (Rule, error)   // ErrRuleMissing, nunca panic

func Choose[T comparable](elapsed, Rule, *Ledger, ...Input[T]) schema.Field[T]
func ChooseFunc[T comparable](…, differ func(left, right Input[T]) bool, …)
type Slots[T any]                        // 1, 2 o N slots con reloj monotónico
```

Orden de selección, idéntico al que tenía LMU y ahora generalizado a N fuentes:
preferida fresca → alternativas frescas en orden → preferida stale →
alternativas stale → preferida con valor → alternativas con valor → `missing`.
Una regla no equivalente nunca cae a otra fuente.

El driver LMU conserva su API pública (`AuthorityRule`, `FieldDecision`,
`ConflictDiagnostic`, `AuthorityMatrix`, `MatrixVersion = 5`) como fachada
delgada. Por eso `drivers/lmu/fusion_test.go` migra íntegro: los mismos casos y
los mismos goldens siguen ejecutándose sin una sola modificación, que es la
prueba más fuerte de que la promoción no cambió el comportamiento. Los tests de
N slots (1/2/3), TTL por slot, conflictos acotados e índice sin panic viven en
`internal/telemetry/fusion/fusion_test.go`.

### `internal/telemetry/capability`

```go
type Declaration struct{ Driver driver.ID; Supported []ID; Modes Modes }
type Presence map[ID]Quality            // evidencia de la sesión, la rellena el runtime
func Resolve(Declaration, Presence) (Set, error)

type Modes struct {
	Spatial         SpatialMode   // xyz | xy | lap-distance | none
	DeltaReferences []string
	Standings       StandingsMode // official | reconstructed | none
	Gaps            GapsMode      // official | estimated | none
}
```

Reglas duras: `Available` nunca amplía `Supported` (devuelve
`ErrUnsupportedAvailability`), una capability soportada sin evidencia aún es
`missing` y no ausente, y una capability no soportada no aparece en `Available`.
`State(id)` distingue `Unsupported` de `Unknown`, que es exactamente lo que un
manifiesto de Engineer necesita.

## 3. La prueba 12.5

`TestSimXStartsWithoutTouchingWidgets` arranca el runtime con SimX registrado
tras el flag `TelemetrySimXDriver`, alimenta 400 frames producidos por el driver
sintético y su mapper reales, y verifica sobre el `OverlayFrame v2` publicado:

- `session.track` = `SimX Proving Ground`, poblado.
- 12 filas de standings con posición e identidad.
- Instrumentos del jugador (velocidad, marcha) poblados.
- `capabilities.supported` no contiene `spatial.longitudinal`,
  `spatial.lateral`, `spotter`, `weather` ni `delta`, y `capabilities.available`
  no los reporta.
- `spotter.mode = "none"`.

Y sobre la declaración del composition root, que es la autoridad:
`standings` y `spatial.longitudinal` soportadas; `spatial.lateral`, `spotter` y
`weather` explícitamente no soportadas; modos `spatial = lap-distance` y
`gaps = estimated`.

Archivos del diff de la rama (28, ninguno bajo `frontend/`):

```
internal/app/telemetry_capabilities.go            internal/telemetry/capability/capability.go
internal/app/telemetry_capabilities_test.go       internal/telemetry/capability/capability_test.go
internal/app/telemetry_core_hardening_test.go     internal/telemetry/core/registry.go
internal/app/telemetry_core_runtime.go            internal/telemetry/drivers/lmu/capabilities.go
internal/app/telemetry_core_strategy_test.go      internal/telemetry/drivers/lmu/driver.go
internal/app/telemetry_simulators.go              internal/telemetry/drivers/lmu/fusion.go
internal/app/telemetry_simulators_test.go         internal/telemetry/drivers/simx/*.go (8)
internal/app/telemetry_simx_proof_test.go         internal/telemetry/fusion/{fusion,slots,fusion_test}.go
internal/app/no_product_mock_test.go              internal/telemetry/architecture_test.go
                                                  internal/telemetry/wiring_guard_test.go
```

Otras aserciones de la fase:

- `TestSpotterFamilyDisabledWhenLateralUnsupported`: el manifiesto de Engineer
  marca `spatial` como `Unsupported` con SimX y `Supported` con LMU. El
  mecanismo de apagado (`ReasonCapabilityUnavailable`, `messagepolicy/contract.go:89`)
  ya existía; lo que faltaba era que alguien le dijera la verdad.
- `TestDeltaFallbackIsResolvedInGoAndDeclared`: SimX no declara `personal-best`
  (exige delta nativo) y LMU sí.
- `TestAuthorityMatrixIsExhaustiveBySignalID`: ninguna matriz repite señal y
  ninguna búsqueda alcanza un panic.
- `TestEngineerManifestIsDerivedFromActiveDriver`: **verificado en rojo** contra
  la versión hardcodeada antes del cambio (`spatial state = 1, want unsupported`).
- `TestCompositionRootAcceptsAnySimulatorRegistration` y
  `TestTelemetryRuntimeSourceNamesNoConcreteDriver`.

## 4. SimX

`internal/telemetry/drivers/simx/` (≈700 líneas de producción, sin fixtures):
fuente sintética determinista en memoria a 50 Hz simulados con reloj y pacer
inyectados, 12 coches, jugador en el slot 0, standings oficiales, combustible y
telemetría del jugador. Sin posición mundial de rivales, sin orientación, sin
meteorología y sin delta nativo: esas señales **no existen en su `Observation`**,
así que no pueden confundirse con un cero.

La fusión de SimX son 55 líneas: una tabla de reglas de un solo slot sobre el
paquete compartido. Con la arquitectura anterior habrían sido ~200 líneas de
maquinaria duplicada, tal como estimaba §9.1 del análisis.

Registro: `SimXTelemetrySimulator(simx.Config{})`, seleccionado solo cuando
`TelemetryCoreRuntimeConfig.TelemetrySimXDriver` apunta a `true`. Apagado por
defecto; un `Simulator` explícito siempre gana.

## 5. Huecos documentados

1. **El builder de Overlay v2 sigue expandiendo canal → capabilities.**
   `overlayv2/builder_player.go:159-175` convierte `"shared-memory"` en las
   nueve capabilities de producto. Ese archivo es propiedad del lote 2a de F8 y
   no se toca aquí. El runtime alimenta `SourceContextV2.DescriptorCapabilities`
   con **los dos vocabularios**: los canales de adquisición que el builder
   consume hoy (por eso el frame de LMU es idéntico) y los ids de capability
   declarados por el driver. En cuanto el propietario de Overlay v2 lea el
   segundo vocabulario, `capabilities.supported/available/modes` pasan a ser
   verdad declarada para cualquier simulador sin más cambios aquí.
2. **La vista de fuel de Overlay v2 es un stub** (`cadence.go:267`) y devuelve
   `missing` para cualquier driver, LMU incluido. El test de la prueba 12.5
   verifica la capability declarada y el estado canónico, no la vista.
3. **El builder de delta de Overlay v2** pertenece al mismo lote. El test de
   fallback cubre la declaración que lo alimentará, sin `Skip` silencioso.
4. **Fugas cosméticas 1–8 del §1.3** (comentarios y rangos "demostrados con
   LMU" en `schema/` y `catalog/`) siguen abiertas: tocar el catálogo obliga a
   `contract-gen` y a los goldens, y no cabía en esta fase sin mezclar alcances.
5. **`internal/engineer/lmu.ExtendedReader`** (fuga 9d) sigue siendo un segundo
   lector de LMU fuera del driver. Fuera del alcance de F10.

## 6. Qué falta para un simulador real

- **ACC** es el caso que valida la fusión nueva de verdad: dos fuentes reales
  (shared memory + broadcasting UDP) con frecuencias distintas. La matriz de
  autoridad se declara igual que la de LMU y el store de N slots ya lo soporta;
  lo que falta es el parseo y la identidad.
- **iRacing** ejercita la degradación: sin XYZ de rivales, su declaración sería
  la de SimX más `weather`, y el Spotter lateral se apagaría por contrato.
- Ambos necesitan dos señales de anillo 1 en el catálogo
  (`standings.lap_distance_pct`, `session.track_length_meters`) o que el driver
  normalice a metros, que es lo que hace SimX y es preferible.

## 7. Gates

Por commit: `go build ./...` (ignorando `frontend/embed.go` sin `dist`),
`go vet ./internal/telemetry/... ./internal/app/...` (solo los tres avisos
preexistentes de `unsafe.Pointer`), `go test ./internal/telemetry/...
./internal/app/... ./cmd/... -count=1`, `go run ./tools/telemetry-contract-gen
-check` y `git diff --check`. Todos verdes.

Fallos preexistentes no relacionados, reproducidos también en la base:
`internal/app/launcher.TestDiscoverIconsSmoke` y `cmd/vantare [setup failed]`
por `frontend/dist` ausente. `recording/sqlite.TestCoordinatorWithSQLiteDrains…`
falla de forma intermitente bajo carga paralela y pasa aislado.

Goldens v1/v2, replay parity y `contract-gen -check` intactos: no se tocó
ningún tipo wire.

Sin push, PR, merge ni promoción.
