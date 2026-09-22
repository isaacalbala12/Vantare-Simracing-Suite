# ISA-1325 — evidencia de migración a Go 1.27.1

- Tarea principal: [Notion VAN-747](https://app.notion.com/p/3e3e51695c6581329168eec61e2dbb7e).
- Referencia técnica: [GitHub #1325](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1325).
- Base exacta: `origin/nightly@e6d7d2b5e58f55b82c0ed2f6a79667476d897086`.
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
- La build Windows de `wails3 task windows:build` pasó en CI sobre el commit de código `49e6d4c4`. Ni esa build ni la compilación cruzada local prueban el arranque físico de la aplicación o flujos con LMU.
- `quality-check (ratchet)` terminó en `REVIEW_REQUIRED` por el cambio de workflows, manifiesto, test y baselines. La revisión independiente se completó; el job continúa registrado como fallo de política previsto.
- La ruta Docker alternativa usa Garble v0.16.0 y compila `.` desde una raíz sin archivos Go; no forma parte del gate Windows ordinario y este host no dispone de Docker. El helper de telemetría que se empaqueta procede de una build aprobada con manifiesto/hash fijados; no se reconstruye aquí.
- `release.yml` exige fuente perteneciente a Nightly o Testers y puede publicar artefactos; no se disparará desde esta rama de issue. Sus pins y la ruta compartida de build se comprobarán sin promover canales.
