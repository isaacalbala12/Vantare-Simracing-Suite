# Release 03.E — Discord Release Notification & Build Available Notification

> **Estado:** Implementado; smoke test real pendiente.
> **Worker recomendado:** Deepseek V4 Flash o Claude Sonnet 4 (ver sección 8).
> **Dependencias:** R03.B (artefactos), R03.C (workflow release.yml). Completados.
> **Documentos requeridos:** AGENTS.md, current-plan.md, release-roadmap-execution-index.md, release-artifacts.md, release-beta-operations-runbook.md, adversarial-review.md, technical-debt.md.

---

## 1. Diagnóstico del estado actual

### 1.1 Workflows Discord existentes (ya implementados en `.github/workflows/`)

| Workflow | Archivo | Trigger | Webhook secreto primario | Canal destino (runbook) | Estado |
|---|---|---|---|---|---|
| Release announcement | `discord-release.yml` | Push tag `v*` + `workflow_dispatch` (con tag input) | `DISCORD_RELEASE_WEBHOOK_URL` | 📢 `#alpha-announcements` | ✅ Funcional |
| Beta progress | `discord-beta-progress.yml` | Push a `current-plan.md` o `roadmap-execution-board.md` + `workflow_dispatch` | `DISCORD_PROGRESS_WEBHOOK_URL` | 💡 `#alpha-feedback` | ⚠️ Ver abajo |
| Build available | `discord-build-available.yml` | `workflow_dispatch` con `version`, `download_url`, `sha256`, `notes` | `DISCORD_BUILD_WEBHOOK_URL` | 💾 `#alpha-downloads` | ✅ Funcional |
| Known issues | `discord-known-issues.yml` | Push a `tester-known-issues.md` + `workflow_dispatch` | `DISCORD_KNOWN_ISSUES_WEBHOOK_URL` | 📌 `#alpha-known-issues` | ✅ Funcional |

Todos usan fallback a `DISCORD_WEBHOOK_URL` genérico si el específico no está configurado.

### 1.2 Qué funciona bien

- **Sin secretos hardcodeados** — todos via GitHub Secrets.
- **Separación de canales** — 4 webhooks distintos, con fallback genérico.
- **Chunking de mensajes** — los 4 workflows parten mensajes >1900 chars.
- **Mensajes claros** — estructura markdown, enlaces a releases, commits y known issues.
- **Sin imprimir secretos** — las URLs solo se leen de env vars, nunca se loguean.
- **Sin ejecución de código externo** — solo Python estándar + `urllib`.

### 1.3 Problemas y riesgos identificados

| # | Problema | Severidad | Archivo/Línea |
|---|---|---|---|
| P1 | **Beta-progress referencia `roadmap-execution-board.md` que puede estar stale** — `current-plan.md` dice explícitamente que los roadmaps anteriores se mantienen como contexto/historial. El workflow parsea su sección "Próxima acción", que puede no reflejar el estado real. | **P1** | `discord-beta-progress.yml:38` |
| P2 | **No hay protección contra duplicados en re-run.** Si se re-ejecuta un workflow (p.ej. retry tras fallo), se re-publica el mismo mensaje en Discord. No hay IDs de mensaje ni detección de contenido idéntico. | **P2** | Todos los workflows |
| P2 | **Build available requiere SHA256 manual.** El input `sha256` lo pasa el humano, no se extrae automáticamente del artifact de `release.yml`. Riesgo de error humano (SHA256 incorrecto). | **P2** | `discord-build-available.yml` |
| P2 | **Build available requiere download_url manual.** Depende de que el operador copie el URL de la GitHub Release. Si la Release no se creó aún, el URL no existe. | **P2** | `discord-build-available.yml` |
| P2 | **discord-release.yml no consume `release.yml` artifacts.** El changelog se extrae del repo, pero no hay coordinación entre que `release.yml` termina de crear la GitHub Release y que `discord-release.yml` se dispara por el push event. En teoría funciona (mismo push dispara ambos), pero no hay orden garantizado. | **P2** | `discord-release.yml` vs `release.yml` |
| P3 | **Error handling de webhook 403/429 genérico.** Todos los workflows usan `resp.status >= 300`, sin distinguir rate limit (429) de forbidden (403) ni reintentar. | **P3** | Todos |
| P3 | **Sin test de validación de payload.** No hay verificación de que el JSON enviado a Discord sea válido antes del POST. | **P3** | Todos |
| P3 | **`docs/adversarial-review.md` no tiene entrada para R03.E.** Se requiere crear la entrada post-implementación. | **P3** | N/A |
| P3 | **`discord-beta-progress.yml` input manual no está documentado en runbook.** La sección 3 del runbook muestra `gh workflow run` para release y build-available, pero no para beta-progress ni known-issues desde CLI. | **P3** | `release-beta-operations-runbook.md:69-86` |

