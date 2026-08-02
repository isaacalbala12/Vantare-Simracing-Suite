# ADR 0007 — Testing Center y resolución asistida de errores

**Estado:** Proposed
**Fecha:** 2026-08-02
**Decisores:** Isaac y Vantare engineering
**Contexto:** ISA-205

## Contexto

Vantare es una aplicación de escritorio Wails/React todavía en testing y
desarrollada por una sola persona. Los testers necesitan reportar fallos sin
salir de la app y sin conocer GitHub o Linear. Isaac necesita reducir el trabajo
operativo, pero conservar revisión y parada humana en los puntos donde una
automatización podría modificar código, canales o una versión pública.

El flujo de entrega vigente es:

```text
rama de issue -> nightly (pre-beta) -> testers (beta) -> master (pública)
```

El contrato de privacidad de Vantare exige telemetría desactivada por defecto,
consentimiento revocable para diagnósticos y una previsualización exacta antes
de exportar información.

## Decisión

### Testing Center como superficie única para testers

Vantare tendrá una pestaña `Testing Center`, disponible solo en builds
`nightly` y `testers`. No será un overlay modal global.

La pestaña permitirá:

- crear y consultar reportes propios;
- revisar exactamente qué diagnóstico se enviará;
- ver la candidata asociada a un reporte;
- aceptar o rechazar una candidata cuando el usuario tenga el rol requerido;
- mostrar siempre versión, canal y SHA que se está validando.

Ocultar la pestaña por canal es solo una decisión de experiencia. La
autorización real se comprobará en servidor con Supabase Auth y RLS.

### Supabase como orquestador y registro de autoridad

Supabase poseerá la máquina de estados y las relaciones entre:

```text
report -> evidencia -> GitHub issue -> Codex run -> PR -> commit/SHA
       -> build candidata -> validación -> promoción
```

Las Edge Functions validarán identidad, rol, rate limits, idempotencia,
completitud, deduplicación y firmas de webhooks. Las credenciales privilegiadas
de GitHub, Discord, PostHog u OpenAI no entrarán en la aplicación cliente.

La fase inicial será serial: una única corrección automática activa y una única
candidata pendiente de validación. Esto evita que una promoción acumulativa de
ramas mezcle varios reportes no validados.

### GitHub Issues como cola técnica

Los testers no usarán GitHub directamente. El orquestador creará o ampliará un
issue estructurado con un GitHub App de permisos mínimos. Un reporte repetido se
vinculará al issue activo y aumentará su evidencia; no creará otro issue.

La integración oficial PostHog–GitHub no será el disparador inicial. Aunque
puede crear issues desde errores, actualmente solicita lectura/escritura sobre
código, issues y pull requests. Vantare necesita además completar el reporte,
deduplicarlo y aplicar una política de riesgo antes de permitir a Codex actuar.

Linear permanece como sistema interno de planificación de Vantare. No forma
parte del camino crítico del reporte de un tester.

### PostHog como evidencia opcional

PostHog capturará excepciones del frontend, contexto de release y, con
consentimiento explícito, session replay. El renderer web de Wails requiere un
spike real antes de declarar soportado el replay; no existe una integración
oficial específica para Wails.

Los errores y logs de Go se recopilarán mediante el diagnóstico local de
Vantare y el orquestador. No se asumirá que el SDK web cubre el proceso Go.

PostHog no será una dependencia de disponibilidad: un tester podrá enviar un
reporte completo sin replay y una caída de PostHog no bloqueará el circuito.

### Codex con política fija y evidencia no confiable

`openai/codex-action@v1` se preparará en GitHub Actions. No se activará hasta
que los contratos, permisos, dry-run y stop conditions tengan pruebas.

El texto del tester, logs, títulos, commits y comentarios se tratarán como datos
no confiables, nunca como instrucciones. El prompt de ejecución será fijo,
versionado en el repositorio y obligará a:

1. reproducir o caracterizar el fallo;
2. añadir una regresión observable cuando sea viable;
3. aplicar el cambio seguro más pequeño;
4. ejecutar los checks definidos por `AGENTS.md` y la issue;
5. abrir un PR draft a `nightly` con evidencia y riesgos no resueltos;
6. no mergear, promover, cambiar secretos o relajar gates.

Solo serán elegibles automáticamente los reportes completos y de bajo riesgo.
Seguridad, privacidad, auth, Billing, pérdida de datos, migraciones,
dependencias, arquitectura, workflows, secretos y protecciones de rama se
marcarán `needs_owner` sin ejecución de Codex.

### Gates humanos y promociones

