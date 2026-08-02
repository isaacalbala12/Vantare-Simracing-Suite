# Testing Center y ciclo de errores — plan maestro por microcortes

**Fecha:** 2026-08-02
**Autoridad:** ISA-205, ADR 0007 y contrato global de producto
**Base inicial:** `nightly@c71959167ef0c96a5eaaef86ec0beb1dd0819ed6`
**Estado:** propuesta para revisión; ninguna integración activada

## Resultado buscado

Un tester reporta un problema dentro de Vantare. La app añade contexto técnico
consentido, Supabase valida y deduplica, GitHub abre una tarea técnica y Codex
prepara un PR de bajo riesgo. Tras revisión de Isaac, una build exacta llega a
`nightly`; un tester principal la acepta o rechaza desde Testing Center. Si se
acepta, pasa a `testers`; una aceptación beta prepara el PR final a `master`,
que solo Isaac puede aprobar.

El sistema automatiza coordinación y trabajo repetitivo. No automatiza la
autoridad para publicar ni convierte un resultado de CI en validación humana.

## Flujo inicial

```text
Tester
  -> Testing Center / formulario + preview del paquete
  -> Supabase Auth + RLS + máquina de estados
  -> validación / sanitización / deduplicación
  -> GitHub Issue estructurado
  -> política de elegibilidad
       -> needs_owner, o
       -> Codex Action -> PR draft a nightly
  -> revisión de Isaac + merge
  -> build nightly ligada a SHA
  -> Discord: candidata disponible
  -> 1 tester principal acepta/rechaza in-app
       -> rechazo: feedback + máximo 1 reintento
       -> aceptación: promoción automática a testers
  -> build testers ligada a SHA
  -> 1 tester beta acepta/rechaza in-app
       -> aceptación: PR testers -> master
  -> revisión y merge final solo por Isaac
```

## Fuentes de autoridad

- Supabase: identidad, roles, estado, idempotencia, deduplicación, candidatos y
  validaciones.
- GitHub: issues técnicos, ramas, PRs, checks, builds y promociones.
- PostHog: excepción, release y replay opcional; nunca estado del workflow.
- Discord: notificación unidireccional; nunca aceptación ni fuente de verdad.
- Linear: planificación interna y microcortes; nunca formulario para testers.

## Integración oficial frente a implementación propia

| Pieza | Disponible oficialmente | Debe construir Vantare |
| --- | --- | --- |
| PostHog | Error Tracking, releases/source maps, Session Replay y creación manual de GitHub Issues | Spike Wails, consentimiento/preview, vínculo por `report_id` y fallback sin PostHog |
| Supabase | Auth, RLS, Postgres, Edge Functions y Database Webhooks | Schema, roles de testers, máquina de estados, deduplicación, kill switch y reconciliación |
| GitHub | Issues/API, Actions, labels, checks, artifacts, PRs y eventos | GitHub App mínimo, templates, política de riesgo, ramas/candidatas y promociones idempotentes |
| Codex | `openai/codex-action@v1` y ejecución no interactiva | Prompt fijo, corpus adversarial, allowlist, budgets, salida JSON y wrapper que abre el PR |
| Discord | Incoming webhooks | Payloads sanitizados, secreto por audiencia, deduplicación y deep links |
| Linear | Issues/proyectos para ingeniería | Crear los microcortes y conservar estado; ninguna UI o cuenta para testers |

## Contrato mínimo del reporte

### Escrito por el tester

- Qué intentaba hacer.
- Qué ocurrió.
- Qué esperaba.
- Pasos para reproducir o indicación de que fue esporádico.
- Severidad percibida: bloquea, degrada o cosmético.
- Consentimiento separado para logs y para replay.

### Añadido automáticamente

- `report_id` y `client_submission_id`.
- versión, canal, commit SHA, fecha y locale;
- Windows, arquitectura y versión de WebView/runtime;
- módulo/ruta activa y capacidades relevantes;
- simulador y estado de conexión, sin telemetría cruda;
- correlation IDs y últimas líneas de log permitidas;
- fingerprint de excepción y URL de replay, si existen y fueron consentidos.