### 1.4 Integración con `release.yml` (R03.C)

El workflow `release.yml` ya:
1. Construye artefactos
2. Verifica versiones
3. Sube artifacts a GitHub Actions
4. Crea GitHub Release con `gh release create`

Sin embargo, `release.yml` **no encadena** los workflows Discord. La notificación a Discord ocurre por separado vía:
- `discord-release.yml`: disparado por el mismo `push` de tag (evento independiente, puede correr antes o después que `release.yml` termine)
- `discord-build-available.yml`: manual, requiere inputs humanos

Esto es aceptable para beta pero mejorable: el mensaje de release announcement se publica antes de que la GitHub Release tenga los assets subidos (porque `release.yml` puede tardar ~15 min más en terminar el job `release`).

### 1.5 Documentación existente relevante

- `release-beta-operations-runbook.md` sección 3 documenta los 4 workflows, triggers, secretos y canales.
- `release-beta-operations-runbook.md` sección 6.A tiene plantilla de mensaje para Discord.
- `changelog.md` tiene 3 versiones documentadas (`v0.3.9.1`, `v0.3.9.2`, `v0.3.10.0`).
- `tester-known-issues.md` existe y está poblado.

---

## 2. Propuesta de arquitectura simple

No se necesita nueva arquitectura. Los 4 workflows ya existen y son funcionales. R03.E debe:

1. **No crear nuevos workflows.** Los 4 existentes cubren todos los canales.
2. **Reparar los problemas identificados** (sección 1.3).
3. **Mejorar la integración entre release.yml y Discord** donde sea seguro.
4. **Documentar el resultado** en adversarial-review.md y runbook.

### 2.1 Árbol de decisión de eventos

```
Push tag v*
  ├── release.yml (build + GitHub Release)
  └── discord-release.yml (changelog → #alpha-announcements)
       └── ¿esperar a que release.yml termine? → NO, eventos paralelos OK

workflow_dispatch (build manual)
  └── release.yml (build sin release)
       └── operador ejecuta discord-build-available.yml manualmente
            con datos extraídos de los artifacts

Push current-plan.md
  └── discord-beta-progress.yml (progreso → #alpha-feedback)

Push tester-known-issues.md
  └── discord-known-issues.yml (issues → #alpha-known-issues)
```

### 2.2 Separación de canales (recomendada)

| Canal Discord | Contenido | Frecuencia | Workflow |
|---|---|---|---|
| `#alpha-announcements` | Changelog de releases nuevas. Solo tags `v*`. | ~1-2/semana | `discord-release.yml` |
| `#alpha-feedback` | Progreso semanal del roadmap, próxima acción. | ~1-3/semana | `discord-beta-progress.yml` |
| `#alpha-downloads` | Build disponible con enlace y SHA256. Solo manual. | ~1-3/semana | `discord-build-available.yml` |
| `#alpha-known-issues` | Actualización de known issues. | ~1/semana | `discord-known-issues.yml` |

### 2.3 Decisiones de diseño

| Decisión | Opción | Elegida | Razón |
|---|---|---|---|
| ¿Proteger contra duplicados? | Sí / No | **Sí (hash-based)** | Añadir campo opcional `nonce` con SHA256 del contenido del mensaje. Discord no lo soporta nativamente, pero el workflow puede skipear si detecta el mismo nonce en los últimos N mensajes. Alternativa más simple: step de idempotencia que busca contenido duplicado usando la API de Discord (requiere `DISCORD_BOT_TOKEN`). Para beta, aceptamos el riesgo y lo documentamos como P3. |
| ¿Automatizar build-available desde release.yml? | Sí / No | **Parcialmente** | `release.yml` termina con los artifacts + GitHub Release URL. Podríamos añadir un step final que llame a un webhook de build-available automáticamente. Sin embargo, mezcla responsabilidades: release.yml es de build, no de Discord. Mejor mantener separado y añadir un paso en el runbook que guíe al operador a extraer SHA256 del artifact. |
| ¿Encadenar workflows vía `workflow_run`? | Sí / No | **No** | `workflow_run` añade latencia y complejidad. Los eventos `push` independientes son suficientemente deterministas. |
| ¿Usar GitHub Actions composite action para el webhook POST? | Sí / No | **No** | Los 4 workflows comparten ~90% del código Python de envío. Extraerlo a un action compuesto reduciría duplicación, pero añade un archivo más y no es crítico para el objetivo. Queda como P3 de higiene. |

