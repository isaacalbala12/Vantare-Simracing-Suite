# Testing Center, Linear y Codex — plan de ejecución por microcortes

Fecha: 2026-08-03

Estado: aprobado para planificación; sin autorización de implementación, deploy, secretos, delegación Codex, merge o promoción.
Arquitectura: `Vantare -> Supabase -> Linear -> delegación humana a Codex Cloud -> PR revisada -> nightly -> testers -> master`.

## Objetivo

Entregar un circuito inicial en el que un tester autorizado pueda reportar y validar desde Vantare, Supabase conserve la autoridad y la evidencia privada, Linear sea la bandeja operativa de Isaac, y Codex trabaje únicamente cuando Isaac le entregue un expediente completo y seleccione de forma determinista el repositorio, la rama o SHA y la base de PR.

El circuito debe poder detenerse en cualquier fase. Ningún rechazo, comentario, webhook o salida de Codex puede redelegar trabajo, fusionar una PR o promover una build automáticamente.

## Reglas invariantes

- El flujo de ramas es `rama de issue -> nightly -> testers -> master`; `develop` queda fuera.
- Un candidato se identifica por `issue + canal + versión + SHA`. Un SHA nuevo es un candidato nuevo y no hereda votos.
- Un rechazo autorizado bloquea el candidato exacto. `Cannot verify` no aprueba, rechaza ni bloquea.
- Un único tester principal puede aprobar Nightly. En Testers, un rechazo válido pausa preventivamente hasta decisión de Isaac. Isaac conserva el gate final de Master.
- Un rechazo en Testers nunca se corrige directamente sobre `testers`: vuelve a Nightly y recorre de nuevo ambos canales.
- Linear contiene una proyección operativa; logs, diagnóstico completo y session replay permanecen en Supabase/PostHog y se enlazan con acceso restringido.
- El texto del tester es evidencia no confiable, no instrucciones para Codex.
- No hay modelo intermedio en el MVP. Supabase genera un expediente determinista y versionado.
- No se usa OpenAI Platform API ni `openai/codex-action` en el MVP. ChatGPT Pro y Codex Cloud se validan mediante spike.
- La mención o asignación `@Codex` desde Linear puede servir para análisis, pero no autoriza cambios de código mientras arranque desde la rama predeterminada `master`.
- Una tarea con escritura se inicia en una superficie Codex donde Isaac selecciona la rama o commit exactos. El preflight comprueba repo, HEAD/SHA, ancestry y base de PR antes de editar.
- No hay retry ni redelegación automática después de iniciar Codex. Resultado ambiguo, timeout o mismatch pasan a `needs_owner`.
- Codex puede analizar, editar, probar, commitear y abrir una PR para revisión. No puede aprobar, mergear, desplegar, promover ni declarar validación humana.

## Estrategia de entrega

Cada corte usa la rama de Linear y un worktree limpio propios, implementa una sola capacidad observable, añade tests de regresión y termina en PR draft o `In Review`. El siguiente corte parte de la base exacta autorizada, no de cambios locales de otro agente.

Los efectos externos nacen apagados. Se aplicará este orden: contrato local, persistencia local, UI local, integración remota sintética, handoff humano a Codex y finalmente piloto de canal.

## Orden de microcortes

### 1. TAU-07B — Spike ChatGPT Pro, Linear y Codex Cloud

**Objetivo:** confirmar sin tocar el repositorio que la cuenta Pro de Isaac puede abrir tareas Codex desde Linear y desde Codex Cloud sin consumo de Platform API.

**Prueba:** issue sintético de solo análisis; registrar identidad, consumo, repositorio, environment, estado y callback observable.

**Gate GO:** no requiere API key de OpenAI; el uso queda atribuido a ChatGPT Pro; el repositorio es inequívoco; no se produce escritura.

**Stop:** coste/API no previsto, identidad incorrecta, permisos excesivos o repo ambiguo.