### Nunca incluido por defecto

- tokens, cookies, cabeceras de auth o secretos;
- email, nombre real o rutas con nombre de usuario;
- archivos de telemetría, voz, estrategias, perfiles o grabaciones;
- cuerpos completos de red;
- texto oculto o comandos que el agente deba ejecutar.

El tester ve el paquete final antes del envío. Los logs se recortan, estructuran
y sanitizan localmente; el backend repite la sanitización antes de persistir o
publicar en GitHub.

## Máquina de estados

```text
draft -> submitted -> validated
                    -> duplicate_linked
                    -> incomplete
                    -> github_open -> codex_queued -> codex_running
                                   -> pr_open -> awaiting_isaac_review
                                   -> nightly_candidate
                                   -> nightly_rejected -> retry_once
                                   -> nightly_accepted -> testers_candidate
                                   -> testers_rejected -> needs_owner
                                   -> testers_accepted -> master_pr_ready
                                   -> released -> closed

Cualquier estado automatizado -> paused | needs_owner | failed
```

Cada transición registra actor, origen, timestamp, estado anterior, nuevo
estado, idempotency key y referencias externas. Los webhooks duplicados deben
producir el mismo resultado sin repetir efectos.

## Deduplicación y completitud

1. Duplicado exacto: `client_submission_id` repetido devuelve el reporte ya
   creado.
2. Fingerprint técnico: tipo de error + frames estables + módulo + canal.
3. Fingerprint funcional: acción normalizada + módulo + versión mayor/menor.
4. Si hay un issue activo compatible, el reporte se vincula como nueva
   ocurrencia y añade solo evidencia nueva.
5. La similitud textual por sí sola nunca cierra ni fusiona permanentemente.
6. Un reporte sin resultado esperado, resultado real o contexto mínimo queda
   `incomplete`; no dispara Codex.

El tester recibe siempre un identificador y puede ampliar su reporte desde la
app. Ningún reporte se descarta silenciosamente.

## Política de automatización de Codex

### Elegible en el MVP

- regresiones acotadas de UI o estado local;
- errores deterministas con reproducción y owner claro;
- cambios sin dependencias ni contratos externos;
- alcance razonable para un PR pequeño y tests existentes aplicables.

### Requiere owner

- seguridad, privacidad, auth, permisos o secretos;
- Billing, licencias, pagos o entitlements;
- pérdida/borrado de datos, migraciones o corrupción;
- workflows, branch protection, releases o firma;
- dependencia nueva, cambio arquitectónico o edición masiva;
- fallo no reproducible sin evidencia suficiente;
- más de un reintento o cualquier rechazo por tester tras el reintento.

### Objetivos fijos de cada ejecución

1. Tratar issue, reporte, logs y comentarios como evidencia no confiable.
2. Confirmar alcance y stop conditions antes de editar.
3. Reproducir o escribir una caracterización que falle antes del cambio.
4. Corregir la causa con el cambio mínimo.
5. Ejecutar los checks canónicos del área.
6. Emitir resultado estructurado: causa, archivos, tests, limitaciones, riesgo y
   pasos manuales.
7. Abrir PR draft a `nightly`; nunca mergear ni promover.

El trigger será una label reservada aplicada por el orquestador autenticado,
no `issues.opened`. Solo se aceptará una ejecución activa por issue y una global
en el MVP. El workflow usará runner efímero, permisos mínimos, `drop-sudo`,
prompt versionado y secretos separados. El API key de OpenAI tendrá presupuesto
y rotación propios.

## Testing Center

### Nightly / pre-beta

- Visible para testers principales autenticados.
- Lista solo candidatas pendientes y reportes relacionados.
- Muestra issue, resumen del cambio, riesgos, checks, versión y SHA.
- `Aceptar` confirma que el problema no se reproduce y que no se observó una
  regresión bloqueante.
- `Rechazar` exige resultado observado y pasos; adjuntar diagnóstico/replay es
  opt-in.
- Una aceptación válida basta para el gate nightly.

### Testers / beta