---

## 3. Secretos necesarios

### 3.1 Existentes (ya deben estar en GitHub Secrets)

| Secreto | Canal esperado | Cuándo se usa | Workflow |
|---|---|---|---|
| `DISCORD_RELEASE_WEBHOOK_URL` | `#alpha-announcements` | Push tag `v*` o `workflow_dispatch` manual | `discord-release.yml` |
| `DISCORD_PROGRESS_WEBHOOK_URL` | `#alpha-feedback` | Push a `current-plan.md` / `roadmap-execution-board.md` | `discord-beta-progress.yml` |
| `DISCORD_BUILD_WEBHOOK_URL` | `#alpha-downloads` | `workflow_dispatch` manual con inputs | `discord-build-available.yml` |
| `DISCORD_KNOWN_ISSUES_WEBHOOK_URL` | `#alpha-known-issues` | Push a `tester-known-issues.md` | `discord-known-issues.yml` |
| `DISCORD_WEBHOOK_URL` | (fallback genérico) | Cualquier workflow, si el específico no está configurado | Todos |

### 3.2 Nuevos (ninguno requerido)

No se necesitan secretos nuevos. Los 4 webhooks + fallback genérico cubren los casos de uso.

### 3.3 Cómo obtener los webhooks de Discord

Documentado para el operador:

1. Ir a Discord Server Settings → Integrations → Webhooks.
2. Crear un webhook por canal deseado.
3. Copiar la URL (formato: `https://discord.com/api/webhooks/<id>/<token>`).
4. Añadir como secreto en GitHub: `Settings → Secrets and variables → Actions → New repository secret`.

---

## 4. Miniplan R03.E

### E1 — Inventario y diagnóstico de workflows Discord (análisis)

**Archivos a tocar:** solo docs.
**Objetivo:** Confirmar el estado actual de los 4 workflows, triggers, secretos y canales. Verificar que `roadmap-execution-board.md` existe y es coherente.

**Tareas:**
- [x] Leer y contrastar los 4 workflows Discord contra el runbook (sección 3).
- [x] Confirmar que `roadmap-execution-board.md` existe y su sección `## Próxima acción` es coherente con `current-plan.md`.
- [x] Identificar si hay discord-*.yml que fallen por archivos faltantes o rutas incorrectas.
- [x] Documentar hallazgos en `docs/adversarial-review.md` (sección R03.E).

**Criterio de éxito:** Inventario completo documentado.

---

### E2 — Release announcement hardening (discord-release.yml)

**Archivos a tocar:**
- `.github/workflows/discord-release.yml` (modificar)
- `docs/release-beta-operations-runbook.md` (modificar sección 3 si procede)

**Objetivo:** Asegurar que el mensaje de release se publique correctamente, sin duplicados en re-runs, con manejo de errores robusto.

**Tareas:**
- [x] Añadir step de "idempotencia": antes de publicar, verificar si el tag ya fue anunciado buscando en `gh release view` o en un marker file en el repo (ej. `.discord-announced-<tag>`). Si ya fue anunciado, skipear con `::warning::`.
- [x] Mejorar error handling: distinguir 403/429 en respuesta del webhook. Para 429, esperar y reintentar (1 retry con backoff). Para 403, fallar con mensaje claro.
- [x] Validar payload JSON antes de enviar: intentar `json.dumps` + `json.loads` roundtrip en modo test.
- [x] Añadir `nonce` al payload opcional (campo `flags` si se quiere) para futura idempotencia nativa de Discord. Por ahora solo loguearlo.
- [~] Sincronizar con `release.yml`: opcionalmente añadir un marker file como artifact de release.yml que `discord-release.yml` pueda descargar para saber que la Release ya se creó. Evaluar si es necesario (puede ser overengineering para beta).

**Criterio de éxito:** Re-run de workflow sobre mismo tag no re-publica; 429 no deja el workflow en rojo.

**Riesgo:** Si se usa marker file en el repo, requiere permisos `contents: write` en discord-release.yml. Alternativa más simple: gh CLI para ver si la Release ya existe.

