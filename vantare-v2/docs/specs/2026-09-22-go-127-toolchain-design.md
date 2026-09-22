# Diseño — migración de la toolchain a Go 1.27.1

- Fecha: 2026-09-22.
- Autoridad: [VAN-747](https://app.notion.com/p/3e3e51695c6581329168eec61e2dbb7e), puente técnico [GitHub #1325](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1325).
- Base: `origin/nightly@e6d7d2b5e58f55b82c0ed2f6a79667476d897086`.
- Destino de revisión: PR borrador hacia `nightly`; ninguna promoción, merge ni release está autorizada por este diseño.

## Decisión

Actualizar primero la toolchain de Go, sin cambiar Wails v3 beta.24 ni incorporar los hallazgos funcionales del informe de arquitectura. El objetivo es Go 1.27.1, versión parche estable vigente al comenzar. Si un fallo reproducible de compatibilidad impide superar los gates, conservar la evidencia y evaluar Go 1.26.8 como respaldo en la misma tarea antes de cerrar el candidato. El respaldo no es una rebaja silenciosa.

## Perímetro exacto

1. Cambiar la directiva `go` de `vantare-v2/go.mod` a `1.27.1`. No cambiar `toolchain`, módulos ni `go.sum` salvo que la propia toolchain demuestre una necesidad reproducible; revisar cualquier diff generado.
2. Alinear los pins activos de `.github/workflows/quality.yml`, `.github/workflows/testing-center-nightly-closeout.yml` y `.github/workflows/release.yml`. El gate de canales y el job de release que usan `go-version-file` heredan `go.mod` y se comprobarán expresamente. `GO_VERSION` de release, aunque hoy no lo consuma ningún paso, quedará alineado o se retirará solo si su ausencia no rompe un contrato externo.
3. Revisar los dos Dockerfiles de build de Vantare: el contenedor de compilación cruzada está en Go 1.26 y el de server usa una etiqueta flotante. Fijarlos a 1.27.1 si las etiquetas oficiales existen. La ruta Docker no es parte del gate Windows normal y se informará por separado si no puede ejecutarse.
4. Añadir el hito público `milestones:go-127-toolchain` a `vantare-v2/docs/roadmap/plan.md`, redactado para el resultado realmente demostrado en el candidato. Regenerar `roadmap.json` desde la base confiable con el generador del repositorio. Actualizar el handoff vivo de plataforma con evidencia y límites.
5. No tocar el comportamiento del producto Engineer, sus documentos, dependencias funcionales, Wails, UI, formatos de datos ni canal de distribución.

## Secuencia y puertas

| Fase | Acción | Puerta de salida |
| --- | --- | --- |
| 0 | Inventariar referencias y establecer base limpia | Notion, issue, worktree y SHA coherentes; sin cambios ajenos |
| 1 | Revisar este diseño y el plan ejecutable con el mismo subagente Astra del informe | Observaciones críticas resueltas antes de editar la toolchain |
| 2 | Aplicar pins y revisar `go mod tidy` bajo Go 1.27.1 | Diff acotado y justificable; no cambios de dependencias accidentales |
| 3 | Verificar localmente versión efectiva, tests Go aplicables, build frontend necesario para `go:embed`, validadores de roadmap y calidad | Resultados y omisiones registrados; cualquier fallo entendido y separado del cambio |
| 4 | Push de rama y PR borrador contra `nightly`; esperar CI | `Validate promotion path`, `Validate Vantare blocking gates`, `quality-check (ratchet)` y jobs pertinentes con resultados observados |
| 5 | Revisar diff y evidencia final; actualizar Notion y handoff | Candidato verificable, sin declarar integración ni release |

## Matriz de verificación

- Local macOS: `go version` debe mostrar 1.27.1 en el módulo; `go mod tidy -diff` sin cambios inesperados; comprobaciones Go que puedan compilar aquí; tests de contrato de roadmap y digest. La suite `go test ./...` puede incluir paquetes Windows y dependencias nativas no disponibles en macOS: cada fallo se clasificará, no se ocultará.
- CI del PR en Windows: `go test ./...`, contrato TypeScript de telemetría, frontend build y suite, Wails `windows:build` con `production`, además de los checks de política y quality Linux. El build de Wails no equivale a ejecutar físicamente la aplicación.
- CI de release: inspeccionar coherencia del `go-version-file` y del pin declarado. No disparar `release.yml` contra una rama de issue porque su contrato de origen exige un SHA integrado en canal y puede publicar artefactos o releases.
- Docker: comprobar disponibilidad de imágenes y, si el entorno lo permite, al menos construcción de la imagen server/cross. Una validación de etiquetas o de sintaxis no equivale a compilar todos los destinos del contenedor cruzado.
- Vulnerabilidades: repetir `govulncheck` con Go 1.27.1 si la herramienta está disponible y comparar los hallazgos de biblioteca estándar con el informe previo; no atribuir la desaparición de un identificador a seguridad total sin verificar rutas y versión efectiva.

## Riesgos y reversión

- Go 1.27 puede revelar incompatibilidades en Wails beta.24, analizadores o código que Go 1.25 permitía. Resolver solo el cambio mínimo necesario, con evidencia y revisión; no aprovechar la migración para refactorizar.
- Una imagen Docker nueva puede no existir o cambiar paquetes nativos. Confirmar etiqueta y build antes de declararla verificada; si el runner no dispone de Docker, dejar el camino expresamente pendiente.
- Los workflows de `release.yml` y closeout de Testing Center dependen de condiciones de canal/secretos: no se publicarán para probar la toolchain. Sus pins se verifican estáticamente y el build Windows ordinario prueba la ruta compartida.
- Reversión: revertir el commit de pins/documentación y cerrar la PR borrador si los gates no se pueden superar dentro del alcance. Ningún canal se habrá promovido.