- Isaac revisa el PR de Codex antes de que entre en `nightly`.
- Tras el merge, CI genera una candidata `nightly` ligada a su SHA exacto.
- Una aceptación de un tester principal valida esa candidata.
- La automatización prepara/promueve el corte a `testers` sin reinterpretar la
  evidencia.
- Una aceptación de un tester beta valida la candidata de `testers`.
- La automatización abre el PR `testers -> master`.
- Solo Isaac aprueba y mergea la versión pública.

Una nueva build o commit invalida aceptaciones anteriores. Un rechazo exige un
motivo, reabre el ciclo y permite como máximo un reintento automático. Un
segundo rechazo, una ejecución fallida o un cambio de riesgo pasa a
`needs_owner`.

### Discord solo comunica

GitHub Actions seguirá siendo el único publicador a Discord. Los mensajes
enlazarán el Testing Center o el issue y podrán anunciar una corrección
disponible o validada, pero nunca contendrán logs, session replays, rutas,
tokens, identidad privada ni afirmarán que algo está publicado antes de su
gate.

Se preparará un secreto dedicado para el grupo pre-beta; no se reutilizará un
webhook de audiencia más amplia.

### Parada y recuperación

Existirán dos controles server-side:

- pausa global del circuito;
- pausa por reporte/issue.

La pausa impedirá nuevos dispatches, reintentos y promociones, pero conservará
el estado y la evidencia. Nunca borrará branches, issues, PRs o diagnósticos.

## Alternativas descartadas

### Dar Linear o GitHub directamente a los testers

Descartada como experiencia principal: expone herramientas técnicas, produce
reportes incompletos y no puede adjuntar de forma segura el contexto local de
la app. Se conserva GitHub para ingeniería y Linear para planificación.

### PostHog crea el issue y dispara Codex inmediatamente

Descartada para el MVP: amplía permisos, no impone el contrato in-app, no
resuelve deduplicación de reportes manuales y convertiría evidencia externa en
un trigger privilegiado.

### Aceptación mediante GitHub Environments

Descartada como gate único: en repositorios privados GitHub Free no ofrece
required reviewers para environments. Además, los testers no deberían necesitar
acceso al repositorio. Supabase registrará la aceptación in-app; GitHub la
consumirá mediante un evento autenticado e idempotente.

### Autocomplete y merge directo hasta master

Descartada: elimina la revisión humana, mezcla validación funcional con
autoridad de publicación y convierte un error de clasificación en un release.

## Consecuencias

### Positivas

- Los testers operan íntegramente dentro de Vantare.
- Isaac revisa decisiones y cambios, no tareas de coordinación repetitivas.
- Cada aceptación demuestra qué binario y SHA se probó.
- Los duplicados aportan evidencia sin multiplicar trabajo.
- PostHog mejora el diagnóstico sin controlar el pipeline.
- La versión pública conserva un gate humano exclusivo.

### Costes

- Supabase requiere schema, RLS, webhooks y una máquina de estados propia.
- El replay en Wails debe probarse antes de prometer cobertura.
- La cola serial reduce throughput durante el MVP.
- GitHub Actions y OpenAI API tienen consumo separado y necesitan presupuestos.
- El plan gratuito de Supabase puede pausarse por inactividad y conserva logs
  de plataforma por poco tiempo; no debe tratarse como SLA de producción.

## Verificación

- Tests de contrato para cada transición e idempotency key.
- Tests RLS por rol y por reporte.
- Fixtures de sanitización y prompt injection.
- Simulación de duplicado, webhook repetido, commit nuevo y aceptación stale.
- Dry-run de Codex sin permisos de escritura antes del primer PR automático.
- Build candidata reproducible con versión, canal y SHA visibles.
- Prueba real de Discord sin datos sensibles y con deduplicación.
- Ensayo de pausa global durante cada etapa activa.

## Fuentes oficiales revisadas

- [PostHog Error Tracking](https://posthog.com/docs/error-tracking)
- [Integraciones de Error Tracking de PostHog](https://posthog.com/docs/error-tracking/integrations)
- [Controles de privacidad de Session Replay](https://posthog.com/docs/session-replay/privacy)
- [Precios de PostHog](https://posthog.com/pricing)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Seguridad de Edge Functions](https://supabase.com/docs/guides/functions/auth)
- [Supabase Database Webhooks](https://supabase.com/docs/guides/database/webhooks)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Eventos de GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [Deployments y environments de GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [Codex GitHub Action](https://github.com/openai/codex-action)
- [Discord Webhooks](https://docs.discord.com/developers/platform/webhooks)