---

### E3 — Build available notification improvement (discord-build-available.yml)

**Archivos a tocar:**
- `.github/workflows/discord-build-available.yml` (modificar)
- `docs/release-beta-operations-runbook.md` (modificar sección 3)

**Objetivo:** Reducir la fricción de publicar un build disponible. Actualmente requiere inputs manuales de `download_url` y `sha256`. Automatizar la extracción desde el último artifact de `release.yml` o desde la GitHub Release más reciente.

**Tareas:**
- [~] Analizar si podemos leer el último artifact de `release.yml` (vía `gh run download`) para extraer el SHA256 automáticamente. Si no hay un artifact reciente, pedir input manual como fallback.
- [x] Alternativa simple: el workflow `discord-build-available.yml` acepta como input `release_tag` (opcional) y si se proporciona, extrae automáticamente `download_url` y `sha256` de la GitHub Release correspondiente usando `gh release view`. Esto elimina los inputs `download_url` y `sha256` como obligatorios.
- [x] Si no se proporciona `release_tag`, mantener los inputs manuales actuales como fallback.
- [x] Añadir validación: si `release_tag` se proporciona pero la Release no existe o no tiene assets, fallar con mensaje claro.
- [x] Añadir dedup: verificar si ya se notificó ese tag/versión (misma técnica que E2).

**Criterio de éxito:** `gh workflow run "Discord build available" --ref master -f version=v0.3.10.0 -f release_tag=v0.3.10.0` extrae SHA256 y URL automáticamente.

---

### E4 — Documentación y runbook

**Archivos a tocar:**
- `docs/release-beta-operations-runbook.md` (modificar)
- `docs/adversarial-review.md` (añadir sección R03.E)
- `docs/technical-debt.md` (actualizar si se cierran deudas)
- `docs/superpowers/plans/2026-06-27-release-03e-discord-release-notification.md` (este documento, marcar tareas)

**Objetivo:** Que cualquier operador sepa exactamente cómo funciona, cómo probarlo y cómo solucionar problemas.

**Tareas:**
- [x] Actualizar runbook sección 3: añadir comandos `gh` para `discord-beta-progress` y `discord-known-issues` (hoy faltan).
- [x] Actualizar runbook sección 3: documentar que `discord-build-available.yml` acepta `release_tag` opcional para auto-extraer SHA256.
- [x] Añadir runbook sección 3: procedimiento de re-run seguro (cómo evitar duplicados).
- [x] Añadir runbook sección 5: troubleshooting específico para Discord (webhook 404, 429, payload muy grande, changelog no encontrado).
- [x] Escribir adversarial review post-implementación en `docs/adversarial-review.md`.
- [x] Marcar deuda técnica cerrada en `docs/technical-debt.md` si aplica (TD-003, TD-004, TD-005 son candidatos si se tocan en E2/E3).

**Criterio de éxito:** Runbook actualizado con comandos y troubleshooting; adversarial-review.md tiene entrada R03.E.

---

### E5 — Test manual

**Objetivo:** Verificar que todo funciona antes de declarar R03.E completo.

**Tareas:**
- [~] **Test A — Release announcement:** Crear un tag `v0.3.99.99-test` en local (no push), hacer push, verificar que Discord recibe el changelog. Alternativa: usar `workflow_dispatch` con `tag=v0.3.10.0` (no requiere push).
- [~] **Test B — Build available:** Ejecutar `discord-build-available.yml` con `release_tag=v0.3.10.0` y confirmar que extrae SHA256 y URL automáticamente.
- [~] **Test C — Build available fallback manual:** Ejecutar con inputs manuales (`version`, `download_url`, `sha256`) y confirmar que funciona.
- [~] **Test D — Idempotencia:** Re-ejecutar cualquiera de los dos workflows anteriores y confirmar que no se re-publica el mensaje.
- [~] **Test E — Sin webhook configurado:** Ejecutar un workflow sin el secreto configurado y confirmar que falla con mensaje claro (no silenciosamente).
- [~] **Test F — Changelog no encontrado:** Ejecutar `discord-release.yml` con un tag que no existe en `changelog.md` y confirmar que falla con mensaje claro.
- [~] **Test G — Smoke de beta-progress:** Ejecutar `discord-beta-progress.yml` via `workflow_dispatch` y confirmar que el mensaje muestra la versión estable y próxima acción correcta.

