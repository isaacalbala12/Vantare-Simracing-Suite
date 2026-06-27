# Review adversarial (plantilla reutilizable)

Documento vivo. Cada vez que se hace un review adversarial de una tarea (release engineering, CI, seguridad, arquitectura), se **reemplaza** el contenido de la seccion "Review actual" manteniendo la cabecera y la estructura.

Instrucciones de uso:
- No cambiar la cabecera ni la estructura de secciones.
- Reemplazar solo el bloque "Review actual".
- Mover el review anterior a "Historico" (ultima entrada arriba) con un enlace de ancla al veredicto.
- Borrar el historico cuando crezca demasiado; el veredicto y los P0/P1/P2 abiertos deben quedar referenciados en `docs/current-plan.md`.

Convencion de severidades:
- **P0**: bloqueante, no se puede mergear/publicar.
- **P1**: debe corregirse antes de cerrar la tarea.
- **P2**: deberia corregirse antes de cerrar la tarea o declararse como follow-up explicito.
- **P3**: no bloqueante, mejora de robustez/higiene, puede quedar como deuda documentada.

Veredictos posibles:
- **BLOCKED**: hay P0 o riesgo inaceptable.
- **NEEDS FIXES**: hay P1 que deben corregirse.
- **ACCEPT WITH P3**: no hay P0/P1/P2 abiertos; solo P3 documentados.
- **ACCEPT**: no hay findings accionables.

---

## Review actual

### R03.E - Discord release notification hardening (2026-06-28, review final)

**Reviewer:** worker senior de GitHub Actions, Discord webhooks y documentacion.
**Tarea revisada:** R03.E — reparar y endurecer los workflows de notificacion a Discord sin crear workflows nuevos.
**Nota de alcance:** no se toca `release.yml` (R03.C), updater runtime, frontend/backend app, `VERSION`, build scripts, Stripe/licensing.

**Archivos revisados:**
- `.github/workflows/discord-release.yml`
- `.github/workflows/discord-build-available.yml`
- `.github/workflows/discord-beta-progress.yml`
- `.github/workflows/discord-known-issues.yml`
- `docs/release-beta-operations-runbook.md`
- `docs/current-plan.md`
- `docs/technical-debt.md`

### Veredicto: ACCEPT WITH P3 (ningun P0/P1/P2 abierto en el alcance R03.E)

Los workflows de Discord existentes quedan endurecidos: idempotencia por `github.run_attempt`, manejo explicito de 403/429 con reintento en rate limit, validacion de payload JSON y extraccion automatica de URL/SHA256 desde GitHub Release en `discord-build-available.yml`. No se crearon workflows nuevos ni secretos nuevos. Quedan P3 documentados (no ejecutar workflows reales en este entorno, dependencia de `gh` CLI, idempotencia limitada a re-runs).

### Checks ejecutados
- `git status --short` → cambios sin commit identificados (trabajo ajeno de releases previos; no se mezclo con este cambio).
- `git diff --check` → limpio.
- Validacion YAML de los 4 workflows modificados → OK.
- Dry-run de la logica Python embebida → OK (funciones de envio probadas contra un servidor HTTP local sin tocar secretos reales).
- Lectura estatica completa de los 4 workflows, runbook, current-plan y technical-debt.

### Checks no ejecutados
- Ejecucion real de workflows en GitHub Actions (requiere push/tag o `workflow_dispatch` y webhooks de Discord configurados).
- Envio real de webhook a Discord (requiere secretos que no se exponen en este entorno).
- Pruebas end-to-end de descarga de assets desde GitHub Release.

### Findings

#### P0
Ninguno.

#### P1
Ninguno.

#### P2
Ninguno.

#### P3

##### P3-1 - Idempotencia limitada a re-runs (ACEPTADO)
**Archivo:** todos los workflows de Discord.
**Razonamiento:** se usa `github.run_attempt > 1` para evitar duplicados en re-runs manuales. No evita duplicados si alguien dispara manualmente el mismo workflow con los mismos inputs desde cero, pero es suficiente para el riesgo principal documentado y no requiere un bot token de Discord ni persistencia adicional.

##### P3-2 - Dependencia de `gh` CLI en `discord-build-available.yml` (ACEPTADO)
**Archivo:** `.github/workflows/discord-build-available.yml`.
**Razonamiento:** `gh release view` requiere que `gh` este disponible en `ubuntu-latest` (lo esta por defecto) y que `GITHUB_TOKEN` tenga permisos de lectura. Se anadio `permissions: contents: read` y `GH_TOKEN`. Si `gh` falla, el workflow muestra el error de `stderr` y falla con mensaje claro; el fallback manual sigue disponible.

##### P3-3 - Validacion real de webhooks pendiente (ACEPTADO)
**Archivo:** todos los workflows de Discord.
**Razonamiento:** el manejo de 403/429 y la validacion de JSON se probaron en dry-run local, pero no se envio un webhook real a Discord ni se verifico un 429 real. Se recomienda validar en la primera ejecucion real.

