# Strategy recorded editor audit Implementation Plan

> **For agentic workers:** Use `executing-plans` for this approved audit, inline
> and sequential by default. No implementation or nested delegation is implied.

**Goal:** Producir evidencia de código y corpus que permita fijar criterios de
calidad y un protocolo independiente antes de modificar el editor/motor.

**Architecture:** Reusar descubrimiento/reader y analizar owners actuales; original
intacto, copias técnicas temporales para lectura aislada cuando el reader lo exija.
Estas copias no activan la opción de biblioteca persistente del producto.

**Tech Stack:** Git/PowerShell, Go, Python estándar y reader DuckDB aprobado.

---

Issue #1030. Depende de #1028: spec aprobada. Plan v1 pendiente de aprobación.
No ejecutar bancos, UI o LMU al crear esta issue. No hay código productivo en F0.
El maestro `2026-09-08-strategy-recorded-editor-master.md` define fases posteriores.

## Task 1: Fijar base, permisos y custodia de la evidencia

Archivos a leer: `AGENTS.md`, handoff Strategy, spec aprobada, este plan,
`internal/strategy/coldstart/lmu_importer.go`, README/script del spike ISA-694.
Crear tras iniciar ejecución: `docs/strategy-planner/evidence/isa-1030/README.md`.

- [ ] Verificar issue y base antes de abrir worktree. No asumir que el commit local
  de #1028 ya está en nightly: integrar documentación solo con autorización, o
  acordar explícitamente su commit como base apilada de auditoría.

```powershell
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git status --short
git worktree list
gh issue view 1030 --json body,state,comments
```

- [ ] Registrar SHA, rama, alcance y autorización existente de lectura del corpus
  LMU de Isaac. Verificar la raíz estándar declarada en `lmu_importer.go`; si no
  existe, buscar solo rutas ya conocidas del proyecto y pedir ubicación si hace
  falta. No inspeccionar todo el disco ni secretos.
- [ ] Comprobar sesión de trabajo compartida antes de bancos y verificar que la
  biblioteca elegida no está recibiendo escrituras. No arrancar/cerrar LMU.
- [ ] Definir salida local de evidencia fuera del historial antiguo. Solo agregar
  a Git informes sanitizados, nunca originales ni rutas/nombres personales.
- [ ] Registrar contrato de cada artefacto: inventario usa identificador local,
  identidad de contenido, combinación normalizada, clase de sesión, duración,
  cobertura de canales, integridad y razón de omisión. Mapa a rutas queda local.

Resultado esperado: base verificable y fuentes dentro de autoridad. Si no se
cumple, pausar solo lectura/banco afectados y continuar revisión estática.

## Task 2: Auditar criterio actual y pruebas

Crear `docs/strategy-planner/evidence/isa-1030/code-matrix.md`.
Leer `lapvalidity.go`, `consumptionpace.go`, `derivedcurves.go`,
`required_channels.go`, `sessioncatalog.go` y sus tests.

- [ ] Extraer reglas exactas con ubicación y unidad:

```powershell
rg -n 'func labelIncidentLaps|func labelTrafficLaps|func labelPaceOutliers|func familyUseForLap|Minimum|Maximum|Tolerance' internal/telemetryanalysis/lapvalidity.go
rg -n 'func |familyIncluded|Reason|Presence' internal/telemetryanalysis/consumptionpace.go
rg -n 'func |separab|temperature|wear|compound' internal/telemetryanalysis/derivedcurves.go
rg -n 'func Test' internal/telemetryanalysis/lapvalidity_test.go internal/telemetryanalysis/consumptionpace_test.go internal/strategy/backtest/backtest_test.go
```

- [ ] Para invalidación del simulador, pit, impacto, tráfico, ritmo atípico,
  temperatura, desgaste, relojes y gaps, registrar señal origen, supuesto,
  decisión por familia, test protector y limitación. No convertir constantes
  históricas en umbrales aprobados del nuevo corte.
- [ ] Verificar si se dispone de señal de invalidación/trompo y con qué semántica;
  ausencia de etiqueta no demuestra ausencia de incidente.
- [ ] Ejecutar checks focales existentes, sin editar tests ni código:

```powershell
go test ./internal/telemetryanalysis -run 'TestAnalyzeLapValidity|TestLapValidityLabelsAndFamilyExclusions|TestDiscover' -count=1
go test ./internal/strategy/backtest -count=1
```

Resultado esperado: PASS/FAIL literal por comando, sin equivalencia a prueba real
Wails. Un fallo no comprendido bloquea la conclusión afectada, no autoriza arreglar.

## Task 3: Inventariar corpus real sin pisar el spike histórico

Crear `docs/strategy-planner/evidence/isa-1030/corpus-summary.md` y conservar
manifest detallado sanitizado. Reusar el spike solo como instrumento inventarial,
no como autoridad de etiquetas nuevas. Auditar sus salidas antes de versionarlas.

- [ ] Leer las opciones y custodia del script existente:

```powershell
rg -n 'DEFAULT_SOURCE|DEFAULT_RUNTIME|OUTPUT_DIR|WORK_DIR|add_argument|dump_csv|dump_json' docs/strategy-planner/evidence/isa-694-spike/spike_f0_1.py
Get-Content docs/strategy-planner/evidence/isa-694-spike/README.md
```