**Criterio de éxito:** Tests A, B, D, E, F, G pasan.

**Estado real:** Tests E5 no se ejecutaron contra workflows reales de GitHub Actions en esta sesion (no hay secretos disponibles ni webhooks configurados en este host). La logica de envio, idempotencia y manejo HTTP se valido en dry-run local contra un servidor HTTP local. Se recomienda ejecutar los tests A-G en GitHub Actions antes de declarar Release 03 completo.

---

## 5. Stop conditions

Detener y pedir revisión si:

1. **Se requiere un workflow nuevo.** Los 4 existentes cubren todos los casos. Si alguien propone crear `discord-xxx.yml` adicional, necesita aprobación.
2. **Se necesita un nuevo secreto de Discord.** Si se requiere `DISCORD_BOT_TOKEN` para idempotencia nativa, evaluar si el marker file approach es suficiente.
3. **Se propone tocar `release.yml`.** Ese workflow es de R03.C y no debe modificarse en R03.E salvo que sea estrictamente necesario (y con aprobación).
4. **Los tests E5 fallan por causas no entendidas.** Especialmente tests A (webhook rechaza payload) y B (API de GitHub no accesible desde GH Actions).
5. **Se encuentra que `roadmap-execution-board.md` está incoherente con `current-plan.md`.** Eso requiere decisión del usuario sobre cuál es la fuente de verdad.
6. **Descubrimiento de secretos en logs.** Si algún cambio produce fuga de webhook URLs en los logs de GitHub Actions, detener inmediatamente y revertir.

---

## 6. Prompt final para implementar R03.E

```markdown
Actúa como worker senior de release operations, GitHub Actions y Discord webhooks para Vantare Simracing Suite.

Lee obligatoriamente:
- AGENTS.md
- docs/current-plan.md
- docs/release-roadmap-execution-index.md
- docs/superpowers/plans/2026-06-27-release-03e-discord-release-notification.md (este plan)
- docs/release-beta-operations-runbook.md
- docs/release-artifacts.md
- docs/technical-debt.md
- docs/adversarial-review.md (para escribir el review al final)

Todos los workflows Discord están en `.github/workflows/` (raíz del repo, no en vantare-v2/).

Implementa R03.E en el siguiente orden:

### E1 — Inventario (solo lectura, 15 min)
- Lee los 4 workflows Discord, confirma triggers y secretos.
- Verifica que `roadmap-execution-board.md` existe y tiene sección `## Próxima acción`.
- Documenta hallazgos en este mismo issue/PR.

### E2 — Release announcement hardening (discord-release.yml)
1. Añade idempotencia: antes de publicar, verifica si el tag ya fue anunciado. Usa `gh release view <tag>` como check. Si la Release existe y el workflow ya corrió antes (usa un marker file en el repo o un GitHub Actions cache key), skipea con `::warning::`.
   - Alternativa simple: usar `github.run_attempt` — si es >1, skipear. No es perfecto pero cubre el caso más común (re-run).
2. Mejora error handling: detecta 429 en respuesta y reintenta 1 vez con 5s de espera. Para 403, falla con mensaje claro.
3. Añade validación de payload: intenta json.dumps → json.loads roundtrip antes de enviar.
4. No cambies la estructura del mensaje ni el formato del changelog.

### E3 — Build available improvement (discord-build-available.yml)
1. Añade input opcional `release_tag` (string, no requerido).
2. Si `release_tag` se proporciona:
   a. Usa `gh release view <tag>` para obtener la URL de descarga del primer asset.
   b. Usa `gh release view <tag>` para obtener el SHA256 del asset `.sha256` correspondiente.
   c. Si la Release no existe o no tiene assets, falla con mensaje claro.
3. Si `release_tag` no se proporciona, usa los inputs manuales `download_url` y `sha256` como ahora (fallback).
4. Mantén `version` como input obligatorio siempre.
5. Añade idempotencia: mismo approach que E2 (run_attempt o cache key).

### E4 — Documentación
1. Actualiza `docs/release-beta-operations-runbook.md`:
   - Sección 3: añade comandos `gh` para `discord-beta-progress` y `discord-known-issues`.
   - Sección 3: documenta el nuevo input `release_tag` para build-available.
   - Sección 5 (rollback): añade subsección específica para troubleshooting de Discord.
2. Al terminar la implementación, escribe la entrada adversarial en `docs/adversarial-review.md` (reemplaza "Review actual" con hallazgos de R03.E).
3. Si se cierra alguna deuda técnica (TD-003, TD-004, TD-005), actualiza `docs/technical-debt.md`.

