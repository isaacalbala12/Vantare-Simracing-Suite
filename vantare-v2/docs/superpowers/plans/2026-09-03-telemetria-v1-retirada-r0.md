# Retirada segura de Telemetría V1 — R0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** cerrar el inventario de dependencias, preservar una referencia de rollback y fijar las pruebas protectoras antes del primer borrado V1.

**Architecture:** conservar el Core y los contratos V2 existentes. Clasificar cada dependencia legacy por su consumidor real; no borrar por nombre ni crear un pipeline sustituto. El rollback del candidato final será otra build, nunca V1 escondida dentro de ella.

**Tech Stack:** Go, TypeScript/React, Wails/WebView2, Git, PowerShell, pnpm/Vitest; sin dependencias nuevas.

---

## Estado y alcance

**Ejecución autorizada:** Isaac responde «sí, agree». Base efectiva reconciliada
`8e8ec17b2d2b660d717316c10925a6b93d073d1c`: sobre `2abd32f9` sólo cambian
documentación y roadmap. R0 se ejecuta en la rama/worktree previstos;
el alcance sigue sin permitir edición de código productivo o pruebas del juego.

Isaac aprueba el [maestro](../specs/2026-09-03-telemetria-v2-plan-maestro.md).
Este es el primer microplan ejecutado, bajo **ISA-894**; su entrega documental
está en revisión final. El primer corte de código R1 sigue sin ejecutarse. La exploración que lo fundamenta está en
[la evidencia de base](../../telemetry-core/evidence/isa-894/retirada-v1-base-20260903.md).
No se presenta un inventario parcial como exhaustivo ni un hash como rollback funcional.

R0 produce documentación verificable, una copia privada del artefacto anterior
y resultados de regresión. **No modifica código productivo, elimina V1, cambia
perfiles reales, lanza Vantare/LMU ni ejecuta el banco de rendimiento.** No reactiva
Redline/S1–S5 como secuencia obligatoria. Los defectos históricos siguen siendo
evidencia; sólo un riesgo pertinente demostrado puede bloquear la retirada.

La auditoría integral de V2 y el bucle de cinco experimentos consecutivos sin
mejora u ocho horas siguen siendo fases 2 y 3 del maestro. R0 no las sustituye,
adelanta ni consume el presupuesto del bucle.

### Base, ownership y salidas

- Base de código/documentación examinada: `2abd32f9a1348c6acb8cdf3d2f6e40807bc085e4`, candidato #969; no está en Nightly por esta aprobación.
- Base remota observada: `origin/nightly=659b2c57dc2c7fc75962cc3c8e425ed1289266ec`. Comprobar otra vez al despachar; no rebasar silenciosamente.
- Nueva rama propuesta: `vantareapp/isa-894-retirada-v1-r0`, desde ese candidato; destino final permitido: PR draft a `nightly`, nunca merge implícito. Registrar esta base apilada en #894 antes de editar.
- Worktree writer propuesto: `C:\tmp\vantare-v1-retirada-r0`; raíz de aplicación: `C:\tmp\vantare-v1-retirada-r0\vantare-v2`. No reutilizar los viejos worktrees ISA-894 ni el checkout principal.
- Modelo único: `opencode-go/muse-spark-1.3-contributor`, `xhigh`. Un writer; exploradores/reviewer en snapshots propios, sin delegación anidada.
- Crear `docs/telemetry-core/evidence/isa-894/retirada-v1-inventario-20260903.md`: mapa completo de consumidores y clasificación.
- Crear `docs/telemetry-core/evidence/isa-894/retirada-v1-rollback-20260903.md`: manifiesto sanitizado, compatibilidad y protocolo.
- Crear `docs/telemetry-core/evidence/isa-894/retirada-v1-checks-20260903.md`: comandos, códigos de salida y regresiones que proteger.
- Actualizar el único handoff `docs/vantare-program/handoffs/telemetry-core.md`; roadmap manual `docs/roadmap/plan.md` y digest generado cuando cambie el estado público. Estos archivos son del coordinador, no de dos workers simultáneos.

