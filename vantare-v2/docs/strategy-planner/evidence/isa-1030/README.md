# ISA-1030 — Auditoría de Strategy registrado

Estado: banco y revisión estática completados; gate empírico F0 pendiente.
Fecha: 2026-09-08. #1030 continúa abierta; no se implementó el editor.

## Autoridad y entorno

- Spec v1 y planes aprobados por Isaac en la conversación.
- Base explícitamente autorizada: `b4de3035d3b7d3661bce0a59d363d841df2b5a0e`.
- Rama: `vantareapp/isa-1030-strategy-corpus-audit`; worktree aislado.
- F0 solo audita y documenta: no cambia producto ni originales.
- Isaac confirmó exclusividad disponible para el banco. LMU estaba abierto y
  se conserva intacto. Archivos con WAL/inestables quedan excluidos.
- Salida local del instrumento fuera del repo; evidencia histórica intacta.
- El runtime instalado no coincidía con el manifest confiado por la base y no
  se ejecutó. Se localizó el artefacto de ISA-1011: manifest SHA-256
  `700201f90266ae6b829372d9989408c6b0efd86725a50980d46fc05adfc24869`
  y hashes/tamaños de sus cuatro archivos verificados antes del helper.

## Resultado

- Carpeta estándar: 414 DuckDB y 47 WAL en la inspección inicial.
- Smoke inventarial: 2/2 fuentes, cero análisis y cero errores; exit 0.
- Inventario completo: 367/367, cero fallos, 266.596 s; 59 combinaciones exactas.
- Separación congelada: 363 preparación y cuatro candidatas reservadas de
  1–4 vueltas. Las 19 carreras de más de cuatro vueltas ya estaban expuestas
  al spike histórico; falta evaluación independiente de carreras completas.
- Cuatro fuentes de preparación inspeccionadas; hashes de originales coinciden
  tras leer. No hay anotaciones independientes suficientes para medir
  contaminación/descarte ni proponer umbrales honestamente.
- `go test ./internal/telemetryanalysis -run
  'TestAnalyzeLapValidity|TestLapValidityLabelsAndFamilyExclusions|TestDiscover'
  -count=1`: PASS, 0.054 s reportados por Go (sin tiempo de compilación).
- `go test ./internal/strategy/backtest -count=1`: PASS, 0.047 s reportados por Go.
- No se ejecuta Wails ni se declara validación física de estrategia.
- `py_compile` del instrumento: PASS. Verificación de hashes únicos, disjunción
  y cortes temporales: PASS. Guard de reserva: exit 1 esperado con
  `only training sources can be inspected`, antes de abrir el helper.
- No se ejecutó suite Go completa, frontend, build ni solver sobre el corpus:
  no se modificó lógica productiva. Los checks anteriores no reemplazan esos gates.

## Archivos del expediente

- `code-matrix.md`: criterios existentes, gaps y alcance de la evidencia.
- `corpus-summary.md`: inventario, cobertura y separación de conjuntos.
- `evaluation-protocol.md`: protocolo de medición y límites empíricos.
- `split-manifest.json`: identidades completas y reserva congelada, sin rutas.
- `training-observations.json`: agregados de cuatro fuentes; no verdad causal.
- `next-slices.md`: microplanes #819/#821/#803 y nuevo contrato #1033.
- `instrumentation-plan.md` y `audit_corpus.py`: instrumento aislado de auditoría.

Las propuestas numéricas requieren datos de preparación y anotación independiente;
no se adoptan las constantes actuales como umbrales aprobados del nuevo editor.

## Repetir y revisar

Crear otra carpeta privada, verificar el runtime contra la confianza de la base,
copiar el spike sin cambiarlo y ejecutar primero `--max-sessions 2
--analysis-sessions 0`, después inventario completo con `--max-sessions 0`.
`audit_corpus.py --help` describe split/inspect; usar la biblioteca autorizada.
Nunca regenerar este split al ajustar criterios ni abrir las candidatas con inspect.
Para el estado de este banco, cotejar hashes con el manifiesto congelado; las
nuevas sesiones constituyen otro protocolo, no una modificación retrospectiva.

Revisión manual: comparar las tablas del corpus con los dos JSON, revisar los
gaps de la matriz y adjudicar casos de preparación con contexto/replay. No hace
falta arrancar LMU para leer el informe. No hay nueva pantalla que probar todavía.

Entrega local sobre la base aprobada: documentación, agregados e instrumento.
Sin push, PR, CI remota, merge, promoción o release. Acciones del tracker:
actualización de #1030 y alta de #1033 en Backlog del Project Vantare.
