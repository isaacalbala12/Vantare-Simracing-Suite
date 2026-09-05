# ISA-894 R7b/D3 — definitions dinámicas sin autoridad V1

Fecha: 2026-09-05. Rama local
`vantareapp/isa-894-retirada-v1-r7b`. Base D3 `fccb29c3`.

## TDD y cambio

- `e3f9d5a5`: RED. Las dos guardias fallaron solo por las seis definitions
  que aún publicaban `buildViewModel`: `racing-flags`, `delta-advanced`,
  `delta-trace`, `pedals`, `pedals-telemetry-compact` y
  `multiclass-relative`.
- `367a4df7`: GREEN. Las seis definitions dejan de importar y publicar el
  builder V1. No cambia el contrato ni el registro: D2 ya hizo opcional esa
  propiedad.

Los ViewModels legacy sobreviven hasta E1/E4 porque contienen tipos usados por
los renderers y la mitad V1 del oráculo. `authoring-fixtures.ts` y
`overlay-shadow-comparator.ts` llaman temporalmente a los seis builders de
forma directa y explícita. No se crea otro registro ni hay fallback silencioso.

## Evidencia

- RED: 21/23 PASS; dos fallos que enumeraron exactamente las seis anclas D3.
- Guardias, registro, authoring y comparador: 64/64 PASS.
- Focal ampliado de los seis widgets, Host V2 y oráculos: 164/164 PASS.
- `pnpm --dir frontend typecheck`: PASS.
- ESLint focal: PASS.
- `pnpm --dir frontend build`: PASS; solo aviso de chunks preexistente.
- `git diff --check`: PASS.
- Escaneo de las seis definitions: cero `buildViewModel`.
- Suite frontend completa: 3412/3418 PASS. Se reproducen los mismos seis
  fallos heredados y ajenos ya documentados en D2: cuatro de
  `telemetry-transport`, uno i18n de Studio y uno de gaps Fuel.

Diff de código y tests D3: 10 ficheros, 61 inserciones y 22 borrados. Las
adiciones son el RED y las llamadas temporales de E1/E4; ambos desaparecen o
se endurecen en sus cortes propietarios.

## Estado

APROBADO por review adversarial read-only
`ses_f90340906ffeafGj8G38G6gaWj`: P0/P1/P2 = 0; P3 = 1 informativo por
cinco casts temporales `as never` en E4, aceptados porque el contenido ya está
validado y E4 eliminará esa ruta. Sin push, PR, merge, promoción, release,
apps ni LMU.