## Tarea 1 — congelar contexto e inventariar consumidores

**Escritura permitida:** sólo el documento de inventario. Lectura: `cmd/`,
`internal/`, `pkg/`, `frontend/src/`, entradas/build frontend y `scripts/bench/`.

- [x] Registrar issue, raíz, rama, HEAD y estado limpio; si difieren de la base declarada, parar y reconciliar, sin reset ni checkout destructivo.

```powershell
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git status --short
```

Esperado: rama/worktree de R0 desde la base declarada, sin cambios previos.
Si esa base sólo recibe documentación posterior, registrar explícitamente ambos
SHA y comprobar el diff; no atribuir evidencia vieja a código distinto.

- [x] Buscar las fronteras legacy y seguir **todos sus importadores/callers**, no sólo el primer resultado. Ejecutar desde la raíz de aplicación; `rg` con salida 1 significa sin coincidencias, salida mayor que 1 es error.

```powershell
rg -n 'TelemetrySnapshot|snapshot\.scoring|adaptOverlayProjectionToSnapshot|derived-telemetry-store' frontend/src
rg -n 'overlayV1Emit|OverlayV1Emit|VANTARE_OVERLAY_V1_EMIT|overlayprojection\.ProjectV1|ProductOverlay\b' cmd internal pkg
rg -n 'telemetry:overlay:projection|telemetry:overlay:status|telemetry:overlay:fact|/telemetry/overlay/projection' frontend/src internal cmd scripts/bench
rg -n 'telemetry-shadow|telemetry-overlay-shadow-harness|telemetry-cutover-runtime-harness|overlay-projection-adapter' frontend scripts/bench -g '*.ts' -g '*.tsx' -g '*.mjs' -g '*.html' -g '*.json' -g '*.ps1'
```

Esperado **antes** de la retirada: coincidencias. Un resultado no acredita por sí
solo uso productivo ni permiso de borrado. No buscar `.env*`, credenciales ni
perfiles privados. Separar producción, test/fixture, tooling, generado e historia.

- [x] Completar una fila por consumidor real con: ruta/símbolo/SHA, upstream, downstream, categoría KEEP/MIGRATE/DELETE, garantía que protege, test existente o brecha, dependencia previa al borrado. Inventariar también entradas HTML/Vite, exports, bindings generados y comandos que empaquetan harnesses.
- [x] Resolver las trampas ya comprobadas en la evidencia de base: `WidgetTypeDefinition.buildViewModel`, rama harness de `WidgetVisualHost`, pull mixto, SSE compartido, guardias que exigen coexistencia y contratos independientes de Strategy/Engineer/recording. No borrar `telemetry-rate-coordinator` o `telemetry-shadow` enteros por su nombre.
- [x] Clasificar cada uno de los tipos del registro de widgets, incluidas las autoridades auxiliares. Un widget migrado en producción puede seguir arrastrando un builder legacy desde su definición o sus fixtures.

**Aceptación:** (1) cada coincidencia/importador queda clasificado o bloqueado de
forma explícita; (2) ningún KEEP compartido se incluye en un borrado de carpeta;
(3) cada MIGRATE tiene contrato de reemplazo y prueba observable, no «quitar el test».

## Tarea 2 — preservar artefacto y delimitar rollback

**Escritura permitida:** documento de rollback y copia privada del exe a una
carpeta nueva fuera de Git. No copiar datos reales ni cambiar instalación/configuración.

- [x] Revalidar artefacto y commit. El hash ya se comprobó al redactar este plan; repetir sólo antes de copiar para detectar cambios.

```powershell
$rollbackSource = 'C:\tmp\vantare-redline-integration\vantare-v2\vantare-v2\bin\vantare-redline-rfix4-4864b5c6.exe'
$expectedHash = 'cb69a4d56ca7cb59078cb7bd7e223b33c34aa927ec808c2e49154386b878faba'
if ((Get-FileHash -LiteralPath $rollbackSource -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'El artefacto de rollback cambió' }
git cat-file -t 4864b5c6cd5bd8bc0f9b7279ac6f9a83e438253c
```

