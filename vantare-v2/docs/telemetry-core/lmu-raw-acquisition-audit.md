# ISA-30 / TC-03A — Inventario raw, fixtures y compatibilidad LMU

Fecha de auditoría: 2026-07-21

Base: ISA-29 `8d12cf0399f1848d873a8268d12e5d3005945830`

Alcance: caracterización y test data; sin cambios de producción.

## Veredicto

La adquisición LMU se puede consolidar sin un segundo acceso a `LMU_Data`: la
aplicación ya abre un único mapping y `EnrichedLMUSource` entrega el mismo buffer
al parser público y al parser de Engineer. El problema real es la duplicación de
parsers/offsets, la falta de una firma de compatibilidad en runtime y dos accesos
auxiliares (`Extended` y `PitInfo`) todavía alojados bajo Engineer.

ISA-31 debe construir el driver alrededor de estas fuentes, pero no debe borrar
ningún parser hasta que ISA-32/33 haya demostrado paridad. Los tres buffers de
Shared Memory y el REST local pertenecen al único LMU Driver.

## Evidencia del entorno

- Ejecutable observado: `Le Mans Ultimate.exe`.
- Versión de archivo y producto: `1.3.0.0`.
- Mapping `LMU_Data`: accesible en lectura, 324.820 bytes.
- Estado observado el 2026-07-21: LMU abierto sin vehículo del jugador; se
  conserva como fixture `menu` sanitizada.
- Baseline focal previo al cambio: `go test ./internal/telemetry/... -count=1`
  PASS.

La versión del ejecutable es evidencia del entorno local. No demuestra por sí
sola que todos los offsets sean compatibles; esa compatibilidad requiere la
firma estructural y los invariantes indicados más abajo.

## Fuentes raw actuales

| Fuente | Nombre / endpoint | Tamaño o ritmo | Implementación actual | Ownership objetivo |
|---|---|---:|---|---|
| Shared Memory principal | `LMU_Data` | 324.820 B; lectura app 60 Hz | `internal/telemetry/lmu`, abierta por `LMUSource` | LMU Driver |
| Parser público | mismo buffer | 60 Hz, emisión 30 Hz | `internal/telemetry/lmu/parser.go` | adapter temporal; retirar tras paridad |
| Parser Engineer | mismo buffer, no segundo mapping | Engineer 60 Hz | `internal/engineer/lmu/parser.go` | adapter temporal; retirar tras paridad |
| Shared Memory Extended | `$rFactor2SMMP_Extended$` | mapping 32.768 B | `internal/engineer/lmu/extended_*` | LMU Driver, canal auxiliar |
| Shared Memory PitInfo | `$rFactor2SMMP_PitInfo$` | mapping 16.384 B | `internal/engineer/lmu/pitinfo_*` | LMU Driver, canal auxiliar |
| REST standings | `/rest/watch/standings` | poll 250 ms, timeout 750 ms, TTL 2 s | `internal/telemetry/lmuapi` + cache app | LMU Driver |
| REST session | `/rest/watch/sessionInfo` | poll 250 ms, timeout 750 ms, TTL 2 s | `internal/telemetry/lmuapi` + cache app | LMU Driver |
| REST teams | `/rest/multiplayer/teams` | bajo demanda | `internal/telemetry/lmuapi` | LMU Driver |
| REST pit menu | `/rest/pitmenu/status` y `/rest/pitmenu/action` | bajo demanda | cliente propio de Pit Manager | comando/consulta del LMU Driver |

El cache REST acepta éxito parcial: standings y session se actualizan de forma
independiente y cada resultado expira a los dos segundos. Esto es preferible a
descartar todo el frame, pero ISA-33 debe expresar freshness/presencia por campo
en lugar de convertir ausencia o expiración en valores cero ambiguos.

## Layout principal confirmado

| Bloque | Offset | Stride/tamaño | Límite |
|---|---:|---:|---:|
| `LMUObjectOut` | 0 | 324.820 B | 1 |
| `ScoringInfo` | 1.632 | 548 B | 1 |
| `VehicleScoring` | 2.192 | 584 B | 104 slots |
| selección jugador | 128.465/128.466 | 1 B cada uno | índice/presencia |
| `VehicleTelemetry` | 128.468 | 1.888 B | 104 slots |
| wheel dentro de telemetry | +152 | 260 B | 4 ruedas |

Estos números coinciden en ambos parsers para el buffer principal. La fixture
de pista demuestra que ambos producen el mismo track, tipo de sesión, número de
vehículos, fase, ID del jugador y número de vehículos tras la sanitización.

## Comparativa de parsers

### Solapamiento real

Ambos leen sesión, selección del jugador, identidad básica, velocidad local,
vehículos, vueltas, pit state y tiempos. Las constantes principales están
duplicadas literalmente. Esto es deuda, pero eliminarlas en TC-03A rompería la
regla de caracterización previa.

### Solo parser público

- Controles filtrados, marcha, RPM, combustible/capacidad.
- Delta nativa y gaps directos.
- Pitstops, penalizaciones, qualification, flag y fuel fraction.
- Modelo `pkg/models` consumido por Overlay/Desktop/OBS.

### Solo parser Engineer

- Posición y orientación del jugador y rivales para Spotter.
- Geometría lateral, track edge y matriz 3x3.
- Temperaturas/desgaste experimentales y wheel fields.
- Lectores auxiliares Extended/PitInfo.
- Modelo interno `internal/engineer/telemetry`.

### Divergencias y riesgos que no se corrigen aquí

1. Engineer convierte `TotalLaps` mediante una lectura `int32` aunque el campo
   documentado y el parser público usan `int16`.