### 2. TAU-07C — Spike determinista de rama y continuidad

**Objetivo:** resolver antes del backend los dos caminos de corrección.

1. **Rama nueva:** seleccionar el SHA exacto de Nightly, crear la rama generada por Linear y abrir una PR draft a `nightly` con un cambio documental inocuo.
2. **Misma rama:** seleccionar una rama de issue ya integrada en Nightly, verificar su HEAD y demostrar si GitHub permite continuarla con commits nuevos y una segunda PR a `nightly` sin reabrir ni reescribir la anterior.

**Gate GO:** checkout seleccionado fuera del prompt; preflight reproduce repo, rama/SHA y ancestry; PR base/head correctas; la creación de PR puede requerir confirmación humana y eso no invalida el MVP.

**Fallback obligatorio:** si la segunda PR desde la rama antigua no es fiable, toda corrección usa sub-issue y rama nueva desde el SHA actual de Nightly.

### 3. TAU-07D — ADR y contratos cerrados

**Objetivo:** sustituir formalmente GitHub Issues como destino operativo por Linear, sin mantener dos trackers activos.

**Entregables:** ADR; `testing-center.linear-issue.v1`; `testing-center.rejection.v1`; `testing-center.codex-dossier.v1`; matriz de datos Supabase/Linear/PostHog/Discord; política de retención; actor/credencial Linear; estrategia de migración o retirada del efecto inerte `github_issue_create`; estados y disposiciones del owner.

**Tests:** decoders cerrados, límites, PII/secrets, menciones, prompt injection, campos extra, candidato/SHA incorrectos y expediente incompleto.

**No tocar:** red, secretos, schema remoto, UI o Codex real.

### 4. TAU-07E — Proyección Linear y outbox durable en dry-run

**Objetivo:** reservar y construir exactamente un efecto `linear_issue_create` por issue técnica, sin llamada externa.

**Alcance:** mapping interno/Linear; fingerprint y ocurrencias; marker server-owned; pausa, claim, lease y fencing; reconciliación de respuesta ambigua; proyección sanitizada; política explícita de supersesión del antiguo destino GitHub.

**Gate:** 100 duplicados y dos workers convergen; rollback/reapply; no coexisten dos destinos activos; ningún texto libre cambia labels, assignee, prioridad o instrucciones.

### 5. TAU-07F — Webhook Linear firmado y reconciliación

**Objetivo:** recibir señales autenticadas de Linear sin convertirlas en autoridad de ejecución.

**Alcance:** HMAC sobre bytes exactos, delivery ID durable, replay/out-of-order, allowlist de eventos y estados gruesos: `linear_created`, `awaiting_owner`, `codex_in_progress`, `pr_in_review`, `needs_changes`, `stopped`.

**Gate:** firma forjada, body mutado, replay y orden invertido fallan cerrados; ningún evento asigna Codex, crea rama, aprueba o promueve.

### 6. TAU-07G — Rechazo, candidato y decisión del owner

**Objetivo:** persistir el feedback de Nightly/Testers y convertirlo en una decisión explícita de Isaac.

**Alcance:** candidato exacto; aprobación, rechazo y `Cannot verify`; un voto por tester/candidato; rol de tester principal; bloqueo; dossier digestado; seis disposiciones: misma rama, sub-issue, entorno, issue nueva, descarte justificado y detener rollout.

**Gate:** una aprobación Nightly válida basta; rechazo autorizado bloquea; votos antiguos no migran a SHA nuevo; rechazo Testers exige retorno por Nightly; expediente incompleto no se puede delegar.

### 7. TAU-07H1 — PostHog: errores, contexto y replay

**Objetivo:** validar la integración preparada y cerrar su frontera de privacidad antes de mostrar consentimientos en la UI.

**Alcance:** captura de excepciones frontend y fallos backend permitidos; versión/canal/SHA/SO allowlisted; correlation ID con el reporte; session replay solo en Nightly/Testers y con masking de texto, inputs y superficies sensibles; URL interna/restringida almacenada en Supabase y proyectada a Linear únicamente cuando exista autorización.

