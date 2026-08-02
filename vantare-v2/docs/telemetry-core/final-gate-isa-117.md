# ISA-117 / TC-09F — gate final de Telemetry Core

Fecha: 2026-08-01

Rama: `vantareapp/isa-117-tc-09f-gate-final-telemetry-core-y-handoff-sin-merge`

Base exacta: ISA-87 `4233c9f22086b9751e25016a15bae7837a1f5142`

Estado: cierre técnico preparado para revisión de Isaac. Sin merge ni
promoción.

## Veredicto

`ACCEPT` para la arquitectura y el comportamiento de Telemetry Core, con cero
P0/P1/P2 atribuibles al módulo. La issue permanece `In Review` porque la
validación perceptual de Isaac y la promoción a `nightly` son gates humanos.

El gate también detectó deudas externas que no se ocultan ni se corrigen en
este corte:

- ISA-118: contención P3 e intermitente del archivo temporal de ajustes en
  Windows;
- ISA-131: el smoke general de Overlay Studio no monta
  `LauncherStoreProvider`;
- ISA-94: gate propio de Overlay Studio, que posee el baseline visual antiguo
  y los presupuestos de interacción del canvas.

Ninguna de estas deudas crea una segunda adquisición LMU, altera el estado
canónico, la grabación o el replay, ni invalida las suites específicas de
Telemetry Core.

## Arquitectura final demostrada

```text
LMU Shared Memory + LMU REST local
                 |
     drivers/lmu (único owner de adquisición)
                 |
    BatchMapper -> Reducer -> SessionCoordinator -> Derive
                 |
             Hub canónico
          /         |         \
   Overlay v1   Engineer v1   recording SQLite
   Wails/SSE    eventos/facts  replay/migraciones
```

- `internal/telemetry/drivers/lmu` es el único paquete productivo que usa
  `OpenFileMappingW` y `MapViewOfFile`.
- `TelemetryCoreRuntime` es el único composition root del pipeline live.
- Studio, Desktop y OBS consumen una única Overlay Projection v1; Wails y SSE
  entregan los mismos bytes.
- Engineer consume su proyección canónica y hechos ordenados. No posee reader,
  REST, simulator o replay productivo.
- Analysis y Strategy tienen contratos de proyección separados, sin poseer el
  lifecycle live ni modificar datos privados de otros productos.
- Mock, simulator y replay solo existen en tests, harnesses o herramientas de
  desarrollo explícitas.
- Recording conserva snapshots/facts versionados y SQLite es un detalle
  privado sustituible. Replay admite formatos versionados y migraciones
  copy-on-write sin presentar datos sintéticos como live.
- El cierre productivo posee Overlay, Core, HTTP/SSE, Ops, hotkeys, Engineer,
  Launcher, diagnósticos y contexto general en un orden único e idempotente.

## Evidencia estructural

`scripts/telemetry-core/audit-consumers.ps1` se ejecutó sobre la base final:

- los nueve paquetes backend legacy y `pkg/models` no tienen imports;
- `telemetry:update`, `telemetry:source-status`, `/telemetry/stream`,
  `normalizeLegacyTelemetry` y los adapters antiguos aparecen únicamente en
  tests negativos;
- `OpenFileMappingW` y `MapViewOfFile` aparecen en producción solo en
  `internal/telemetry/drivers/lmu/reader_windows.go`;
- `ParseEngineerFrame` y el mapping histórico de Engineer tienen cero
  referencias productivas.

Los paquetes `internal/engineer/lmu` e `internal/engineer/telemetry` que siguen
alcanzables contienen modelos y decoders puros utilizados por los monitores;
no abren LMU ni poseen un loop de adquisición. Los paquetes simulator/replay
solo son alcanzables desde `cmd/spotter-debug` y tests, nunca desde
`cmd/vantare`.

## Evidencia LMU real

### Lectura fresca

Con LMU 1.4 abierto se ejecutó el gate opt-in real:

```text
normalized LMU build="1.4.0.0" supported=true
runtime state="live" player-present=false
fingerprint="LMU_Data/runtime:build=1.4.0.0;size=324820;
evidence=active-grid-bijective;telemetry=not-required-no-player"
```

El estado observado era menú/sin piloto. El driver declaró live por la fuente
disponible, conservó `player-present=false` y no inventó fast telemetry.

### Capturas sanitizadas reproducibles

Las capturas reales y hash-pinned creadas durante ISA-129/ISA-112 cubren:

