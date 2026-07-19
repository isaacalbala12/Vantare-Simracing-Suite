# Telemetry Core Final Architecture — Plan maestro

> **Estado:** aprobado para planificación por Isaac el 2026-07-19. La ejecución comienza en ISA-26, una issue por rama, worktree y chat. Nada entra en `develop` sin validación manual completa.

**Objetivo:** sustituir los pipelines actuales por un core modular, neutral al simulador, observable, reproducible y capaz de alimentar Overlay, Engineer, Strategy y Analysis sin acoplarlos.

**Modelo recomendado:** GPT-5.6 Sol, razonamiento medium.

**Autoridad:** `AGENTS.md`, `docs/agent-workflow.md`, ADR 0004, este plan, el microplan activo y Linear. `vantare-core` no se usa.

## 1. Resultado final

- Un único driver de simulador activo.
- LMU Driver posee Shared Memory y REST local.
- Observaciones tipadas, fusión por campo y estados honestos.
- Reducer single-writer sin I/O y snapshots realmente inmutables.
- Derivaciones versionadas y acotadas.
- Snapshots latest-wins y hechos ordenados separados.
- Proyecciones independientes para Overlay, Engineer, Strategy y Analysis.
- Wails/SSE con snapshot completo, epoch, secuencia y resync.
- Grabación/replay versionados y backend de almacenamiento reemplazable.
- Sin mock o simulator como fallback productivo.
- Pipeline anterior eliminado después de paridad y consumidores cero.

## 2. Estrategia de migración

La implementación es paralela, no un parche sobre `pkg/models.Telemetry`:

1. construir contratos y guards sin cambiar producción;
2. construir driver LMU y core detrás de harness;
3. ejecutar shadow comparison;
4. migrar transportes y productos uno a uno;
5. mantener rollback por revert de commit, no dos pipelines permanentes;
6. auditar consumidores y eliminar el sistema anterior.

Cada issue debe mantener el repositorio compilable. Una issue no puede mezclar contrato, cutover y borrado legacy.

## 3. Fases y microplanes

| Orden | Fase | Documento | Gate humano |
|---|---|---|---|
| 1 | TC-02 Fundamentos y contratos | `2026-07-19-telemetry-core-microplan-02-foundations-contracts.md` | aceptar contratos y grafo |
| 2 | TC-03 Driver Platform + LMU | `2026-07-19-telemetry-core-microplan-03-driver-lmu.md` | validar LMU y fallos |
| 3 | TC-04 Runtime y derivaciones | `2026-07-19-telemetry-core-microplan-04-runtime-derivations.md` | aceptar comportamiento y rendimiento |
| 4 | TC-05 Proyecciones y transporte | `2026-07-19-telemetry-core-microplan-05-projections-transport.md` | validar contratos Wails/SSE |
| 5 | TC-06 Grabación y replay | `2026-07-19-telemetry-core-microplan-06-recording-replay.md` | aceptar almacenamiento y privacidad |
| 6 | TC-07 Migración Overlay | `2026-07-19-telemetry-core-microplan-07-overlay-cutover.md` | probar Studio/Desktop/OBS con LMU |
| 7 | TC-08 Migración Engineer | `2026-07-19-telemetry-core-microplan-08-engineer-cutover.md` | probar Engineer/Spotter completo |
| 8 | TC-09 Retirada y hardening | `2026-07-19-telemetry-core-microplan-09-retirement-hardening.md` | aprobación final sin merge automático |

TC-01 (ISA-23/24/25/96/97) permanece como baseline histórico completado.

## 4. Grafo de dependencias

```text
TC-02 -> TC-03 -> TC-04 -> TC-05
                              |-> TC-06 ---------|
                              |-> TC-07 -> TC-08 |-> TC-09
```

TC-06 puede implementarse después del contrato de proyección, pero el cutover de productos no espera a disponer de todas las herramientas históricas. El gate final TC-09 sí exige TC-06 completo.

Cadena Linear exacta:

```text
ISA-26..29 -> ISA-30..34 -> ISA-35..38 -> ISA-39..41
ISA-41 -> ISA-101..104 (recording)
ISA-41 -> ISA-105..107 -> ISA-108..112 (Overlay y Engineer)
ISA-104 + ISA-112 -> ISA-113..116 -> ISA-87 -> ISA-117
```

## 5. Presupuestos arquitectónicos

- El loop del reducer no hace red, disco, JSON, logging por muestra ni callbacks de producto.
- Ninguna cola es ilimitada.
- Ninguna goroutine carece de `context.Context` o cierre demostrable.
- No se añade una dependencia sin issue de decisión, licencia, tamaño y rollback.
- No se usa reflection en el hot path.
- No se publica raw data ni nombres/rutas en logs diagnósticos por defecto.
- Los contratos de proyección evolucionan de forma aditiva dentro de una versión mayor.
- IDs de señales y hechos nunca se reutilizan.

## 6. Gates comunes por issue

```powershell
git status --short
git diff --check
gofmt -w <archivos-go-modificados>
go test ./internal/telemetry/... -count=1
go test ./... -count=1
pnpm --dir frontend test
pnpm --dir frontend build
```

Solo se ejecutan frontend/Playwright cuando el corte lo toca o el microplan lo exige. Los resultados se comparan contra el SHA base. No se rebajan tests o baselines.

## 7. Revisión por issue

Antes de `In Review`:

1. revisión de corrección, arquitectura, seguridad y rendimiento;
2. inventario de archivos y dependencias nuevas;
3. prueba de consumidores y código muerto;
4. comandos y resultados reales;
5. checks omitidos y motivo;
6. rollback;
7. verificación manual para Isaac;
8. commit y push; PR draft cuando la issue lo pida;
9. sin merge a `develop`.

## 8. Stop conditions

Parar si:

- aparece una dependencia circular o un producto importado por core/driver;
- hace falta alterar funcionalidad Engineer en vez de adaptar su entrada;
- una señal no tiene semántica/unidad/fuente demostrable;
- Shared Memory y REST discrepan sin regla aprobada;
- se requiere una nueva dependencia;
- una cola necesita ser ilimitada para pasar tests;
- no existe resync después de un salto de secuencia;
- el recorder puede bloquear el directo o perder datos silenciosamente;
- la paridad visual/funcional falla por causa no entendida;
- se propone borrar código con consumidores;
- el alcance supera aproximadamente 300 líneas lógicas no mecánicas sin una razón revisable.

## 9. Definition of Done global

- todas las fases In Review y validadas manualmente;
- LMU real probado en estados representativos;
- Overlay y Engineer sin pipeline paralelo;
- Strategy y Analysis disponen de proyecciones/recording estables, aunque sus productos sigan en otros proyectos;
- grabaciones incompletas se detectan y explican;
- cero fallbacks ficticios productivos;
- cero consumidores del modelo/servicios antiguos;
- race, soak, benchmarks, frontend, Playwright y teardown documentados;
- documentación, Linear y código coinciden;
- PR final queda sin merge hasta aprobación explícita de Isaac.