- [ ] Copiar únicamente el script a una carpeta temporal nueva: sus resultados
  se escriben junto al script. Así no sobrescribe evidencia histórica. Ejecutar
  primero inventario acotado sin análisis de sesiones; no usar sus muestras
  analíticas antes de separar preparación/evaluación.

```powershell
$strategyAuditDir = Join-Path ([IO.Path]::GetTempPath()) ('vantare-isa1030-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $strategyAuditDir | Out-Null
$strategyAuditScript = Join-Path $strategyAuditDir 'spike_f0_1.py'
Copy-Item -LiteralPath 'docs/strategy-planner/evidence/isa-694-spike/spike_f0_1.py' -Destination $strategyAuditScript
python $strategyAuditScript --max-sessions 2 --analysis-sessions 0
```

Los defaults solo se usan tras verificar que apuntan a la biblioteca y runtime
autorizados. Si no coinciden, emplear `--source`/`--runtime` con rutas verificadas
en la sesión; no inventarlas ni copiarlas al informe público.

- [ ] Revisar exit code, omissions, contenido y custodia. Un archivo omitido por
  WAL/inestabilidad no cuenta como sesión analizada ni como falta permanente.
- [ ] Si el smoke demuestra lectura segura y recursos aceptables, inventariar el
  conjunto estable sin activar sus análisis históricos:

```powershell
python $strategyAuditScript --max-sessions 0 --analysis-sessions 0
```

- [ ] Clasificar sesiones completas de carrera y condiciones disponibles usando
  metadata real. Dedupe por contenido; no usar solo el nombre del archivo. Registrar
  cobertura, carencias y fallos, preservando originales y logs sanitizados.

Resultado esperado: denominadores y fuentes reproducibles. Si el instrumento no
expone campos necesarios, registrar el gap y abrir microplan de instrumentación
en esta issue antes de añadir código; nunca completar celdas como si se midieran.

## Task 4: Separación de conjuntos y anotación

Crear `docs/strategy-planner/evidence/isa-1030/evaluation-protocol.md`.
Leer `internal/strategy/backtest/holdout.go`, `types.go`, `identity.go` y tests.

- [ ] A partir de metadata, separar por combinación y cronología preparación y
  carreras de evaluación; deduplicar antes del split y registrar su versión.
  No abrir resultados analíticos de evaluación para escoger filtros.
- [ ] En preparación, revisar observaciones reales representativas con evidencia
  del canal: invalidada utilizable, incidente, vuelta lenta válida, out/in lap,
  stint degradado, temperatura/clima distinto y recursos. Si una clase no existe,
  registrar falta de cobertura en vez de fabricar un caso real.
- [ ] Para cada caso, anotar evidencia, incertidumbre y utilidad independiente
  para ritmo, Fuel, VE, desgaste y pit; adjudicar ambigüedad con Isaac cuando
  la telemetría no permita resolverla. La anotación no parte del filtro a validar.
- [ ] Registrar contaminación aceptada y datos útiles excluidos; proponer métricas
  de consumo/ritmo/tiempo, factibilidad y ranking separadas. Medir sesgo por tipo
  de condición, no solo media global.
- [ ] Derivar de preparación la propuesta numérica de umbrales y muestra mínima,
  justificar incertidumbre/cobertura y revisarla con Isaac antes de evaluación.
  Con corpus insuficiente, proponer ampliar muestra o reducir alcance declarado.

Resultado esperado: protocolo cerrado y verificable, no promesa de umbral ni PASS.
F0 prepara la evaluación final; no consume su conjunto reservado para hacer verde
el baseline. Los fixtures sintéticos siguen siendo tests de contrato, no corpus.

## Task 5: Cerrar auditoría y abrir solo siguientes cortes demostrados

Actualizar `README.md`, el handoff Strategy y #1030. El informe responde por cada
requisito de la spec: existente, insuficiente, ausente o no verificable, con ruta,
test/caso, severidad, responsable interno y dependencia. No afirma producto listo.

- [ ] Revisar matriz, inventario y protocolo; conservar cifras con denominadores,
  unidades, método y limitaciones. Separar tests, lectura real y Wails no ejecutado.
- [ ] Abrir issues de F1/F2 solo para gaps demostrados, reutilizando #819/#821/#803
  si siguen vigentes. No repetir #813/#824 por su estado antiguo en el tracker.
- [ ] Escribir microplanes de los primeros cortes con máximo aproximado de cinco
  archivos de lógica/test por cambio y tests de comportamiento previos al fix.
- [ ] Comprobar diff y revisar que no contiene telemetría cruda, rutas personales,
  secretos, fixtures históricos sobrescritos ni modificación de originales:

```powershell
git diff --check
git diff --stat
git status --short
```

- [ ] Commit solo de evidencia sanitizada/documentación seleccionada; actualizar
  issue con SHA y checks reales. Si cambia alcance público, actualizar `plan.md`
  y generar su digest en el mismo PR. Sin merge, publicación ni live implícitos.

## Gate de salida

No hay decisión funcional pendiente de esta entrevista. Sí hay trabajo empírico
pendiente: cobertura, etiquetas defendibles, umbrales y duración de cálculo.
La aprobación de este plan permite ese trabajo acotado; no convierte evidencia
ausente en un diseño de filtros ni autoriza la implementación posterior.
