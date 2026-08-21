# Skill: gestión del roadmap

## Fuente vigente

La planificación pública vive en `docs/roadmap/plan.md` y el artefacto que
consume la aplicación es `docs/roadmap/roadmap.json`, generado por
`.github/scripts/roadmap_digest.py`.

La ejecución de cada trabajo vive en su issue de GitHub (`ISA-N`), la
continuidad técnica en el handoff vivo y la entrega visible para testers en el
fragmento de changelog correspondiente. `docs/current-plan.md` y
`docs/roadmap-execution-board.md` son registros históricos: no se actualizan
como parte del flujo normal ni sustituyen al roadmap.

Para el procedimiento completo, leer `docs/roadmap-maintenance.md`.

## Al iniciar trabajo

1. Lee `AGENTS.md`, `docs/roadmap/plan.md`, la issue de GitHub y el handoff
   vivo.
2. Confirma rama, base, worktree y `git status --short`.
3. Si el trabajo cambia el alcance, una fase, un área, un hito o una entrega
   pública, actualiza `docs/roadmap/plan.md` en la misma PR.
4. Si solo cambia el estado interno, evidencia o riesgo de la issue, actualiza
   la issue y el handoff, no el roadmap.

## Al completar trabajo

1. Cambia en `plan.md` el hito o progreso anunciado cuando la entrega ya esté
   realmente cumplida.
2. Registra evidencia, checks, riesgos y siguiente acción en la issue y el
   handoff.
3. Añade `docs/changelog/fragments/ISA-N.json` si el cambio es visible para
   testers.
4. No edites `roadmap.json` a mano; el digest lo regenera en su PR automática.

## Formato mínimo de `plan.md`

```text
## Fases
### Nombre de la fase
- id: fase-id
- estado: planned
- progreso: 25
- etiqueta: Fase 3
- objetivo: Por planear
- resumen: Descripcion breve.
- item: Primer bloque de trabajo.

## Areas
### Nombre del area
- id: area-id
- estado: in-progress
- progreso: 25

## Hitos
### Nombre del hito
- id: hito-id
- tipo: plan
- cuerpo: Resultado que se espera entregar.
- etiqueta: Plan
```

Estados válidos: `done`, `in-progress`, `planned` y `future`. Tipos válidos de
hito: `release`, `feature`, `fix` y `plan`.

## Checks

```powershell
python .github/scripts/tests/test_roadmap_digest.py
python .github/scripts/roadmap_digest.py --repo . --ref origin/nightly --check
git diff --check
```

Si `--check` detecta commits nuevos en `nightly`, no edites el JSON manualmente:
explica la diferencia y deja que el workflow del digest abra su PR.