Esperado: sin excepción y `commit`. No extraer/imprimir cadenas del ejecutable,
subirlo a GitHub ni distribuir su configuración embebida.

- [x] Crear copia sin sobrescribir destinos existentes; esta operación guarda un binario, **no** lo ejecuta ni lo instala.

```powershell
$rollbackSource = 'C:\tmp\vantare-redline-integration\vantare-v2\vantare-v2\bin\vantare-redline-rfix4-4864b5c6.exe'
$expectedHash = 'cb69a4d56ca7cb59078cb7bd7e223b33c34aa927ec808c2e49154386b878faba'
$rollbackDir = 'C:\tmp\vantare-v1-rollback-4864b5c6-20260903'
if (Test-Path -LiteralPath $rollbackDir) { throw 'Destino existente: verificarlo, no sobrescribirlo' }
New-Item -ItemType Directory -Path $rollbackDir -ErrorAction Stop | Out-Null
$rollbackCopy = Join-Path $rollbackDir 'vantare-redline-rfix4-4864b5c6.exe'
Copy-Item -LiteralPath $rollbackSource -Destination $rollbackCopy -ErrorAction Stop
if ((Get-FileHash -LiteralPath $rollbackCopy -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'Copia de rollback no verificada' }
```

Esperado: copia con el mismo SHA256. Si falla, conservar evidencia y parar;
no borrar ni reparar automáticamente los archivos implicados.

- [x] Documentar, leyendo **código**, los stores/configuraciones compartidos: settings, perfiles v3/v4, perfil activo/política de rendimiento, updater y runtime auxiliar. Determinar si hay escrituras automáticas al arrancar. No leer/capturar su contenido privado.
- [x] Registrar artefacto como **copia verificada**, no restauración funcional. Describir vuelta atrás sin downgrade/migración de datos: cerrar candidato mediante su cierre normal, seleccionar build preservada y mantener datos compatibles. Si hace falta backup de datos privados o cambio de instalador, elevarlo con rutas concretas antes de efectuarlo. Isaac ejecutará cualquier comprobación física imprescindible, máximo cinco minutos.
- [x] Conservar como referencia `scripts/bench/build-measurement.ps1`: build configurada y con CDP; no confundirla con `-tags production`, release o medida limpia. R0 no vuelve a compilar con `.env*` ni prueba una app sin licencia.

**Aceptación:** (1) commit y copia verificables; (2) datos preservados sin migración
irreversible y riesgos de compatibilidad explícitos; (3) pendientes físicos
declarados sin inventar PASS. Falta de rollback seguro bloquea borrado, no obliga a ejecutar LMU automáticamente.

## Tarea 3 — fijar regresiones y entregar el primer corte de código

**Escritura permitida:** documento de checks; coordinación final en handoff/roadmap/issue.

- [x] Identificar qué comportamiento protege cada guard actual. En particular, `internal/app/overlay_v1_guard_test.go` y `frontend/src/overlay/core/v1-authority-guard.test.ts` congelan coexistencia: el corte de retirada tendrá que sustituir esa expectativa por ausencia legacy **manteniendo negativos, invariantes y cobertura semántica**.
- [x] Ejecutar focales no invasivos sobre la base, sin tocar fuentes ni lanzar apps:

```powershell
corepack pnpm --dir frontend exec vitest run src/overlay/core/v1-authority-guard.test.ts src/overlay/transports/legacy-retirement.test.ts src/telemetry-transport/overlay-wails-pull.test.ts --maxWorkers=2
corepack pnpm --dir frontend typecheck
corepack pnpm --dir frontend build
go test ./internal/app -run 'TestResolveOverlayV1Emit|TestOverlayV1EmissionSwitch|TestOverlayV1EmissionGuard' -count=1
go test ./internal/app/telemetrytransport ./internal/telemetry/projection/... ./pkg/config -count=1
```

