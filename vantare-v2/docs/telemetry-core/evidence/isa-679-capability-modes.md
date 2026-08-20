# ISA-679 — CapabilityModesV2 reales

Antes de esta issue, `frame.capabilities.modes` era literalmente
`{spatial: [], delta: [], standings: "none", gaps: "none"}` para todos los
drivers: F10 dejó el vocabulario definido en `internal/telemetry/capability`,
pero nadie lo resolvía contra la sesión ni lo publicaba. Un consumidor que
quisiera degradar tenía que adivinar por el nombre del simulador.

## Qué se resuelve y dónde

- `capability.ResolveModes(declaration, evidence)` (nuevo, en
  `internal/telemetry/capability/modes.go`) estrecha los modos **declarados**
  por el driver con la **evidencia de la sesión**. Solo puede degradar: ninguna
  cantidad de datos frescos promueve a `xyz` a un driver que no publica
  coordenadas del mundo.
- `overlayCapabilityModes(...)` (en `internal/app/telemetry_capabilities.go`)
  extrae esa evidencia del estado canónico y traduce el resultado al
  vocabulario de wire de Overlay v2.
- El runtime lo pasa por `SourceContextV2.Modes` (campo aditivo) y
  `BuildCapabilities` lo republica.

La resolución vive en la raíz de composición y no en `projection` porque
ADR 0004 prohíbe que `projection` importe `capability` o cualquier driver;
`TestTelemetryProductionImportsFollowADR0004` lo verifica. El builder nunca ve
la declaración ni el id del driver.

## Tabla driver → modos

| Driver | Estado de la sesión | spatial | delta | standings | gaps |
| --- | --- | --- | --- | --- | --- |
| LMU | pleno (posición del mundo fresca) | `["xyz"]` | referencias declaradas con dato (hasta `personal-best`, `session-best`, `previous-lap`) | `official` | `official` |
| LMU | posición del mundo `stale`/ausente, distancia de vuelta viva | `["lap-distance"]` | igual | `official` | `official` |
| LMU | sin posición ni distancia de vuelta | `[]` | igual | `official` | `official` |
| LMU | gaps ausentes o inválidos | — | — | — | `none` |
| LMU | standings ausentes o inválidos | — | — | `none` | — |
| SimX | pleno | `["lap-distance"]` | `session-best`, `previous-lap` con dato (nunca `personal-best`) | `official` | `estimated` |
| Sin driver declarado | cualquiera | `[]` | `[]` | `none` | `none` |

## Reglas de degradación

- **Espacial**: un modo geométrico (`xyz`, `xy`) exige posición del mundo
  `fresh`. Una posición `stale` es una posición que ya se movió, así que cae a
  `lap-distance` si la distancia de vuelta es utilizable (`fresh` o `stale`) y a
  `none` si tampoco lo es. `xy` y `lap-distance` quedan definidos para drivers
  futuros; hoy solo LMU y SimX los ejercitan.
- **Delta**: intersección de las referencias declaradas con las que tienen valor
  utilizable ahora, conservando el orden declarado para que el fallback del
  consumidor sea determinista. La lista sale de
  `overlayv2.AvailableDeltaReferences`, la misma autoridad que usa la vista de
  delta, así que ambas no pueden discrepar.
- **Standings y gaps**: se conserva el modo declarado mientras la evidencia sea
  utilizable; se apaga a `none` cuando falta o es inválida. La distinción
  `official` / `estimated` proviene hoy de la declaración del driver, no de una
  señal por sesión: es la limitación conocida de esta entrega.
- Una capacidad no soportada por el driver nunca publica modo: sus modos se
  silencian aunque la declaración los traiga escritos.

## Verificación

- `internal/telemetry/capability/modes_test.go`: LMU pleno, LMU degradado
  (spatial `stale` → cae a `lap-distance`; sin nada → `none`), SimX (no se
  promociona con posiciones frescas, `personal-best` excluido por declaración,
  `gaps: estimated`), y modos silenciados para capacidades no soportadas.
- `TestSimXStartsWithoutTouchingWidgets` (ampliado) asegura ahora los modos
  degradados de SimX **en el frame publicado**, extremo a extremo.
- Centinelas de Overlay v2 verdes:
  `TestCachedProjectorMatchesProjectV2ByteForByte` y
  `TestFrameV2SyntheticFullUnder64KiBWith104Vehicles`.
- Goldens v2 regenerados (`overlay_v2_{1,20,44,104}.golden.json`): el único
  cambio es el bloque `modes`, que pasa de vacío a
  `spatial: ["xyz"]`, `delta: ["personal-best"]`, `standings/gaps: "official"`.
- `go run ./tools/telemetry-contract-gen -check` sin diff: no se añadió ningún
  tipo nuevo a `frame.go`, así que el contrato TS no cambia.

## Fallo preexistente citado

`TestBranchDiffContainsNoFrontendFile` (en `telemetry_simx_proof_test.go`) es un
centinela de la fase ISA-372 que compara contra
`vantareapp/isa-372-tc-integration` y prohíbe tocar `frontend/` y
`projection/overlayv2/`. Ya falla sobre `nightly` sin ningún cambio de esta
rama: entre esa base y `nightly` hay 711 archivos bajo `frontend/`. No es una
regresión de ISA-679, pero el centinela quedó obsoleto y merece retirada o
reencuadre en una issue propia.