##### P3-4 - `roadmap-execution-board.md` puede estar stale respecto a `current-plan.md` (ACEPTADO)
**Archivo:** `.github/workflows/discord-beta-progress.yml`.
**Razonamiento:** este es un problema de contenido, no del workflow. El workflow mejoro en robustez (idempotencia, HTTP) pero sigue parseando `roadmap-execution-board.md`. Mantener la coherencia entre `current-plan.md` y `roadmap-execution-board.md` es responsabilidad del equipo/operador. Se documenta en el runbook.

### Confirmacion por dimension

**1. Sin nuevos workflows ni secretos - PASS**
- Solo se modificaron los 4 workflows existentes.
- No se anadio ningun secreto nuevo.
- No se hardcodeo ninguna URL de webhook.

**2. Idempotencia contra duplicados - PASS**
- Todos los workflows saltan el envio cuando `github.run_attempt > 1`.
- El mensaje de `::warning::` explica como re-disparar si es necesario.

**3. Manejo de errores HTTP 403/429 - PASS**
- 429: un reintento con backoff basado en `Retry-After` (o 5s por defecto).
- 403: fallo inmediato con mensaje accionable.
- Otros errores HTTP se propagan con status y razon.

**4. Extraccion automatica de URL/SHA256 - PASS**
- `discord-build-available.yml` acepta `release_tag` opcional.
- Usa `gh release view` para obtener assets.
- Descarga el `.sha256` correspondiente y valida que tenga 64 caracteres hex.
- Los inputs manuales pueden anular los valores automaticos.

**5. Documentacion - PASS**
- Runbook actualizado con comandos `gh` para los 4 workflows, ejemplo `release_tag`, re-run seguro y troubleshooting.
- `current-plan.md` refleja el estado R03.E.
- `technical-debt.md` mantiene TD-003/TD-004/TD-005 abiertos (no se toco `release.yml`) y anade TD-024/025/026 para los P3 de R03.E.

**6. Seguridad - PASS**
- Ningun workflow imprime la URL del webhook.
- `permissions: contents: read` anadido a los 4 workflows.
- Solo `discord-build-available.yml` usa `GITHUB_TOKEN` para leer releases.

### Riesgos restantes
1. **Validacion real pendiente:** no se ejecutaron workflows reales en GitHub Actions ni se envio un webhook real a Discord. Recomendado hacer un smoke test con un tag de prueba antes de declarar R03 completo.
2. **`gh` CLI no disponible o sin permisos:** si el runner no tiene `gh` o el token no puede leer releases, `discord-build-available.yml` con `release_tag` fallara. El fallback manual sigue funcionando.
3. **Idempotencia no cubre dispatch repetido:** si un operador dispara el mismo workflow dos veces desde cero, se publicaran dos mensajes. Aceptado como P3.
4. **Coherencia de roadmap:** `discord-beta-progress.yml` publica lo que haya en `roadmap-execution-board.md`; mantenerlo sincronizado con `current-plan.md` es responsabilidad del equipo.

### Conclusion
R03.E puede considerarse cerrado a nivel de implementacion y documentacion. No quedan P0/P1/P2 abiertos. Se recomienda ejecutar un smoke test real en GitHub Actions con webhooks de Discord antes de declarar Release 03 completo.

---

## Historico

### R03.D - Updater runtime hardening (2026-06-28, review final)
**Veredicto:** ACCEPT WITH P3. P1-1, P2-1, P2-2 y P2-3 corregidos. Sin P0/P1/P2 abiertos en el alcance R03.D-updater. Los P2/P3 heredados de UX/portable zip se mantuvieron fuera de alcance para R03.E/F. Sustituido por la review de R03.E (ver `## Review actual`).

### R03.D - Updater runtime hardening (2026-06-28, P1/P2 de segunda pasada abiertos)
**Veredicto:** segunda revision del runtime del updater encontro P1-1 (startup check sin cancelar HTTP), P2-1 (URL sin validar esquema), P2-2 (race en settings) y P2-3 (veredicto documental incoherente). Sustituida por la review final del 2026-06-28 (ver `## Review actual`), que cierra P1-1, P2-1, P2-2 y P2-3. Los P2/P3 heredados de UX/portable zip se mantuvieron fuera de alcance para R03.E/F.

### R03.D - Updater runtime hardening (2026-06-27, P1 activos)
**Veredicto:** review inicial con P1 activos (URL hardcodeada, goroutine sin context, sin cache/rate-limit, checksum no obligatorio). Resuelto en el cierre del worker senior Go/updater/runtime; los P1 fueron subsumidos en los P1/P2 de la segunda pasada (2026-06-28).

### R03.C - GitHub Actions release build (2026-06-27)
**Veredicto:** [ACCEPT WITH P3](#review-actual). P2-1 (gate de tests ausente) corregido el 2026-06-27 anadiendo 4 steps de gate al job `build` antes de `Build release artifacts`: `go test ./...`, `pnpm install`, `pnpm test`, `pnpm lint`. Quedan tres P3 de robustez no bloqueantes (P3-1 release idempotente, P3-2 glob amplio en `gh release create`, P3-3 verificacion de version NSIS, P3-4 nota doc de `SHA256SUMS.txt`).