Esperado: resúmenes PASS y códigos 0; el build frontend precede a Go por el
embed. Ejecutar cada comando por separado y registrar su salida y código; el
éxito del último no oculta el fallo de uno anterior. Si faltan dependencias instaladas, revisar lockfiles/procedimiento antes
de instalar; no actualizar versiones para desbloquear un test. Estos focales
no equivalen a la suite completa ni acreditan rendimiento/runtime físico.

- [x] Gestión de fallos: no fallaron los focales ejecutados. Los avisos y checks no ejecutados constan en la evidencia; no se corrigió producción ni se debilitó ningún test.
- [x] Elegir el **primer conjunto cerrado de dependencias** del inventario, con hasta cinco archivos de código por microcorte y sus tests. Preparar sus TASKS con test RED, diff mínimo previsto, test GREEN, checks completos aplicables y rollback. Si el conjunto requiere más archivos inseparables, justificar la unidad y pedir revisión; no dejar commits artificialmente rotos para cumplir un número.
- [ ] Reviewer Muse independiente en snapshot: comprobar clasificación, preservación, riesgos y fuerza de las pruebas. El orquestador contrasta las rutas y el diff; el informe del worker no basta. Publicar resultado, actualizar #894 y el único handoff, sin cerrar la issue ni promover.

**Aceptación:** (1) comandos/resultados reproducibles; (2) próxima tarea de código
cerrada, pequeña y sin consumidor perdido; (3) revisión de R0 y brechas visibles.

## Orden técnico después de R0 — dependencias, no órdenes de borrado

| Frontera | Qué tiene que quedar resuelto antes de quitarla |
| --- | --- |
| Catálogo/harness/builders frontend | Migrar consumidores legítimos al contrato V2 o auxiliar ya existente; preservar escenarios y assertions útiles. No añadir otro renderer ni una segunda verdad de dominio. |
| Shadow y adapters exclusivos | Cero importadores útiles pendientes; conservar sus resultados como historia y mover garantías a tests V2. No exigir volver a declarar paridad histórica. |
| Pull/SSE y bindings | Separar entrega V1 de la autoridad V2; conservar ACK, replay, generaciones, cancelación, loopback y otros productos del Hub compartido. |
| Productor/tipos/flags V1 | Retirar creación/publicación/status, switches, campos y código generado exclusivo sólo con consumidores resueltos. `strategyprojection.ProjectV1` y contratos ajenos no son objetivos por el nombre. |
| Cierre de retirada | Cero legado productivo o empaquetado; tests semánticos y de ausencia, suites Go/frontend, build, revisión adversarial y pendientes físicos explícitos. Congelar SHA sin V1 para los cuatro auditores de fase 2. |

Los lectores de Go/transporte y frontend pueden explorar en paralelo. Las
modificaciones que compartan contratos se serializan; cada reviewer recibe un
SHA concreto. El banco físico tendrá un solo dueño y no arranca durante R0.

## Cierre de este plan

La aprobación del maestro no certifica la retirada ni su rendimiento. R0 ha sido
ejecutado dentro de su autorización; los resultados se someten a revisión independiente. No se solicita otra elección
de modelo ni de método: Isaac ya eligió workers Muse y revisión adversarial.
La siguiente entrega de R0 es evidencia y el primer corte de código, no otra
ronda abierta de brainstorming ni un reinicio del inventario desde cero.

## Entrega R0

- [Inventario y límites explícitos](../../telemetry-core/evidence/isa-894/retirada-v1-inventario-20260903.md).
- [Artefacto y compatibilidad de rollback](../../telemetry-core/evidence/isa-894/retirada-v1-rollback-20260903.md).
- [Regresiones de la base](../../telemetry-core/evidence/isa-894/retirada-v1-checks-20260903.md).
- [Primer corte de código R1](2026-09-03-telemetria-v1-retirada-r1.md), preparado, no implementado.

Las unidades BLOCKED tienen identidad y consumidores clasificados, pero su
semántica requiere revisión antes de borrarlas; no bloquean R1, que no las toca.
La copia no es prueba de restauración física ni autorización para copiar datos.
