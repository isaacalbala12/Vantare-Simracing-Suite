# Plan de implementación — ISA-365 Relative físico 2+2

## Resumen

Aplicar el contrato aprobado en la
[especificación](../specs/2026-08-15-isa-365-relative-fisico-2x2-design.md)
mediante cortes frontend pequeños y TDD. No se modifica Telemetry Core.

Estado: tareas 1–4 completadas y verificadas; pendiente de revisión e
integración de la rama.

## Decisiones arquitectónicas

- `lapDistanceMeters` ya proyectado es la autoridad de selección.
- El selector calcula lado físico; el ViewModel calcula presentación temporal.
- El contenido persistido conserva forma compatible, pero normaliza cantidad e
  inclusión del jugador al contrato fijo 2+1+2.
- Los renderizadores consumen `side`; no reconstruyen semántica desde el gap.

## Grafo de dependencias

```text
tests de selección
  -> selector circular + side
    -> comparabilidad temporal en ViewModel
      -> migración/inspector 2+2
        -> consumidores Endurance
          -> gates y evidencia runtime
```

## Tareas

### Tarea 1 — Probar y construir la selección física — completada

Descripción: reproducir el bug de 38 coches/1 gap y fijar orden circular,
doblados, clases, estabilidad y degradación sin distancia.

Criterios de aceptación:

- el test anterior falla porque solo devuelve al jugador;
- el selector devuelve `side` y composición física correcta;
- no usa gap, clasificación ni delta de vueltas para seleccionar.

Verificación:

```powershell
corepack pnpm --dir frontend test -- src/overlay/widget-types/relative/relative-view-model.test.ts
```

Archivos:

- `frontend/src/overlay/widget-types/relative/relative-row-selection.ts`
- `frontend/src/overlay/widget-types/relative/relative-view-model.test.ts`

Dependencias: ninguna. Alcance: pequeño.

### Tarea 2 — Separar lado y gap en el ViewModel — completada

Descripción: añadir `side`, conservar filas sin gap y neutralizar tiempos no
comparables en pit, vuelta distinta o signo contradictorio.

Criterios de aceptación:

- `gapSeconds=null`, `gapText="—"` y tono neutral cuando corresponde;
- jugador y rival en pit están cubiertos;
- las cinco identidades permanecen presentes.

Verificación: mismo focal de la tarea 1.

Archivos:

- `frontend/src/overlay/widget-types/relative/relative-view-model.ts`
- `frontend/src/overlay/widget-types/relative/relative-view-model.test.ts`

Dependencias: tarea 1. Alcance: pequeño.

### Checkpoint A

- selector y ViewModel en verde;
- diff limitado a lógica Relative;
- ninguna modificación backend.

### Tarea 3 — Normalizar el contrato persistido 2+1+2 — completada

Descripción: cambiar defaults y migración a dos por lado, forzar jugador y
retirar del inspector los controles incompatibles.

Criterios de aceptación:

- contenido nuevo y antiguo produce 2+1+2;
- el inspector no muestra controles engañosos;
- clase, altura y columnas siguen editables.

Verificación:

```powershell
corepack pnpm --dir frontend test -- src/overlay/widget-types/relative/relative-content.test.ts src/overlay/widget-types/relative/RelativeContentInspector.test.tsx src/overlay/widget-types/relative/relative-definition.test.ts
```

Archivos:

- `frontend/src/overlay/widget-types/relative/relative-content.ts`
- `frontend/src/overlay/widget-types/relative/relative-content.test.ts`
- `frontend/src/overlay/widget-types/relative/RelativeContentInspector.tsx`
- `frontend/src/overlay/widget-types/relative/RelativeContentInspector.test.tsx`
- `frontend/src/overlay/widget-types/relative/relative-definition.test.ts`

Dependencias: tarea 2. Alcance: medio.

### Tarea 4 — Adaptar Endurance al lado físico — completada

Descripción: impedir que gaps nulos conviertan todos los rivales en “detrás” y
suprimir alertas basadas en tiempos no comparables.

Criterios de aceptación:

- Mirror y Proximity separan lados mediante `side`;
- Traffic no crea amenaza con gap neutral;
- Original y Crystal conservan cinco filas neutrales.

Verificación:

```powershell
corepack pnpm --dir frontend test -- src/overlay/design-systems/vantare-original/relative src/overlay/design-systems/vantare-crystal/relative src/overlay/design-systems/vantare-endurance/relative
```

Archivos:

- `frontend/src/overlay/design-systems/vantare-endurance/relative/RelativeRedlineTemplates.tsx`
- tests Relative de Original, Crystal y Endurance aplicables.

Dependencias: tarea 2. Alcance: medio.

### Checkpoint B — Gate final

```powershell
corepack pnpm --dir frontend test
corepack pnpm --dir frontend build
corepack pnpm --dir frontend exec eslint src/overlay/widget-types/relative src/overlay/design-systems/vantare-endurance/relative
corepack pnpm --dir frontend visual:overlay-studio
git diff --check
```

Resultado:

- suite frontend: 376 archivos y 2750 tests, PASS;
- build: PASS;
- Relative visual y paridad: PASS al 0 %; el gate global conserva dos
  diferencias no relacionadas de Delta stale;
- lint focal propio: PASS; el barrido completo conserva el error heredado
  `_absent` en `authoring-fixtures.ts:231`, fuera del diff;
- `git diff --check`: PASS.

Además:

- inspección visual de pista y boxes si LMU está disponible;
- revisión completa del diff;
- actualización de handoff, `docs/current-plan.md`, changelog fragment y Linear;
- commit y push de la rama, sin merge ni promoción.

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Wrap incorrecto en meta | Alto | Tests con jugador a ambos lados de meta |
| Reutilizar el mismo rival con parrilla corta | Medio | Set de identidades seleccionadas |
| Gap neutral clasificado como detrás | Alto | `side` explícito y tests Endurance |
| Perfil antiguo conserva 3+3 | Medio | Normalización de parse y tests de migración |
| Garaje sin distancia válida | Bajo en este corte | Fallo cerrado; registrar evidencia futura |

## Cierre

La issue queda técnicamente terminada cuando todos los criterios de la spec y
los gates aplicables pasan, existe evidencia manual clara y no quedan hallazgos
P0/P1/P2 atribuibles. Eso no implica integración en `nightly`, promoción ni
release.