- menú sin payload inventado;
- pista y parrilla de 38 vehículos;
- `InPit=false -> true -> false`;
- salida a pista;
- desconexión sin payload y reconexión con epoch nuevo;
- cambio de sesión y reinicio de identidad/estado;
- dos vueltas comparables para Delta;
- geometría espacial validada para Spotter.

Nueve tests de replay/runtime sobre esas fixtures pasaron cinco veces. No se
reutilizó información personal ni se sustituyó una evidencia real por un mock.
Los nombres históricos `garage`, `pit` u `outlap` no amplían la semántica
demostrada: `mInPits` sigue siendo únicamente un booleano in-pit.

## Matriz de gates

| Gate | Resultado | Evidencia |
|---|---|---|
| Auditoría de consumidores | PASS | una adquisición LMU; legacy solo en tests negativos |
| Go global | PASS en repetición limpia | todos los paquetes verdes tras generar `frontend/dist` |
| Fuzz hostil | PASS | 7/7 fronteras, 3 s por target, 1.247.337 ejecuciones |
| Soak lógico de dos horas | PASS | 64 coches, 6 consumidores, Overlay, Engineer y SQLite |
| Lifecycle/teardown | PASS x5 | Wails/SSE, puerto, Hub, SQLite, Engineer, hotkeys y goroutines |
| Recording/replay | PASS x5 | recording, replay, SQLite, Engineer replay/service |
| Fixtures LMU reales | PASS x5 | menú, pista, pits, reconexión, sesión, Delta y geometría |
| LMU live opt-in | PASS | build 1.4 soportada, fuente live y ausencia honesta de piloto |
| Frontend unitario | PASS | 298 archivos, 2.016 tests |
| Frontend build | PASS | TypeScript + Vite |
| Playwright cutover | PASS | Studio, Desktop y OBS, wide/compact |
| Playwright shadow | PASS | proyección canónica y capturas |
| Design systems | PASS | 2 sistemas registrados |
| Crystal parity | PASS | 21/21 geometría, alpha, superficies, tipografía y estabilidad |
| Lint focal Telemetry/Overlay runtime | PASS | fuentes productivas de proyección/transporte/runtime |
| Lint global | deuda externa | 30 errores y 2 warnings históricos, sin cambios ISA-117 |
| Go vet | deuda conocida | 3 avisos Win32 `unsafe.Pointer`, sin cambios ISA-117 |
| `-race` | no ejecutable | `CGO_ENABLED=0` y GCC ausente; no se declara PASS |
| Visual Overlay histórico | deuda externa | Original 0,000 %; Crystal Studio baseline antiguo 100 % |
| Drag benchmark | deuda externa | umbrales históricos de canvas incumplidos; ISA-94 |
| Smoke general Overlay | FAIL externo | ISA-131: falta `LauncherStoreProvider` en el harness |

La primera suite Go global reprodujo ISA-118. Después de generar el `dist`
necesario, una segunda ejecución global pasó completa. El focal de ISA-118 con
`-count=10` volvió a reproducir la colisión; por ello no se presenta como un
fallo de Telemetry Core ni se oculta como ruido.

Vitest termina con código cero y muestra dos `AbortError` de teardown de Happy
DOM después de confirmar 2.016/2.016 tests. Vite conserva el aviso histórico de
chunk principal superior a 500 kB.

## Rendimiento fresco

Host: Windows amd64, AMD Ryzen 7 3700X. `-benchtime=100ms`, una repetición.

| Etapa | Tiempo | Bytes/op | Allocs/op |
|---|---:|---:|---:|
| Parse track | 36,8 µs | 29.551 | 155 |
| Parse 44 vehículos | 41,2 µs | 29.549 | 155 |
| Copia estable + parse | 64,8 µs | 29.407 | 151 |
| REST decode | 6,1 µs | 2.112 | 24 |
| Fusión | 4,1 µs | 656 | 6 |
| Reducer 64 vehículos | 24,7 µs | 85.418 | 5 |
| SessionCoordinator 64 | 33,5 µs | 62.721 | 9 |
| Derivaciones 64 | 56,2 µs | 231.534 | 12 |
| Fan-out 64 | 11,8 µs | 40.961 | 1 |
| Hub 64 | 49,2 µs | 12.635 | 357 |
| SQLite append 64 | 6,76 ms | 20.739 | 86 |
| Runtime combinado 64 | 4,42 ms | 1.586.369 | 200 |

El Hub mantiene la mejora de ISA-116 frente al baseline histórico de
258–303 µs. La variación de SQLite frente al rango anterior pertenece al I/O
local de una ejecución corta; el soak termina con cola vacía y cero rechazos,
por lo que no indica crecimiento no acotado.