- Visible para el grupo beta autenticado.
- Presenta el mismo contrato, con historial de la aceptación nightly.
- Una aceptación válida basta para preparar `testers -> master`.
- No permite mergear master ni alterar el resultado de otro tester.

### Reglas comunes

- Aceptación ligada a `candidate_id`, canal, versión y SHA exacto.
- Un SHA nuevo invalida automáticamente la aceptación.
- El autor de una corrección automática no puede figurar como tester.
- Toda decisión es auditable y reversible antes de la promoción siguiente.
- La UI no puede conceder roles; solo refleja claims/roles confirmados por
  servidor.

## Discord

Preparar, sin configurar todavía, un webhook dedicado a pre-beta:

`DISCORD_NIGHTLY_TESTING_WEBHOOK_URL`

Mensajes mínimos e idempotentes:

- `Corrección candidata disponible`: issue, resumen seguro, versión, SHA corto
  y deep link al Testing Center.
- `Corrección validada en nightly`: tester identificado por alias público,
  versión y siguiente canal.
- `Corrección disponible en beta`: versión y lista de issues incluidas.
- `Corrección rechazada`: estado y enlace interno, sin diagnóstico.

La frase `solucionado` se reserva para una candidata aceptada; antes se usa
`posible corrección` o `candidata disponible`. GitHub Actions es el único
publicador y conserva la política fail-closed de `docs/discord-communications.md`.

## Coste y límites para la fase de testing

Valores comprobados en documentación oficial el 2026-08-02; deben revisarse
antes de activar gasto.

| Servicio | Gratis relevante | Riesgo/límite para Vantare |
| --- | --- | --- |
| PostHog | 100.000 excepciones/mes, 5.000 replays/mes, 1 M eventos/mes, 1 proyecto, retención de 1 año | Configurar caps; replay consume datos sensibles y no sustituye logs Go |
| Supabase | 2 proyectos, 500 MB DB/proyecto, 1 GB Storage, 5 GB egress, 50.000 MAU, 500.000 invocaciones Edge, 2 M mensajes Realtime | Logs de plataforma de 1 día; proyecto puede pausarse tras una semana de baja actividad; sin SLA |
| GitHub Free privado | 2.000 minutos Actions/mes y 500 MB de storage Actions | Builds Windows y Codex pueden agotar minutos; required reviewers de environments no disponibles en privado |
| Codex Action | Action oficial sin coste de licencia separado documentado | Usa OpenAI API: coste variable por modelo/tokens; fijar presupuesto, concurrencia y reintentos |
| Discord | Incoming webhook sin bot persistente | Aplican rate limits; no usar como cola ni almacenar secretos en payloads |
| Linear | Fuera del runtime; se mantiene para planificación | Los testers no necesitan cuenta ni licencia |

Para un grupo pequeño y cola serial, los free tiers deberían bastar como piloto,
pero esto es una estimación. El primer soak medirá minutos de Actions, tamaño de
artifacts, invocaciones, egress, excepciones y replays por reporte.

## Privacidad y seguridad

- Diagnóstico y replay desactivados por defecto y con consentimientos separados.
- Configurar `maskAllInputs`, `maskTextSelector: "*"` y `ph-no-capture` en
  cuenta, Billing, estrategias, perfiles, diagnóstico y cualquier dato del
  piloto; solo se desocultan elementos declarados seguros.
- Redacción de query strings, network bodies, rutas locales y nombres.
- Región EU para PostHog/Supabase cuando el proyecto lo permita y revisión de
  DPA/subprocesadores antes de ampliar el grupo.
- Retención corta configurable para diagnóstico propio; borrado por `report_id`.
- Replay solo como URL autenticada; nunca copiarlo a Discord o a un issue.
- RLS por propietario/rol; service keys solo en Edge Functions/Actions.
- Webhooks externos verifican firma, timestamp y replay/idempotency key.
- GitHub issue sin secretos; logs limitados y doblemente sanitizados.
- El código de PR y el contenido del issue no comparten un job privilegiado con
  secretos ajenos.
- Pausa global comprobada antes de la primera ejecución con escritura.

## Microcortes ordenados

