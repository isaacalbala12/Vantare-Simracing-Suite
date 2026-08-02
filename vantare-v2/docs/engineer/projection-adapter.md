# TC-08B — proyección canónica y entrada pura Engineer

Fecha: 2026-08-01. Issue: ISA-109. Estado: implementación aislada, sin
wiring productivo ni promoción.

## Resultado

`derive.FinalState` se proyecta a una superficie propia de Engineer y Spotter:

```text
Driver LMU -> Batch -> Reducer -> Derive
  -> projection/engineer PayloadV1
     -> ObservationSnapshotV1 + Manifest + Field
        -> monitores (después de replay parity en ISA-110)
```

La proyección no abre LMU, Shared Memory, REST, archivos ni procesos. No tiene
goroutines, scheduler, audio, UI o decisiones de carrera. Mantiene el metadata
transversal y convierte los tipos canónicos a tipos de producto en el último
límite.

## Contrato v1

La observación contiene:

- metadata, epoch e identidad de ejecución;
- circuito, tipo, tiempo, fin, restante, máximo de vueltas, tamaño de parrilla
  y presencia de jugador;
- jugador activo y parrilla completa;
- nombres, clase, posición, vueltas, sector, distancia y tiempos;
- controles, pit y contador de sanciones;
- fuel en litros y capacidad;
- gaps absolutos y relativos;
- posición mundo, velocidad local y orientación 3x3 por vehículo.

Cada campo conserva `present`, `provenance` y `freshness`. En la superficie de
producto, `Field` diferencia `fresh`, `stale`, `invalid`, `missing` y
`unsupported`. Un cero fresh sigue siendo un valor presente. `Usable()` solo
es cierto con campo fresh y capability supported.

Capabilities v1, en orden canónico:

1. `session`;
2. `standings`;
3. `controls`;
4. `pit`;
5. `fuel`;
6. `gaps`;
7. `spatial`.

La lista del payload se recalcula desde todos los vehículos. Duplicados,
desorden, grupo desconocido, manifest contradictorio o una capability
`unsupported` con datos presentes fallan cerrados.

## Decisión sobre el `telemetry.Frame` legacy

ISA-108 proponía temporalmente adaptar a `internal/engineer/telemetry.Frame`.
No se hace en ISA-109 porque ese tipo:

- representa `missing` con el mismo cero que un valor real;
- reduce identidades canónicas opacas y generacionales a `int32`;
- no transporta freshness, provenance ni capability;
- contiene muchos campos todavía no demostrados por Telemetry Core.

Forzar esa conversión incumpliría el criterio central de no inventar datos. La
entrada esperada por los monitores será `ObservationSnapshotV1`; ISA-110
caracteriza los monitores legacy con replays y define sus requisitos por
señal. ISA-111 cambia el runtime únicamente después de esa paridad. Hasta
entonces no existe ningún bridge productivo y el `Frame` legacy se conserva
intacto y reversible.

## Precisión espacial

Los valores se copian sin redondeo desde los tipos canónicos:

- posición mundo: metros, `float64`;
- velocidad local: m/s, ejes LMU `+X left`, `+Y up`, `+Z rearward`;
- orientación: las tres filas completas de la matriz right-handed.

ISA-130 prueba el origen con la fixture LMU 1.3 real hash-pinned, 44 vehículos
y un oráculo independiente world-to-local. ISA-109 añade una regresión de
proyección con signos, fracciones, orientación, dos vehículos y ownership del
slice. No se activa Spotter; el gate perceptual continúa en ISA-112.

## Datos deliberadamente ausentes

Flags/game phase/finish status, tipo de sanción, temperaturas, neumáticos,
frenos, daños, clima, driver stint, Virtual Energy y datos específicos de Pit
Manager continúan `unsupported` o sin capability. No se infieren a partir de
gaps, contadores ni ceros.

## Evidencia

- contrato focal x20 y race x10: PASS;
- replay canónico con las cuatro proyecciones x20: PASS, digest versionado
  `b77b80eab55217ba9a112ff5f34b9ef995132171f012e5e88af2383afb4a5602`;
- tests de cero, missing, stale, invalid, unsupported y degraded: PASS;
- parrilla completa, fuel, gaps, geometría y ownership: PASS;
- 31 familias Engineer: PASS;
- Telemetry Core completo: PASS;
- `go test ./... -count=1`: PASS;
- build frontend para el embed Go: PASS, con el warning de chunk ya conocido;
- `go vet` focal y `git diff --check`: PASS;
- revisión adversarial: corrigió el orden de capabilities en parrillas sparse;
  segunda pasada sin P0/P1/P2/P3 abiertos.

Rollback: volver a ISA-130 `c6e40ed2614196a7afca839aef3610674f3eec07`.
No hay migración de datos, wiring, merge o promoción.
