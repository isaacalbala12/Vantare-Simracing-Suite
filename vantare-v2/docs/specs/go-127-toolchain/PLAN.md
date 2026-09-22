# Plan de ejecución — Go 1.27.1

Diseño y autoridad: [diseño del 22-09-2026](../2026-09-22-go-127-toolchain-design.md), [VAN-747](https://app.notion.com/p/3e3e51695c6581329168eec61e2dbb7e), GitHub #1325. Base exacta `e6d7d2b5e58f55b82c0ed2f6a79667476d897086`.

1. Incorporar la revisión adversarial Astra (`REQUEST_CHANGES` sobre `9005e851`): calidad, baselines, módulos anidados, helper precompilado y Docker alternativo. Este plan revisado autoriza iniciar el cambio acotado.
2. Cambiar Go en módulo y workflows activos; mantener Wails beta.24. Alinear el manifiesto de calidad y hacer que Doctor use ese dato, con prueba focal. Reconstruir herramientas locales con Go 1.27.1. No modificar el helper publicado ni los Dockerfiles alternativos.
3. Ejecutar `go mod tidy -diff` en cuatro módulos; revisar toda diferencia y no elevar automáticamente sus mínimos Go. Capturar hallazgos de calidad antes/después, recalibrar los cuatro baselines afectados con el mecanismo explícito y revisar identidades añadidas/resueltas/movidas.
4. Añadir el hito público `go-127-toolchain`, regenerar el digest desde `origin/nightly` y comprobar el paso del contrato de #1325, no solo el estado del job.
5. Construir el frontend requerido por `go:embed`; ejecutar tests Go aplicables, Doctor, pruebas de política/ratchet y `govulncheck` fijado. Clasificar separadamente fallos de macOS o deuda previa. `REVIEW_REQUIRED` por cambio de política exige revisión, no se llama verde.
6. Revisar el diff completo, crear commits acotados, subir rama y abrir PR borrador a Nightly. Observar gates Windows/Wails, política y quality; corregir regresiones de este cambio y volver a comprobar el SHA final.
7. Registrar en handoff y Notion versiones observadas, comandos, CI, omisiones y riesgo residual. Entregar el candidato para aprobación humana de promoción; no fusionar ni publicar.

Aceptación: pins coherentes del pipeline activo, dependencias y roadmap sin deriva, revisión Astra incorporada, análisis de calidad sin errores de integridad ni nuevas incidencias aceptadas automáticamente, gates Windows/Wails del PR observados y evidencia enlazada a SHA exacto. `quality-check` conserva su resultado real; una revisión satisfecha no simula `success`.
