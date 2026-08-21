# Guía de agentes para el roadmap

Este documento sirve a workers que reciben una tarea de edición del roadmap.
La fuente vigente es `docs/roadmap/plan.md`; para el procedimiento completo,
lee `docs/roadmap-maintenance.md`.

## Antes de editar

1. Lee `AGENTS.md`, `docs/roadmap/plan.md`, la issue de GitHub y el handoff vivo.
2. Confirma rama, base, worktree y `git status --short`.
3. Identifica si el cambio es de planning público, de entrega cumplida o solo
   de estado interno de la issue.
4. No uses `docs/current-plan.md` ni `docs/roadmap-execution-board.md` como
   fuentes normativas; son históricos.

## Qué archivo tocar

| Necesidad | Archivo |
|---|---|
| Añadir o cambiar fase, área, hito o pendiente público | `docs/roadmap/plan.md` |
| Actualizar el JSON consumido por la app | `.github/scripts/roadmap_digest.py` lo genera; nunca editar a mano |
| Registrar evidencia técnica | Handoff vivo o documento de evidencia de la issue |
| Comunicar un cambio visible a testers | `docs/changelog/fragments/ISA-N.json` |

No se toca la UI del roadmap para cambiar contenido editorial. El contenido
localizado vive inline en `plan.md` y el digest lo convierte al artefacto.

## Modelo de `plan.md`

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

Los campos `titulo`, `resumen`, `objetivo`, `cuerpo`, `etiqueta` e `item` pueden
llevar `.en`, `.pt` y `.it`. Sin traduccion, el valor base se replica como
fallback. Los estados validos son `done`, `in-progress`, `planned` y `future`.

## Regla de actualización

- Si comienza un planning que cambia el alcance público, actualiza `plan.md` en
  el mismo PR.
- Si una entrega cumple un hito, actualiza el hito y el progreso de la fase en
  el mismo PR; no dejes un resultado terminado descrito como plan futuro.
- Si solo cambia el estado técnico de la issue y no cambia lo que se comunica
  públicamente, actualiza la issue y el handoff, no el roadmap.
- Regenera `roadmap.json` con el digest después de modificar `plan.md`.

## Checks

```powershell
python .github/scripts/tests/test_roadmap_digest.py
python .github/scripts/roadmap_digest.py --repo . --ref origin/nightly --check
git diff --check
```

Si el digest detecta commits nuevos en `nightly`, explica la diferencia y deja
que la PR automatizada del digest regenere el artefacto. No debilites el parser,
no inventes estados y no edites el JSON generado a mano.

## Cierre

El reporte debe indicar archivos tocados, checks, limitaciones, verificación
manual, rama/base/SHA, commit/PR y nivel de promoción alcanzado. El worker no
promociona canales ni publica releases.
