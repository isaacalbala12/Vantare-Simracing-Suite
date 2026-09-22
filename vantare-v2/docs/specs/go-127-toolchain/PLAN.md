# Plan de ejecución — Go 1.27.1

Diseño y autoridad: [diseño del 22-09-2026](../2026-09-22-go-127-toolchain-design.md), [VAN-747](https://app.notion.com/p/3e3e51695c6581329168eec61e2dbb7e), GitHub #1325. Base exacta `e6d7d2b5e58f55b82c0ed2f6a79667476d897086`.

1. Pedir al mismo subagente Astra una revisión adversarial de alcance, pins, matriz de CI, riesgos y reversión. Corregir el plan antes de la implementación.
2. Cambiar los pins Go en módulo, workflows y Dockerfiles de build; mantener Wails beta.24 y no tocar Engineer. Ejecutar `go mod tidy -diff` con Go 1.27.1 y descartar cualquier mutación no justificada.
3. Añadir el hito público `go-127-toolchain`, regenerar el digest desde `origin/nightly` y comprobar el contrato de la issue #1325.
4. Construir el frontend requerido por `go:embed`; ejecutar tests Go y validadores locales aplicables. Clasificar separadamente fallos de macOS o deuda previa.
5. Revisar el diff completo, crear commits acotados, subir rama y abrir PR borrador a Nightly. Observar gates Windows/Wails, política y quality; corregir regresiones de este cambio y volver a comprobar el SHA final.
6. Registrar en handoff y Notion versiones observadas, comandos, CI, omisiones y riesgo residual. Entregar el candidato para aprobación humana de promoción; no fusionar ni publicar.

Aceptación: pins coherentes, dependencia y roadmap sin deriva, revisión Astra resuelta, CI bloqueante verde o fallo explicado que impida declarar el candidato listo, y evidencia enlazada a SHA exacto.