Cada corte tendrá su propia issue de Linear, rama generada por Linear, worktree,
PR draft, tests y revisión. ISA-205 no implementa ninguno.

### TAU-00 — Plan y ADR

**Objetivo:** cerrar arquitectura, responsabilidades, límites y orden.
**Salida:** este plan, ADR 0007, handoff y mapa vivos.
**No incluye:** código, schema, secretos, workflows o servicios activados.

### TAU-01 — Spike PostHog en Wails

**Objetivo:** demostrar en un harness local qué cubren excepciones, source maps,
release y replay dentro del WebView de Wails.
**Salida:** matriz frontend/Go, masking máximo, start/stop, offline y coste por
sesión.
**Gate:** ningún dato real; si replay no es fiable o seguro, el MVP continúa
sin replay.

### TAU-02 — Contratos y máquina de estados

**Objetivo:** definir schemas versionados de reporte, evidencia, issue, run,
candidata, validación y promoción.
**Salida:** migrations, RLS, roles `tester`, `primary_tester`, `owner`,
idempotencia, pausa global/por issue y tests de transición.
**Gate:** revisión de seguridad y rollback de migration antes de deploy.

### TAU-03 — Diagnóstico local y preview

**Objetivo:** construir un paquete pequeño, determinista y sanitizado.
**Salida:** allowlist de campos/logs, redacción de secretos/rutas, límites,
preview y borrado.
**Gate:** fixtures adversariales y comparación byte a byte de lo mostrado con
lo enviado.

### TAU-04 — Formulario in-app

**Objetivo:** enviar y consultar reportes desde Testing Center en nightly.
**Salida:** drafts, validación de campos, opt-ins separados, retry de red e
identificador visible.
**Gate:** accesibilidad, responsive, offline seguro y cero pérdida del draft.

### TAU-05 — Orquestador GitHub y deduplicación

**Objetivo:** crear/vincular GitHub Issues mediante GitHub App mínimo.
**Salida:** issue template estructurado, fingerprint, comentarios de nuevas
ocurrencias, webhook firmado y reconciliación.
**Gate:** 100 repeticiones producen un solo issue/efecto; no hay assignee ni
Codex todavía.

### TAU-06 — Clasificación de riesgo y dry-run Codex

**Objetivo:** separar automáticamente `eligible` de `needs_owner` y ejecutar
Codex sin escritura.
**Salida:** prompt fijo, corpus de prompt injection, salida JSON y budgets.
**Gate:** cero falsos elegibles en el corpus sensible; revisión adversarial
independiente.

### TAU-07 — PR automático de bajo riesgo

**Objetivo:** permitir una ejecución con escritura y PR draft a nightly.
**Salida:** rama por issue, tests, commit, PR, una ejecución global y un retry
técnico acotado.
**Gate:** Codex no puede mergear, editar workflows/secrets ni ampliar permisos;
Isaac revisa el primer conjunto de PRs.

### TAU-08 — Registro de candidata y Discord preparado

**Objetivo:** asociar el merge aprobado a una build nightly exacta.
**Salida:** manifest `candidate_id/version/channel/SHA`, artifacts con retención
acotada, deep link y payload Discord en dry-run.
**Gate:** un mensaje por transición y ninguna evidencia sensible.

### TAU-09 — Validación primary tester

**Objetivo:** aceptar/rechazar una candidata nightly desde la app.
**Salida:** UI por rol, firma server-side, stale invalidation y audit log.
**Gate:** un tester principal válido basta; usuario normal, replay o request
repetida no pueden falsificar la transición.

### TAU-10 — Feedback y reintento único

**Objetivo:** devolver un rechazo estructurado al mismo issue y producir una
nueva candidata.
**Salida:** aceptación anterior invalidada, un solo reintento y escalado.
**Gate:** segundo rechazo termina en `needs_owner`; nunca hay bucle infinito.

### TAU-11 — Promoción a testers y validación beta

**Objetivo:** promover la candidata aceptada, notificar beta y registrar una
aceptación tester.
**Salida:** PR/promoción `nightly -> testers`, build exacta y gate beta.
**Gate:** cola serial sin commits adicionales; divergencia de ramas bloquea la
promoción y requiere owner.

