# ISA-1325 — evidencia de migración a Go 1.27.1

- Tarea principal: [Notion VAN-747](https://app.notion.com/p/3e3e51695c6581329168eec61e2dbb7e).
- Referencia técnica: [GitHub #1325](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1325).
- Base inicial: `origin/nightly@e6d7d2b5e58f55b82c0ed2f6a79667476d897086`; base actual incorporada: `origin/nightly@8b25d076ea9a6ba6be8dc3065bcde978b6d24f07` en `5fc8fff8dd253ab042e51dbe263bf6ab4e4b983e`.
- Alcance: módulo Go principal, workflows activos, política de calidad y roadmap. Wails permanece en beta.24. Sin cambios del helper nativo publicado ni de las rutas Docker alternativas.

## Revisión previa del plan

El mismo subagente Astra que revisó el informe de arquitectura emitió `REQUEST_CHANGES` sobre el plan inicial `9005e851`. Identificó el literal Go 1.25.0 de Doctor, la invalidez de los cuatro baselines al cambiar el analizador Go, la obligación de tratar `REVIEW_REQUIRED`, los cuatro módulos examinados por tidy y los límites de Docker/helper. El plan se corrigió en `21029be5` antes de cambiar la toolchain; el revisor dio GO para comenzar la implementación, no para integrar ni publicar.

## Verificación local del candidato

| Comprobación | Resultado observado |
| --- | --- |
| Toolchain efectiva | `go version go1.27.1 darwin/arm64` |
| `go mod tidy -diff` | PASS, sin diferencias en módulo principal, lector, benchmark y spike `ta03b`; los tres últimos conservan su mínimo Go anterior |
| Doctor | PASS, cero incidencias con Go 1.27.1, Node 22.23.2 y pnpm 9.1.0 |
| Prueba del contrato de Doctor | PASS: acepta la versión declarada y rechaza Go 1.25.0 |
| Frontend build para `go:embed` | PASS con Node 22.23.2; sin cambios frontend |
| Compilación cruzada directa Windows | PASS con `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -tags production`; `go version -m` del ejecutable confirma Go 1.27.1. El empaquetado Wails se verificó también en CI |
| Tests de calidad | Ratchet 30/30 y suite negativa 28/28 PASS tras recalibrar |
| Calidad del candidato | Analizadores sin fallos de ejecución, integridad ni hallazgos nuevos respecto de los baselines recalibrados; agregado `REVIEW_REQUIRED` por rutas de política modificadas |
| Roadmap | `roadmap_digest.py --check` PASS; 23 tests de digest, 21 de contrato y 45 de topología PASS. El validador local de la issue viva confirmó exactamente `milestones:go-127-toolchain`; el paso de contrato de CI también pasó en el SHA `49e6d4c4` |
| Vulnerabilidades | `govulncheck` v1.8.0, Go 1.27.1, `GOOS=windows`, `GOARCH=amd64`, tag `production`, paquetes `internal/server`, `authsession`, `license`, `updater` y `app`: exit 0 y cero eventos `finding` a nivel de símbolo. Base consultada con última modificación 2026-09-16. Esto no cubre todos los paquetes ni el helper precompilado |

## Revisión independiente y CI remoto

El mismo subagente Astra que objetó el plan inicial revisó el diff de código y política del commit `49e6d4c4a4359b35c652ddba8d6cbb8b2b267900` y emitió **ACCEPT**: cero P0, P1 o P2 introducidos. Contrastó las identidades y multiplicidades de los cuatro baselines, repitió 30 pruebas del ratchet, 28 negativas y los cuatro `go mod tidy -diff`, e inspeccionó el ejecutable Windows y el JSON original de `govulncheck`. Confirmó los diez puntos `SA4023` duplicados en Linux/Windows sobre un archivo idéntico a Nightly. La revisión satisface el requisito independiente de política; no transforma el estado de CI en `success`.

| Gate en el PR borrador #1327 sobre `49e6d4c4` | Resultado |
| --- | --- |
| [Promoción y contrato de roadmap](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35783994102/job/106936181681) | **SUCCESS**; el paso `Validate roadmap contract` pasó contra la issue #1325 |
| [Gate Windows de producto](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35783994102/job/106936316324) | **SUCCESS**; instalación de Wails beta.24, build frontend, contrato TypeScript de telemetría, `go test ./...`, tests frontend, lint y `wails3 task windows:build` pasaron |
| [Ratchet de calidad](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35783994031/job/106936181458) | **FAILURE / REVIEW_REQUIRED** por once rutas de política modificadas; todos los analizadores terminaron con NEW=0, MOVED=0, RESOLVED=0 e integridad correcta frente al baseline revisado |
| GitGuardian | **SUCCESS** |

La protección remota de `nightly` exige los dos primeros checks y que la rama esté actualizada; el ratchet no figura como check obligatorio. No se rebajó la política para conseguir un resultado verde. El workflow de calidad no adjuntó su `last-run` porque `upload-artifact` omite archivos ocultos por defecto; el log conserva el resumen y el defecto heredado quedó en [una tarea Notion pendiente](https://app.notion.com/p/3e3e51695c6581c584c5c4138cebd380). También se registraron tareas pendientes para las [rutas Docker alternativas](https://app.notion.com/p/3e3e51695c6581448e14dd037a877708) y la [CLI administrativa](https://app.notion.com/p/3e3e51695c658132b644c6f7430242f8).

### Estado de la comprobación posterior al commit documental

El commit posterior `4bd4b43ddd6fee0c119eaf58534341d237150f9d` solo modifica cuatro documentos; el código, la toolchain y la política son idénticos a `49e6d4c4`. En ese SHA, el [primer intento del gate Windows](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35785560562/job/106941521869) y su [repetición](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35785560562/job/106942748461) fallaron en el mismo test fuera de alcance por agotar un plazo de ocho segundos. Ese test había pasado en el run del SHA de código. El [ratchet del SHA documental](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35785560547/job/106941380652) repitió `REVIEW_REQUIRED`, con NEW/MOVED/RESOLVED=0 e integridad correcta.

En aquel momento, la build Wails y la suite completa estaban acreditadas en el commit de código, pero el PR no disponía de un gate Windows verde en su HEAD documental. No se atribuye el fallo intermitente a Go 1.27.1. La corrección acotada y su verificación posterior figuran a continuación.

### Reanudación y candidato de corrección · 23-09-2026

Isaac autorizó completar la migración, incluida la corrección acotada de ese test. La inspección del código mostró que `PlayContext` esperaba una señal de error de WPF al recibir una ruta inexistente; en tres runs Windows la señal no llegó antes del timeout de ocho segundos. El candidato valida la existencia del archivo antes de iniciar PowerShell y devuelve el error de sistema envuelto. La prueba exige `os.ErrNotExist`; la prueba de ciclo de vida crea un archivo de prueba para seguir ejercitando un proceso activo. Se conserva la cancelación de contexto y no se cambia el script WPF ni el límite de duración.

Comprobaciones locales del candidato: `gofmt -d` sin diferencias; test del paquete en macOS PASS, compilación de su ejecutable de pruebas para Windows PASS, `GOOS=windows go vet ./...` y staticcheck focal PASS con Go 1.27.1. `go vet ./...` sobre macOS continúa fallando por una referencia de plataforma fuera de este diff.

### Verificación remota de la corrección en `3cca49f6`

| Comprobación | Resultado observado |
| --- | --- |
| [Promoción y contrato de roadmap](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35802080443/job/106994475202) | **SUCCESS** |
| [Gate Windows](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35802080443/job/106994546114) | **SUCCESS**; pasaron `go test ./...`, incluido `TestPlayerRejectsMissingMedia`, build y tests frontend, contrato TypeScript, lint de archivos modificados, gate visual y `wails3 task windows:build` |
| [Ratchet de calidad](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35802080441/job/106994474355) | **FAILURE / REVIEW_REQUIRED** por rutas de política modificadas; en el paso CI final todos los analizadores terminaron con NEW=0, MOVED=0, RESOLVED=0 e integridad correcta. La revisión Astra previa cubrió esas rutas y baselines; el pequeño cambio posterior de código fue revisado manualmente y pasó el gate Windows |
| GitGuardian | **SUCCESS** |

Estos resultados corresponden al SHA `3cca49f6b63ff8d05a0e60b5a1b6001acdde06af`. El PR continúa en borrador. Sus checks obligatorios del HEAD final y la base remota Nightly se comprueban de nuevo antes de solicitar integración.

## Recalibración del ratchet

La comparación se hizo **antes** de aceptar el nuevo baseline. `staticcheck` 2026.2.1 y `deadcode` v0.49.0 se recompilaron localmente con Go 1.27.1; `go version` de ambos binarios confirmó esa toolchain. El `staticcheck` anterior tenía la misma versión nominal, pero estaba compilado con Go 1.26.8 y fallaba al analizar un módulo Go 1.27; se descartó ese falso diagnóstico de incompatibilidad del producto.

| Analizador | Baseline anterior | Nuevo | Añadidos | Resueltos | Movidos |
| --- | ---: | ---: | ---: | ---: | ---: |
| staticcheck | 194 | 214 | 20 | 0 | 0 |
| govet | 0 | 0 | 0 | 0 | 0 |
| knip | 499 | 427 | 0 | 72 | 0 |
| jscpd | 514 | 486 | 0 | 28 | 0 |

Los 20 hallazgos añadidos son el mismo `SA4023` en `cmd/vantare-admin/main.go`, contabilizado en las dos configuraciones. Ese archivo está idéntico a la base y sus funciones REST aún son stubs que devuelven error; el analizador detecta comparaciones siempre verdaderas. Se conservan como deuda preexistente **identificada**, sin aceptar nuevas incidencias funcionales del cambio de toolchain ni modificar la CLI administrativa en esta tarea. El mecanismo `baseline --confirm` se usó después de comparar identidades. Las 100 resoluciones corresponden a hallazgos antiguos que ya no aparecen en la base Nightly actual.

## Límites de la prueba

- La ejecución completa de `go test ./...` en este host macOS no pasó: hubo fallos en launcher y diagnóstico, y un test de cancelación agotó sus diez minutos. También fallaron pruebas de grabación/SQLite por permisos y una sesión activa. Esta ejecución no se usó como señal verde; el gate Windows del PR es la prueba del sistema objetivo. No se ha atribuido todavía cada fallo macOS a una causa anterior o nueva.
- La build Windows de `wails3 task windows:build` pasó en CI sobre `49e6d4c4` y `3cca49f6`. Ni esa build ni la compilación cruzada local prueban el arranque físico de la aplicación o flujos con LMU.
- `quality-check (ratchet)` terminó en `REVIEW_REQUIRED` por el cambio de workflows, manifiesto, test y baselines. La revisión independiente se completó; el job continúa registrado como fallo de política previsto.
- La ruta Docker alternativa usa Garble v0.16.0 y compila `.` desde una raíz sin archivos Go; no forma parte del gate Windows ordinario y este host no dispone de Docker. El helper de telemetría que se empaqueta procede de una build aprobada con manifiesto/hash fijados; no se reconstruye aquí.
- `release.yml` exige fuente perteneciente a Nightly o Testers y puede publicar artefactos; no se disparará desde esta rama de issue. Sus pins y la ruta compartida de build se comprobarán sin promover canales.

## Actualización a Nightly vigente y rendimiento · 23-09-2026

Por petición de Isaac, el PR #1327 incorporó `nightly@8b25d076` mediante el merge `5fc8fff8`. El único conflicto fue `docs/roadmap/roadmap.json`, un artefacto generado; se regeneró con `--ref origin/nightly` y su `--check` pasó. La rama está actualizada con esa base. En el [run del SHA combinado](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35847190898), promoción/roadmap, suite Go y frontend, gate visual y build Wails en Windows terminaron **SUCCESS**. [Quality](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35847191220/job/107136083019) repitió **FAILURE / REVIEW_REQUIRED** por las diez rutas de política modificadas, con NEW=0, MOVED=0 y una resolución en knip. GitGuardian terminó SUCCESS.

El [análisis de rendimiento previo a integrar](isa-1325-go-127-performance.md) compara el mismo código combinado con Go 1.25.0 y 1.27.1 en Windows. El microbenchmark de `WriteBatch` de overlay con demanda registrada, sin entrega al frontend, empeoró un **39,1 % en tiempo** y **34,8 % en bytes asignados**; diez de diez pares fueron más lentos. La proyección pura de 104 vehículos mejoró un 14,4 %, mientras que JSON canónico de 44 vehículos empeoró un 51,6 %. Una segunda comparación Windows del mismo árbol con `GOEXPERIMENT=nojsonv2` recuperó un 30,5 % de tiempo y 25,6 % de bytes en `WriteBatch`; pasaron los tests focales de overlay y aplicación. El opt-out temporal se incorporó a las builds Windows canónicas, a los scripts de medida/Orbit y a los gates de producto/release, con comprobación del metadato del ejecutable.

### Pipeline de la mitigación en `ac2cc763` · 23-09-2026

En el [run del SHA de código](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35850775088), **SUCCESS** para promoción/roadmap y gate Windows completo: contrato TypeScript, suite Go, build y tests frontend, gate visual, build Wails y comprobación de `GOEXPERIMENT=nojsonv2` con `go version -m bin/vantare.exe`. GitGuardian **SUCCESS**. [Quality](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/35850775070) terminó **FAILURE / REVIEW_REQUIRED** por política modificada; la pasada CI final registró `NEW=0`, `MOVED=0` en todos los analizadores y `RESOLVED=1` en Knip. El subagente Astra max dio **ACCEPT con reservas** al diff de la mitigación y al informe, sin hallazgos P0–P2. La reserva es la falta de ensayo físico con LMU/OBS; los scripts locales de medida quedan alineados con el binario de Windows. El PR permanece en borrador y se deben comprobar los checks de cualquier HEAD posterior antes de integrar.