**Gate:** corpus de tokens, emails, rutas locales, perfiles y texto libre produce cero retenciones; replay se puede desactivar; consentimiento y disponibilidad reales coinciden; retención y borrado están documentados; un fallo de PostHog nunca impide reportar ni autoriza delegación.

### 8. TAU-07H2 — Testing Center in-app

**Objetivo:** ofrecer una pestaña comprensible en builds Nightly/Testers, sin exponer Linear.

**UI mínima:**

- `Reportar problema`: título, pasos, esperado, observado y consentimiento explícito para diagnóstico/replay disponible.
- `Pendientes de validar`: cambio, canal, versión, SHA abreviado y criterios.
- Acciones `Funciona`, `Necesita cambios` y `No puedo verificar`.
- Rechazo estructurado: qué ocurrió, pasos, resultado esperado/observado y diagnóstico opcional.
- Estado posterior: recibido, en revisión, corrección pendiente, candidato nuevo o detenido.

**Gate:** capability firmada y rol server-side; Master y metadata desconocida fallan cerrados; borrador local; doble envío idempotente; accesibilidad, i18n y responsive; no aparecen controles de owner a testers.

### 9. TAU-07I — Piloto remoto Supabase -> Linear, sin Codex

**Objetivo:** demostrar ida/vuelta con un reporte sintético antes de enviar trabajo a Codex.

**Gate humano:** Isaac crea y guarda la credencial mínima en el secret manager y autoriza el deploy de testing.

**Prueba:** un reporte crea un issue Linear; repeticiones crean ocurrencias; webhook devuelve estado/URL; pausa impide un segundo efecto; secretos y evidencia privada no aparecen en Linear/logs.

**Rollback:** integración pausada, secreto revocable y migraciones reversibles después de reconciliar la outbox.

### 10. TAU-07J — Handoff humano y determinista a Codex

**Objetivo:** permitir que Isaac, desde una issue válida de Linear, abra una tarea Codex sobre la rama/SHA correcta con el dossier aprobado.

**Flujo:** Isaac elige disposición; Supabase congela dossier y digest; la UI operativa muestra rama/SHA/base esperadas; Isaac abre Codex Cloud y selecciona esa ref; el preflight falla cerrado si no coincide; Codex trabaja, ejecuta checks y abre PR para revisión humana; Linear recibe enlaces y estado, no autoridad autoafirmada.

**Gate:** cero asignación automática; cero retry; una tarea observada; una PR con base/head correctas; límites de scope; CI y review humana pendientes.

### 11. TAU-07K — Discord y auditoría end-to-end

**Objetivo:** cerrar comunicaciones y seguridad antes del piloto real.

**Discord:** canal de testers recibe mensajes anónimos y breves para issue recibido, corrección disponible, rechazo/bloqueo y nueva candidata. Nunca incluye logs, replay, identidad privada ni texto libre completo.

**Auditoría:** corpus de incompletos, duplicados, PII, secrets, prompt injection, replay, carreras, ramas incorrectas y eventos fuera de orden. Requiere P0/P1/P2=0 y deja todos los efectos pausados.

### 12. TAU-08A — Piloto Nightly real

**Objetivo:** ejecutar un único issue real controlado sobre una build Nightly.

**Flujo:** reporte in-app -> Linear -> decisión Isaac -> Codex determinista -> PR revisada -> aprobación inicial Isaac -> Nightly -> aprobación de un tester principal o rechazo/corrección.

**Gate:** no se promueve a Testers hasta cerrar el rechazo si existe y validar un candidato nuevo. El piloto termina pausado y con rollback probado.

### 13. TAU-08B — Piloto Testers y gate Master

**Objetivo:** validar el mismo circuito con el grupo amplio.