2. Algunos offsets de ruedas siguen marcados `PLACEHOLDER`; no deben emitirse
   como observados hasta validación real.
3. `OilPressureWarningOffset=46` está explícitamente no verificado y apunta a un
   byte unused. No puede habilitar una alerta productiva.
4. Los offsets de temperaturas u8 pueden truncar valores de freno superiores a
   255 °C; no son equivalentes a los doubles del wheel struct.
5. Ambos parsers aceptan floats NaN/Inf estructuralmente. El driver debe marcar
   el campo `invalid`, no propagarlo ni reemplazarlo silenciosamente por cero.
6. `LMU_Data` se mapea con tamaño fijo. Una actualización de LMU puede mantener
   el mapping accesible y aun cambiar layout/semántica; “Open funcionó” no es
   prueba de compatibilidad.

## Política de compatibilidad para ISA-31/32/33

El driver debe clasificar cada canal por separado:

| Situación | Estado requerido | Datos permitidos |
|---|---|---|
| mapping ausente | `detecting` | ninguno; retry cancelable |
| buffer menor al mínimo | `error` incompatible | ninguno |
| firma estructural desconocida | `degraded` incompatible | solo campos validados; diagnóstico explícito |
| player ausente en menú | `live` sin vehículo | sesión/presencia; no es error |
| REST parcial | `live` o `degraded` por canal | Shared Memory continúa; campos REST con freshness propia |
| REST expirado | `degraded` REST | no reutilizar valor como fresh |
| NaN/Inf/rango imposible | campo `invalid` | resto del frame sigue disponible |
| update de juego/firma nueva | `degraded` hasta fixture aprobada | no asumir offsets por similitud |

La firma mínima propuesta es
`source-name/object-size/telemetry-stride/scoring-stride`, acompañada por versión
del ejecutable, invariantes plausibles (`NumVehicles 0..104`, índice 0..103,
fase conocida) y estado de cada canal. No se debe inferir compatibilidad solo de
un número de versión.

## Fixtures y privacidad

### Problema encontrado

`testdata/lmu-fixture.bin` y su JSON históricos contenían el nombre real del
usuario y nombres completos de la sesión. El script histórico volcaba los
324.820 bytes completos sin sanitización. Esa captura no era apta como fixture
compartible.

### Contrato nuevo

- El buffer de salida empieza completamente a cero.
- Solo se copian posiciones numéricas incluidas en la lista blanca auditada.
- Track, vehículo y clase se conservan porque describen el simulador/coche.
- Identidades se reemplazan por `player` y `driver-NNN`.
- Cada manifest incluye estado, procedencia, versión, fingerprint, versión del
  sanitizer y SHA-256 del binario.
- Un test rechaza fragmentos de identidad/rutas personales conocidos y hashes
  que no coinciden.

### Inventario al cierre de TC-03A

| Estado | Evidencia | Resultado |
|---|---|---|
| menú | captura directa 2026-07-21, LMU 1.3.0.0 | fixture sanitizada y test |
| pista | captura legacy real, `gameVersion=13000` | fixture sanitizada y test de paridad |
| boxes | capturas legacy localizadas en refs de checkpoint | pendiente recaptura con flujo nuevo; no importadas por privacidad/procedencia débil |
| garaje | no disponible durante el corte | pendiente; no inventada |

La ausencia de garaje/boxes no se disfraza con mocks. El microplan permite
marcar estados no disponibles como pendientes. ISA-32 debe recogerlos con el
mismo proceso antes de afirmar cobertura completa de estado LMU.

## Reproducción

Tests normales:

```powershell
go test ./internal/telemetry/lmu ./internal/engineer/lmu -count=1
go test ./internal/telemetry/... -count=1
```

Fuzz explícito:

```powershell
go test ./internal/telemetry/lmu -run=^$ -fuzz=FuzzParseNeverPanics -fuzztime=10s
go test ./internal/engineer/lmu -run=^$ -fuzz=FuzzParseEngineerFrameNeverPanics -fuzztime=10s
```

Recaptura de menú, solo con LMU abierto y tras comprobar que no hay vehículo:

```powershell
$env:LMU_CAPTURE_MENU_FIXTURE='1'
go test ./internal/telemetry/lmu -run TestCaptureSanitizedMenuFixture -count=1
Remove-Item Env:\LMU_CAPTURE_MENU_FIXTURE
```

La regeneración de la fixture legacy solo es una operación de mantenimiento:

```powershell
$env:LMU_REGENERATE_FIXTURE='1'
go test ./internal/telemetry/lmu -run TestRegenerateSanitizedFixture -count=1
Remove-Item Env:\LMU_REGENERATE_FIXTURE
```

## Gate para ISA-31

ISA-31 puede empezar después de validación humana de este corte. Debe:

1. abrir/cerrar/reintentar los canales bajo un único lifecycle cancelable;
2. reutilizar un solo mapping `LMU_Data`;
3. publicar diagnósticos por canal y firma;
4. no migrar todavía semántica de campos ni borrar parsers;
5. conservar el fallback de no disponibilidad sin publicar mock como live;
6. dejar Extended/PitInfo bajo ownership del driver aunque su cableado final se
   complete por microcortes posteriores.

## Riesgos restantes

- Faltan fixtures reales nuevas de garaje y boxes.
- La historia Git anterior conserva blobs con PII; este corte sanea el estado
  actual, pero una eliminación histórica requiere una tarea separada y
  coordinación porque reescribe refs.
- No existe todavía un detector runtime de firma/layout.
- REST pit menu mantiene cliente y modelo separados.
- Placeholders de Engineer no están validados y deben permanecer deshabilitados
  como datos observados.

Rollback de este corte: revertir el commit de ISA-30. No hay migración, cambios
de runtime ni persistencia.
