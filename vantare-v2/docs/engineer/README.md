# Engineer — router documental

Estado: vigente desde ISA-313 / ENG-R01 Fase 5. Este archivo decide qué leer;
no sustituye Linear, los contratos ni la evidencia del runtime.

Todas las rutas de este router y del context pack se resuelven desde
`vantare-v2/`, directorio de aplicación del worktree. El
[README homónimo de la raíz Git](../../../docs/engineer/README.md) es histórico
y no forma parte del context pack.

## Autoridad y precedencia

1. [AGENTS.md](../../AGENTS.md) y [plan global](../current-plan.md).
2. [Expediente del programa](../vantare-program/README.md) y
   [contrato de producto](../vantare-program/product-contract.md).
3. Linear para alcance, dependencias, rama y estado.
4. [Handoff vivo](../vantare-program/handoffs/engineer-spotter.md).
5. Plan de fase, contratos aplicables, código, tests y evidencia del runtime.
6. Snapshots e históricos solo para la pregunta concreta que los requiera.

La evidencia reciente del runtime prevalece sobre planes históricos. Una issue
no modifica por sí sola un contrato de producto o arquitectura.

## Fase activa

Isaac aceptó humanamente ISA-313 / ENG-R01 Fase 5 el 2026-08-12 y dejó vigente
la arquitectura documental y el [plan de Spotter](phases/spotter/plan.md). S1
está en **replanning técnico con ISA-327** y rama propia
`vantareapp/isa-327-eng-s1-spotter-autoridades-y-baseline-confiable`; la
implementación no ha comenzado hasta aprobar su microplan (cortes A/B/C). La
prueba manual de cada corte crece en la pestaña Ingeniero (frontend) sin crear
lógica paralela de debug. La
única aceptación acumulativa de la fase Spotter es
[acceptance.md](phases/spotter/acceptance.md).

## Lectura por rol

### Orquestador

Lee las autoridades anteriores, Linear, handoff, plan activo y aceptación.
Prepara el context pack mínimo, coordina workers y reviewers, revisa diff y
evidencia, y actualiza el estado vivo. Engineer/Spotter se desarrolla
exclusivamente mediante workers subagentes; sus reportes son respuestas
estructuradas, no nuevos documentos.

### Research

Lee la [política de research](../vantare-program/research-policy.md) y el
[índice de research Engineer](../vantare-program/research/engineer/README.md).
Puede leer dossiers para investigar, pero entrega al implementer únicamente
conclusiones sanitizadas mediante el brief clean-room autorizado.

### Implementer

Context pack base permitido, con rutas exactas:

- `AGENTS.md`;
- `docs/current-plan.md`;
- `docs/vantare-program/README.md`;
- `docs/vantare-program/product-contract.md`;
- `docs/vantare-program/handoffs/engineer-spotter.md`;
- `docs/engineer/README.md`;
- `docs/engineer/phases/spotter/plan.md`;
- `docs/engineer/phases/spotter/acceptance.md`;
- `docs/vantare-program/research/engineer/crewchief-clean-room-brief-2026-08-10.md`;
- la issue de Linear asignada.

El orquestador añade solo las rutas exactas de contratos, código y tests que
la issue o el replanning aprobado enumeren. Si esa lista falta o es ambigua, el
implementer se detiene y la pide; no explora categorías o directorios.

Nunca lee dossiers CrewChief crudos, historia, otros proyectos o fases, ni
reviews previas. Tampoco abre el índice de research. No recibe reportes
narrativos de otros workers como autoridad.

### Spec reviewer

Lee criterios, plan, contrato, SHA/diff y tests. Su primera pasada es
independiente del relato del implementer; después puede contrastar el reporte.

### Quality reviewer

Lee reglas, alcance, SHA/diff, tests y riesgos. Su primera pasada es
independiente del spec review y de reportes anteriores.

### Adversarial reviewer

Puede leer dossiers y evidencia histórica para buscar contaminación,
omisiones, falsas equivalencias y riesgos. No convierte material competitivo
en instrucciones para el implementer.

## Documentos Engineer

### Planificación vigente

- [Roadmap general](engineer-beta-roadmap.md).
- [Plan Spotter](phases/spotter/plan.md) y
  [aceptación acumulativa](phases/spotter/acceptance.md).
- [Baseline Vantare 2026-08-11](phases/spotter/audits/2026-08-11-vantare-baseline.md):
  auditoría de entrada, no especificación de implementación.

### CURRENT CONTRACT

- [Projection y consumidores legacy](projection-contract-and-legacy-consumers.md).
- [Presentación](presentation-contract.md) y
  [radio](radio-output-contract.md).
- [Catálogo de comandos](command-catalog-corpus-isa-183.md),
  [diálogo](dialogue-router-isa-186.md) y [PTT](ptt-input-isa-185.md).

### SNAPSHOT / ISSUE EVIDENCE

- [Projection adapter](projection-adapter.md),
  [replay oracle](replay-oracle.md),
  [policy/scheduler](message-policy-scheduler.md) y
  [delivery runtime](delivery-runtime.md).
- [Selección TTS/STT](tts-stt-selection-isa-180.md),
  [benchmark](tts-stt-benchmark-isa-180.md),
  [corpus humano](human-corpus-voice-host-isa-181.md) y
  [voice package host](voice-package-host-isa-182.md).

Estos snapshots prueban cortes concretos; sus estados WIP antiguos no
describen Nightly. Se usan para auditoría o para localizar evidencia, no para
elegir trabajo.

### HISTORICAL / SUPERSEDED

- [G3 parity audit](audits/g3-parity-audit.md).
- [OBS setup antiguo](../engineer-obs-setup.md).
- [Radio overlay spec antiguo](../engineer-radio-overlay-spec.md).

## Qué no leer por defecto

No abras dossiers competitivos, bitácoras Git, planes sustituidos, documentos
de otras fases/proyectos, reviews anteriores ni snapshots de issues no
aplicables. Amplía contexto solo ante una pregunta concreta y respetando el rol.