**Flujo de rechazo:** `testers -> needs_changes -> corrección desde nightly -> validación Nightly -> testers`. Solo Isaac autoriza el paso final a Master.

**Gate:** trazabilidad completa, comunicaciones correctas y aprobación humana explícita; ninguna promoción automática.

## Fronteras de datos

| Sistema | Puede contener | No debe contener |
| --- | --- | --- |
| Vantare | formulario, preview, estado y consentimiento | credenciales Linear/PostHog/Discord/Codex |
| Supabase | reporte completo, identidad interna, votos, dossier, outbox y estado canónico | secretos en tablas o logs |
| PostHog | error técnico y replay consentido con masking | tokens, credenciales, campos sensibles sin máscara |
| Linear | resumen sanitizado, versión/SO, criterios, estado, enlaces restringidos y dossier aprobado | replay embebido, logs crudos, secretos o identidad pública del tester |
| Codex | instrucciones fijas, hechos allowlisted, rama/SHA/base y evidencia mínima | texto libre como autoridad, secretos o acceso de promoción |
| Discord | estado breve, anónimo y accionable | PII, diagnóstico, replay, logs o detalles privados |

## Automatización permitida y gates humanos

**Automático:** captura consentida, redacción, fingerprint/dedupe, creación/actualización de Linear, reconciliación, composición del dossier, estados in-app, notificaciones Discord y ejecución de checks de PR.

**Humano obligatorio:** clasificar reportes dudosos; escoger disposición; seleccionar rama/SHA en Codex; revisar/crear PR si la superficie lo requiere; aceptar cambios; aprobar integración a Nightly; resolver rechazos; autorizar Testers y Master; crear/rotar secretos; desplegar o detener el circuito.

## Checks por tipo de corte

- Docs/contratos: tests de decoder/proyección, corpus adversarial y `git diff --check`.
- Supabase: PostgreSQL limpio, upgrade, rollback/reapply, concurrencia, Deno focal y suite activa.
- Go/bridge: `gofmt`, tests focales y `go test ./...` con deuda heredada separada.
- Frontend: tests focales, suite frontend, build, lint focal, accesibilidad y harness visual desktop/compact.
- Integración: datos exclusivamente sintéticos hasta TAU-08A; captura de IDs/URLs sin secretos; pausa y rollback demostrados.
- Cada corte termina con reviewer independiente sin editar y veredicto P0/P1/P2.

## Stop conditions

- Branch, SHA, ancestry o base no pueden verificarse fuera del prompt.
- Hace falta API OpenAI, gasto o dependencia no aprobados.
- Un dato sensible alcanza Linear, Discord, Codex o logs.
- GitHub y Linear podrían crear dos issues para el mismo reporte.
- Un reporte incompleto puede delegarse o un webhook puede autorizar trabajo.
- Una respuesta externa ambigua puede provocar una segunda tarea Codex.
- La corrección intenta saltar Nightly, reabrir una PR merged o reescribir historial.
- Los tests fallan por causa desconocida, aparece trabajo ajeno o el corte crece fuera de alcance.

## Primer día recomendado

1. Ejecutar solo TAU-07B y registrar GO/NO-GO.
2. Si es GO, ejecutar TAU-07C con cambio documental sintético y conservar evidencia.
3. Elegir y documentar el fallback de misma rama frente a sub-issue.
4. No iniciar schema, credenciales, deploy ni UI ese día.
5. Al cerrar los spikes, revalidar este plan y preparar TAU-07D en un worktree nuevo desde la base exacta autorizada.

## Criterio de terminado global

El MVP solo queda listo cuando un reporte controlado recorre el circuito, una corrección produce una PR revisable sobre la ref correcta, un tester principal puede aprobar o rechazar Nightly desde Vantare, un rechazo obliga a candidato nuevo, Testers devuelve correcciones por Nightly, Discord informa sin filtrar datos y todas las promociones conservan sus gates humanos. Hasta entonces, el sistema permanece en testing y apagable.
