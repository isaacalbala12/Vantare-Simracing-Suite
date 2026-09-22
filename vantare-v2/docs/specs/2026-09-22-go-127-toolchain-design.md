# Diseño — migración de la toolchain a Go 1.27.1

- Fecha: 2026-09-22.
- Autoridad: [VAN-747](https://app.notion.com/p/3e3e51695c6581329168eec61e2dbb7e), puente técnico [GitHub #1325](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1325).
- Base: `origin/nightly@e6d7d2b5e58f55b82c0ed2f6a79667476d897086`.
- Destino de revisión: PR borrador hacia `nightly`; ninguna promoción, merge ni release está autorizada por este diseño.
- Revisión independiente del plan: mismo subagente Astra del informe, `REQUEST_CHANGES` sobre `9005e851`; observaciones incorporadas antes de modificar la toolchain.

## Decisión

Actualizar primero la toolchain de Go, sin cambiar Wails v3 beta.24 ni incorporar los hallazgos funcionales del informe de arquitectura. El objetivo es Go 1.27.1, versión parche estable vigente al comenzar. Si un fallo reproducible de compatibilidad impide superar los gates, conservar la evidencia y evaluar Go 1.26.8 como respaldo en la misma tarea antes de cerrar el candidato. El respaldo no es una rebaja silenciosa.

## Perímetro exacto

1. Cambiar la directiva `go` de `vantare-v2/go.mod` a `1.27.1`. No cambiar `toolchain`, módulos ni `go.sum` salvo que la propia toolchain demuestre una necesidad reproducible; revisar cualquier diff generado.
2. Alinear los pins activos de `.github/workflows/quality.yml`, `.github/workflows/testing-center-nightly-closeout.yml` y `.github/workflows/release.yml`. El gate de canales y el job de release que usan `go-version-file` heredan `go.mod` y se comprobarán expresamente. Alinear el `GO_VERSION` declarativo de release.
3. Alinear `tools/quality/versions.json` para la toolchain, `govet` y `go-mod-tidy`. Hacer que `Doctor` lea la versión esperada del manifiesto, eliminar el literal independiente y probar que acepta la versión declarada y rechaza otra. Reconstruir `staticcheck` y `deadcode` locales con Go 1.27.1 antes de diagnosticar fallos. Comparar hallazgos de analizadores antes y después, y recalibrar explícitamente los cuatro baselines afectados sin aceptar nuevas incidencias por accidente.
4. Añadir el hito público `milestones:go-127-toolchain` a `vantare-v2/docs/roadmap/plan.md`, redactado para el resultado realmente demostrado en el candidato. Regenerar `roadmap.json` desde la base confiable con el generador del repositorio. Actualizar el handoff vivo de plataforma con evidencia y límites.
5. Mantener separados los módulos Go del lector de telemetría, benchmark e investigación. Comprobar `go mod tidy -diff` de los cuatro módulos con la nueva toolchain, sin elevar automáticamente sus mínimos. El runtime de telemetría empaquetado tiene hash/manifiesto aprobados: no reconstruirlo ni atribuirle Go 1.27.1.
6. No tocar el comportamiento del producto Engineer, sus documentos, dependencias funcionales, Wails, UI, formatos de datos ni canal de distribución. Los Dockerfiles alternativos quedan fuera de este PR: sus scripts compilan `.` en una raíz sin archivos Go y la ruta ofuscada usa Garble v0.16.0, incompatible con Go 1.27.1. Actualizarla exige un corte propio con Garble compatible y pruebas Docker; el host actual no dispone de Docker. No afirmar que todos los caminos de compilación usan Go 1.27.1.

## Secuencia y puertas

| Fase | Acción | Puerta de salida |
| --- | --- | --- |
| 0 | Inventariar referencias y establecer base limpia | Notion, issue, worktree y SHA coherentes; sin cambios ajenos |
| 1 | Revisar este diseño y el plan ejecutable con el mismo subagente Astra del informe | Observaciones críticas resueltas antes de editar la toolchain |
| 2 | Aplicar pins, contrato de calidad y revisar tidy de cuatro módulos bajo Go 1.27.1 | Diff acotado y justificable; no cambios de dependencias accidentales |
| 3 | Reconstruir analizadores, ejecutar diagnóstico, comparar hallazgos y recalibrar baselines de forma revisada | Sin errores de integridad ni hallazgos nuevos aceptados automáticamente |
| 4 | Verificar localmente versión efectiva, tests Go aplicables, build frontend necesario para `go:embed`, validadores de roadmap y calidad | Resultados y omisiones registrados; cualquier fallo entendido y separado del cambio |
| 5 | Push de rama y PR borrador contra `nightly`; esperar CI | `Validate promotion path`, `Validate Vantare blocking gates`, `quality-check (ratchet)` y jobs pertinentes con resultados observados |
| 6 | Revisar diff y evidencia final; actualizar Notion y handoff | Candidato verificable, sin declarar integración ni release |

## Matriz de verificación

- Local macOS: `go version` debe mostrar 1.27.1; tidy de los cuatro módulos sin cambios inesperados; comprobar build frontend requerido por `go:embed`, tests Go que puedan compilar aquí, Doctor, tests de calidad, contrato de roadmap y digest. La suite `go test ./...` puede incluir paquetes Windows y dependencias nativas no disponibles en macOS: cada fallo se clasificará, no se ocultará.
- CI del PR en Windows: `go test ./...`, contrato TypeScript de telemetría, frontend build y suite, Wails `windows:build` con `production`, además de los checks de política y quality Linux. Comprobar el paso **Validate roadmap contract** en sí mismo: el job puede aparecer verde aunque ese paso falle porque hoy está en modo `audit`. El build de Wails no equivale a ejecutar físicamente la aplicación.
- Calidad: `REVIEW_REQUIRED` debido exclusivamente a modificar rutas de política es un resultado previsto que exige revisión independiente y no se presentará como PASS. Errores de ejecución/integridad y nuevos hallazgos bloquean el candidato. Registrar el estado real del job y si la protección remota exige `success`.
- CI de release: inspeccionar coherencia del `go-version-file` y del pin declarado. No disparar `release.yml` contra una rama de issue porque su contrato de origen exige un SHA integrado en canal y puede publicar artefactos o releases.
- Docker: las etiquetas oficiales `golang:1.27.1-bookworm` y `1.27.1-alpine` existen, pero los Dockerfiles alternativos no forman parte del pipeline Windows y tienen defectos previos. No se probarán ni editarán en este corte; se abrirá seguimiento separado. Esta limitación impide afirmar migración universal de todas las rutas.
- Vulnerabilidades: ejecutar `govulncheck` fijado a versión reproducible con Go 1.27.1 sobre los paquetes principales pertinentes para Windows y comparar los hallazgos de biblioteca estándar con el informe previo. Un error del escáner es falta de verificación, no ausencia de vulnerabilidades. El helper nativo precompilado se excluye de esa conclusión.

## Riesgos y reversión

- Go 1.27 puede revelar incompatibilidades en Wails beta.24, analizadores o código que Go 1.25 permitía. Resolver solo el cambio mínimo necesario, con evidencia y revisión; no aprovechar la migración para refactorizar.
- Los Dockerfiles alternativos quedan con sus versiones previas y necesitan tarea separada; no permiten certificar builds cruzadas u ofuscadas de Go 1.27.1. Garble v0.18.0 declara soporte para Go 1.27, pero su adopción y la reparación de los puntos de entrada del contenedor quedan fuera del presente PR.
- Los workflows de `release.yml` y closeout de Testing Center dependen de condiciones de canal/secretos: no se publicarán para probar la toolchain. Sus pins se verifican estáticamente y el build Windows ordinario prueba la ruta compartida.
- Reversión: revertir el commit de pins/documentación y cerrar la PR borrador si los gates no se pueden superar dentro del alcance. Ningún canal se habrá promovido.
