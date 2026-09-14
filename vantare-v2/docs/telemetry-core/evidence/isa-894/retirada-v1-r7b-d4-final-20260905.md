# ISA-894 R7b/D4 — definitions finales sin autoridad V1

Fecha: 2026-09-05. Rama local
`vantareapp/isa-894-retirada-v1-r7b`. Base D4 `77ba9a4d`.

## TDD y cambio

- `ca462478`: RED. Las guardias enumeraron exactamente las seis definitions
  D4 que aún publicaban `buildViewModel`: `head-to-head`, `track-map`,
  `broadcast-tower`, `track-weather`, `car-damage-numbers` y
  `car-damage-visual`.
- `6a5da362`: GREEN. Las seis definitions dejan de publicar autoridad V1.
  Los cuatro builders legacy reales y los dos stubs `missing` de daño quedan
  confinados temporalmente a E1/E4 mediante llamadas directas.
- `4eaa0eb8`: los dos tests C1 de daño dejan de invocar los stubs retirados y
  pasan a bloquear su reaparición en las definitions. Los builders V2 y sus
  gaps canónicos siguen probándose sin datos inventados.

No se añade registro ni fallback. `track-map` conserva únicamente su preview
legacy, propiedad de E1. Los ViewModels V1 reales sobreviven solo como mitad
del oráculo E4 hasta su corte.

## Evidencia

- RED: 21/23 PASS; dos fallos que enumeraron exactamente las seis anclas D4.
- Guardias, registro, authoring y comparador: 64/64 PASS.
- Focal ampliado de los seis widgets, Host V2 y oráculos: 140/140 PASS.
- Revalidación tras migrar C1: 68/68 PASS.
- `pnpm --dir frontend typecheck`: PASS.
- ESLint focal: PASS.
- `pnpm --dir frontend build`: PASS; solo aviso de chunks preexistente.
- `git diff --check`: PASS.
- Escaneo de las seis definitions: cero `buildViewModel`.
- Suite frontend completa final: 3412/3418 PASS, con los mismos seis fallos
  heredados ajenos de D2/D3. La primera ejecución detectó dos tests C1 dentro
  del alcance que aún invocaban los stubs; se corrigieron antes de repetir la
  suite.

Diff de código y tests D4: 11 ficheros, 69 inserciones y 50 borrados. La mayor
parte de las inserciones son las rutas temporales E1/E4; los tests de daño
reducen 30 líneas legacy.

## Estado

APROBADO por review adversarial read-only
`ses_f90288574ffeuvXgeIjpxMIP8z`: P0/P1/P2 = 0; P3 = 2 informativos por
casts y tests legacy temporales con dueño E1/E4. Sin push, PR, merge,
promoción, release, apps ni LMU.