### E5 — Test manual
Ejecuta estos tests en orden:

1. **Test A:** `gh workflow run "Discord release announcement" --ref master -f tag=v0.3.10.0` → confirmar que Discord recibe el changelog.
2. **Test B:** `gh workflow run "Discord build available" --ref master -f version=v0.3.10.0 -f release_tag=v0.3.10.0` → confirmar que extrae SHA256 y URL automáticamente.
3. **Test C:** Repetir Test A → confirmar que NO se re-publica (idempotencia).
4. **Test D:** Ejecutar `discord-beta-progress.yml` via dispatch → confirmar que el mensaje es coherente.
5. **Test E:** Temporalmente borrar `DISCORD_RELEASE_WEBHOOK_URL` de los env (o pasarle una URL vacía alterando temporalmente el código) y ejecutar → confirmar que falla con mensaje claro y no silenciosamente. Restaurar después.

Reglas:
- No tocar `release.yml` (R03.C) salvo aprobación explícita.
- No tocar VERSION, build scripts, updater runtime, Stripe/licensing, frontend/widgets.
- No hacer commit, push ni tag.
- Si algo requiere un cambio de arquitectura, detener y reportar.
- Reportar en español: archivos tocados, cambios, tests/checks ejecutados, riesgos restantes y cómo verificar manualmente.
```

---

## 7. Riesgos

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | **Webhook URL expuesta en logs de GH Actions** si alguien hace `echo $WEBHOOK_URL` por error | Baja | Alto — cualquiera con acceso al log puede spamear el canal | Todos los workflows existentes ya solo usan las URLs en `env`, nunca en `run: echo`. Verificar que E2/E3 no introducen `echo`. |
| R2 | **Idempotencia por run_attempt falla si el primer intento fue exitoso pero el segundo también debería publicar** (ej. se cambió el changelog entre runs) | Media | Bajo — el mensaje no se actualiza, pero es caso raro | Documentar en runbook: si necesitas re-publicar con contenido distinto, borra el marker file o usa un tag diferente. |
| R3 | **gh CLI no disponible en el runner de discord-release.yml** (actualmente corre en ubuntu-latest, gh viene pre-instalado) | Baja | Alto — el step de idempotencia o auto-SHA256 falla | Verificar en test que `gh` está disponible. Alternativa: usar API REST con `curl`. |
| R4 | **El sha256 extraído automáticamente no coincide con el installer publicado** si el artifact se regenera entre la Release y la notificación | Baja | Medio — tester descarga con checksum incorrecto | El SHA256 se extrae de la misma Release que se acaba de crear. Debería ser exacto. |
| R5 | **Rate limit de GitHub API** al hacer `gh release view` múltiples veces | Baja | Bajo — hay 1000 req/h para GH token autenticado | Con 1-2 llamadas por workflow, no debería alcanzarse. |
| R6 | **Roadmap-execution-board.md inconsistente** — el workflow beta-progress parsea su sección "Próxima acción", pero si el archivo está desactualizado respecto a `current-plan.md`, el mensaje de Discord será engañoso. | Media | Medio | En E1 verificar coherencia. Documentar en runbook que el archivo debe mantenerse sincronizado. |

---

## 8. Modelo recomendado para implementación

### Opción recomendada: **Deepseek V4 Flash** (disponible actual)

**Razones:**
1. El trabajo es mayoritariamente YAML + Python scripting + documentación markdown — no requiere capacidades de razonamiento profundo ni de código Go complejo.
2. Los workflows son cortos (<150 líneas), con patrones repetitivos. Un modelo rápido es suficiente.
3. Deepseek V4 Flash es significativamente más rápido que Claude Sonnet 4 para tareas de scripting, y el coste es menor.
4. Los riesgos son bajos (no se toca runtime, build, ni lógica de negocio).

### Alternativa: **Claude Sonnet 4**

Usar si:
- Se encuentra que los workflows tienen bugs sutiles de Python (encoding, regex multiline, manejo de excepciones).
- Se necesita debugging interactivo de respuestas HTTP de Discord.
- El usuario prefiere menor velocidad a cambio de mayor precisión en el mensaje de Discord.

### No recomendado: modelos de razonamiento lento (o1, R1, etc.)

Los cambios son demasiado pequeños y el ratio coste/beneficio es desfavorable.