## Deuda y riesgos residuales

| Severidad | Área | Estado/owner | Impacto sobre TC-09F |
|---|---|---|---|
| P3 | Settings Windows | ISA-118 | flake global; no toca Telemetry Core |
| P2 externo | Overlay harness | ISA-131, bloquea ISA-94 | smoke general no inicia; cutover TC sí pasa |
| P2 externo | Canvas performance | ISA-94 | presupuesto visual/interacción, no ingesta |
| P2 externo | Baseline Crystal Studio | ISA-94 | baseline antiguo; harness 21/21 actual pasa |
| P3 | Toolchain | pendiente de entorno CI con GCC | `-race` no ejecutable en este host |
| P3 | Win32 vet | deuda técnica Windows | tres avisos heredados `unsafe.Pointer` |
| Manual | Spotter perceptual | Isaac | confirmar audio left/right/clear con tráfico real |

P0/P1/P2 abiertos atribuibles a Telemetry Core: **0**.

## Rollback

No existen migraciones remotas ni cambios de schema en ISA-117. Este corte
solo añade documentación de cierre.

Antes de promover:

1. conservar la rama apilada completa y sus PR draft;
2. etiquetar el SHA aprobado por Isaac;
3. integrar mediante una issue de promoción, nunca mezclando commits a mano;
4. si falla `nightly`, revertir la integración completa hasta
   `4233c9f^` o revertir en orden inverso ISA-87, 116, 115, 114 y los cortes
   previos afectados;
5. no borrar bases SQLite: las migraciones históricas son copy-on-write y el
   archivo original debe permanecer recuperable;
6. volver a ejecutar Go global, cutover Playwright, replay y el live opt-in
   antes de reintentar una promoción.

## Checklist manual para Isaac

Esta lista no está declarada como ejecutada por el agente. Debe completarse en
la build creada desde la rama aprobada antes de pasar a `nightly`.

### 1. Sin LMU

- [ ] Abrir Vantare con LMU cerrado.
- [ ] Confirmar `Desconectado` o `Esperando`, sin datos de carrera ficticios.
- [ ] Abrir Studio/Desktop/OBS y comprobar que el layout existe pero los datos
      inseguros no se presentan como live.

### 2. Menú y garaje

- [ ] Abrir LMU y permanecer en menú.
- [ ] Confirmar simulador detectado, sin piloto ni fast telemetry inventada.
- [ ] Entrar al garaje y confirmar que no aparecen saltos, rivales falsos o
      mensajes Engineer sin evidencia.

### 3. Pista y pits

- [ ] Completar al menos dos vueltas válidas.
- [ ] Verificar Standings, Relative, Delta y Pedals en Desktop.
- [ ] Verificar la misma información en OBS para el mismo documento.
- [ ] Entrar y salir de pits; confirmar la transición una sola vez.
- [ ] Confirmar que Engineer recibe datos y que un fallo suyo no congela los
      overlays.
- [ ] Con tráfico cercano real, confirmar Spotter left/right/still there/clear
      y ausencia de mensajes tardíos.

### 4. Recording y replay

- [ ] Activar recording con consentimiento explícito.
- [ ] Confirmar indicador visible y sesión local.
- [ ] Cerrar la sesión, abrir el inspector y reproducirla.
- [ ] Confirmar que el replay no aparece como live y que puede eliminarse sin
      borrar archivos originales no gestionados.

### 5. Reconexión y sesión nueva

- [ ] Salir de la sesión o cerrar LMU y confirmar desconexión sin payload.
- [ ] Volver a entrar y confirmar recuperación sin reiniciar Vantare.
- [ ] Cambiar de sesión y comprobar que vueltas, identidades, hechos y mensajes
      pendientes no se arrastran.

### 6. Cierre

- [ ] Cerrar Vantare con Overlay y Engineer activos.
- [ ] Confirmar que no quedan ventana, audio, puerto, hotkeys o proceso de
      Vantare activos.
- [ ] Reabrir y confirmar que ajustes, layouts y sesiones siguen íntegros.

### 7. Decisión

- [ ] Si todo es correcto, aprobar explícitamente la rama de ISA-117 para crear
      una issue separada de promoción a `nightly`.
- [ ] Si algo falla, registrar simulador/estado/paso/captura y mantener la rama
      sin promoción.

## Cierre

Telemetry Core queda técnicamente migrado al pipeline canónico único y listo
para la validación manual agrupada. ISA-117 no integra, no publica, no cambia
baselines y no declara la aprobación humana que todavía corresponde a Isaac.
