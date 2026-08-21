# Mantenimiento del roadmap

Este documento describe el procedimiento vigente para mantener el roadmap
publico de Vantare. La autoridad del planning no se duplica en un registro de
ejecucion historico.

## Fuentes de verdad

Cada documento tiene una responsabilidad distinta:

| Fuente | Responsabilidad |
|---|---|
| GitHub Issue `ISA-N` | Alcance, dependencias, estado operativo, rama y entrega |
| Handoff vivo | Continuidad tecnica, decisiones, evidencia, riesgos y siguiente accion |
| `docs/roadmap/plan.md` | Fases, areas, hitos, alcance futuro y estado publico |
| `docs/roadmap/roadmap.json` | Artefacto generado que consume la app; no se edita a mano |
| `docs/current-plan.md` | Registro historico; no se actualiza como parte del flujo normal |
| `docs/roadmap-execution-board.md` | Tablero historico; no se actualiza como parte del flujo normal |

Si hay conflicto, prevalecen la issue y el handoff para la ejecucion, y
`docs/roadmap/plan.md` para el planning publico. El roadmap no sustituye los
contratos tecnicos ni el handoff.

## Cuando actualizar el roadmap

El cambio se hace en el mismo PR que introduce el cambio material:

1. Al iniciar un planning que cambia el alcance publico: anadir o modificar la
   fase, area, hito o pendiente que queda a la espera de una decision.
2. Al retirar, reordenar o cambiar el estado de una fase, area o hito.
3. Al completar una entrega que el roadmap anuncia: cambiar el hito de `plan` a
   `feature`, `fix` o `release`, reescribir su cuerpo para describir lo que
   funciona hoy y actualizar el progreso o los items de la fase si corresponde.
4. Al cerrar una issue sin cambio de alcance publico: actualizar la issue y el
   handoff; no hace falta tocar el roadmap solo por cambiar el estado interno.

Un hito entregado no puede seguir presentandose como una promesa pendiente.

## Formato de `plan.md`

El archivo es deliberadamente plano para que una persona pueda editarlo:

- `## Fases`, `## Areas` y `## Hitos` abren las secciones.
- Cada `###` abre una entrada; su titulo es el texto base en espanol.
- `- clave: valor` declara un campo.
- `- clave.en: valor`, `.pt` o `.it` anade una traduccion.
- `- item:` anade un punto a una fase; las claves localizadas traducen el ultimo
  item anadido.

Estados validos: `done`, `in-progress`, `planned` y `future`. Solo una fase
puede estar en `in-progress`. Los tipos de hito son `release`, `feature`, `fix`
y `plan`.

El generador valida ids, estados, progreso, traducciones y duplicados. No se
anade un porcentaje separado para las tareas: el digest de entregas procede de
los commits y la estimacion de fase sigue siendo editorial.

## Artefacto generado y digest

`.github/scripts/roadmap_digest.py` combina `plan.md` con los commits alcanzables
desde la referencia indicada:

- publica `feat`, `fix`, `perf` y `docs`;
- descarta merges, promociones, chores, builds, tests, estilos y refactors;
- elimina ruido de issues y PRs del asunto visible;
- agrupa las entregas por dia, elimina duplicados y conserva una ventana acotada;
- guarda el ultimo SHA procesado en `roadmap.json`.

El workflow `.github/workflows/roadmap-digest.yml` ejecuta el generador sobre
`nightly`, comprueba el resultado y abre una PR de bot contra `nightly`. No hace
push directo a la rama protegida.

Comprobacion local del parser y del digest:

```powershell
python .github/scripts/tests/test_roadmap_digest.py
python .github/scripts/roadmap_digest.py --repo . --ref origin/nightly --check
```

Si `--check` detecta que el artefacto empaquetado esta atrasado, se regenera en
una PR del digest; no se edita `roadmap.json` manualmente.

## Cambios visibles para testers

Si una issue cambia comportamiento que los testers deben conocer, el worker
anade `docs/changelog/fragments/ISA-N.json` siguiendo su schema. El changelog y
los anuncios de canal se generan en sus pasos propios; una rama de issue no
publica anuncios por su cuenta.

## Documentos historicos

`docs/current-plan.md`, `docs/roadmap-execution-board.md`,
`docs/master-feature-plan.md` y los planes antiguos pueden conservar decisiones
o evidencia. No son fuentes normativas para iniciar trabajo nuevo. Si un dato
historico contradice el roadmap o la issue, se conserva como contexto y se
aplica la fuente vigente.

La antigua ruta de proyectos/snapshots publicos se conserva solo como
compatibilidad historica hasta una issue especifica. No es necesario modificar
ese material para anadir fases, areas o hitos al roadmap editorial actual.