### TAU-12 — PR final y cierre

**Objetivo:** abrir `testers -> master` tras la aceptación beta y cerrar el
reporte después del merge público.
**Salida:** PR con trazabilidad completa y notificaciones finales.
**Gate:** solo Isaac puede aprobar/mergear master; sin auto-release implícito.

### TAU-13 — Hardening y salida del piloto

**Objetivo:** decidir si el circuito puede ampliarse.
**Salida:** soak, costes, tiempos, tasa de duplicados, falsos elegibles,
rechazos, incidentes de privacidad, recovery y runbook.
**Gate:** prueba de kill switch en todos los estados, rotación de secretos,
restauración Supabase y revisión humana de seguridad/privacidad.

## MVP recomendado

Para la primera fase real, ejecutar TAU-01..09 con estas limitaciones:

- solo `nightly`;
- 2–5 testers principales autenticados;
- un reporte/candidata activo;
- frontend y estado local de bajo riesgo;
- PostHog opcional y con masking máximo;
- Codex en dry-run hasta completar el corpus adversarial;
- Discord en dry-run hasta validar destino y redacción;
- no promoción automática a `testers` hasta cerrar al menos tres candidatas
  nightly sin incidentes.

TAU-10..13 activan el bucle completo después de esa evidencia.

## Qué se automatiza y qué conserva revisión humana

| Acción | Autoridad |
| --- | --- |
| Completar contexto, sanitizar, validar y deduplicar | Automática, con preview del tester antes del envío |
| Crear/vincular GitHub Issue y aplicar estado | Automática desde Supabase |
| Decidir `eligible`/`needs_owner` | Política automática fail-closed; owner puede corregirla |
| Analizar repo, cambiar código, testear y abrir PR draft | Codex, solo allowlist y con un retry máximo |
| Aceptar el PR para entrar en nightly | Isaac |
| Generar build y notificar candidata | Automática |
| Validar candidata nightly | Un tester principal autenticado |
| Promover a testers | Automática tras gate válido y sin divergencia |
| Validar candidata beta | Un tester autenticado del canal testers |
| Abrir PR testers -> master | Automática |
| Aprobar/mergear master y publicar | Solo Isaac |
| Pausar globalmente o por issue | Isaac; la automatización también falla cerrada |

## Métricas de salida

- 100 % de reportes con versión, canal, SHA y estado visible.
- 0 secretos o PII conocida en GitHub/Discord/PostHog durante el piloto.
- 0 issues/PRs/promociones duplicados ante reintentos.
- 0 ejecuciones Codex en categorías `needs_owner`.
- 100 % de aceptaciones ligadas al SHA realmente instalado.
- máximo un reintento automático por issue.
- pausa global efectiva antes del siguiente side effect.
- coste mensual y minutos Actions dentro de budgets configurados.

## Stop conditions

- contradicción con privacidad, ramas o auth vigentes;
- necesidad de dependencia nueva no aprobada;
- GitHub App requiere permisos más amplios de los previstos;
- PostHog captura contenido no visible en preview/masking;
- no puede demostrarse qué SHA ejecutó el tester;
- webhook o transición no es idempotente;
- Codex interpreta evidencia como instrucciones;
- el pipeline intenta mergear master o publicar sin Isaac;
- se supera el presupuesto o el servicio pierde trazabilidad.

## Fuentes oficiales

- [PostHog Error Tracking](https://posthog.com/docs/error-tracking)
- [PostHog GitHub/Linear integrations](https://posthog.com/docs/error-tracking/integrations)
- [PostHog Session Replay privacy](https://posthog.com/docs/session-replay/privacy)
- [PostHog pricing](https://posthog.com/pricing)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase function limits](https://supabase.com/docs/guides/functions/limits)
- [Supabase billing quotas](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [GitHub workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [GitHub environment gates](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [GitHub Free usage](https://docs.github.com/en/billing/reference/product-usage-included)
- [OpenAI Codex Action](https://github.com/openai/codex-action)
- [Discord incoming webhooks](https://docs.discord.com/developers/platform/webhooks)
