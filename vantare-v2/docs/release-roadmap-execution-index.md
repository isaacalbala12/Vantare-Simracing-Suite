# Release Roadmap Execution Index

Fuente de verdad operativa para llevar Vantare Simracing Suite desde la beta publica `v0.1.x` hasta el release oficial.

Este indice consolida:

- las decisiones cerradas en el chat de orquestacion;
- `docs/current-plan.md`;
- `docs/master-feature-plan.md`;
- `docs/roadmap-execution-board.md`;
- `Roadmap - Vantare Overlays.md`;
- `Roadmap Dia a Dia - Vantare Overlays.md`;
- `Features por desarrollar.md`.

Si hay conflicto, prevalece este orden:

1. Decisiones explicitas del chat.
2. Este indice y los planes `release-*`.
3. Documentacion viva de `docs/`.
4. Roadmaps historicos externos.

## Producto

Nombre suite: `Vantare Simracing Suite`.

Modulos:

- `Vantare Overlays Studio`;
- `Vantare Engineer`;
- telemetria compartida;
- distribucion/licencias.

La app actual se considera base de beta publica para testers.

Estado publico:

- `v0.1.0.0`: primera beta publica publicada.
- `v0.1.0.1`: hotfix completado — Supabase env vars en release build + login Google empaquetado.
- `v0.1.0.2`: hotfix completado — Supabase backend Go, Free plan desbloqueado, UnconfiguredScreen, y verificacion manual completa (login Google → Hub Free).
- `v0.3.*`: historico interno no anunciado.

A partir de estos planes, todo desarrollo debe distinguir entre:

1. hotfixes de la linea `0.1.0.x`;
2. mejoras visibles de beta `0.1.1.0+`;
3. releases mayores rumbo a `1.0.0.0`.

## Decisiones cerradas

- Proveedor de pago principal: Stripe directo.
- Auth y cuenta: Supabase.
- Login obligatorio.
- Login por email/password, Google y Discord si es viable.
- Licencia online obligatoria con periodo de gracia de 24h.
- Un PC activo por licencia.
- Reset de PC desde portal si es viable; si no, desde la app con backend.
- Discord roles automaticos por tier.
- Soporte principal: Discord, GitHub publico y Gmail.
- Idiomas release: espanol e ingles completos.
- Onboarding obligatorio: idioma, login, simulador principal, uso, perfil recomendado y checklist guiada.
- Telemetry uploads/replays de usuarios: fuera de release por decision actual.
- Community layouts/marketplace: post-release.
- Sync cloud completo de layouts/perfiles: post-release.
- Calendario LMU desde Discord: antes de release. Si leer Discord automaticamente no es viable, Isaac pasara el contenido para publicacion por IA/proceso asistido.
- Preview avanzada: debe ser completa, no parcial.
- Track Map e Input Telemetry/Trace entran en release. Si el dato no esta confirmado, salen como `tester` o `experimental`, pero no desaparecen del scope.
- Estado de datos:
  - `stable`: probado con datos reales o fixtures fiables;
  - `tester`: parcialmente implementado o necesita validacion externa;
  - `experimental`: dato no logrado, sim incompleto o fuente no confirmada.

## Precios decididos

Beta inicial, durante los primeros 6 meses:

- Beta Access: 5 EUR/mes.
- Supporter: 10 EUR/mes.
- Founder: 20 EUR/mes.
- Pro Founder: 35 EUR/mes.
- Visionary Backer: 50 EUR/mes.

Release:

- Overlays: 5 EUR/mes.
- Engineer: 5 EUR/mes.
- Bundle Overlays + Engineer: 8.99 EUR/mes.
- Assetto Corsa Lua/CSP Overlay Pack: 20 EUR pago unico.

Assetto Corsa Lua/CSP Pack:

- Producto separado.
- Puede incluirse como beneficio para Founder/Pro Founder/Visionary mientras sigan suscritos.
- No depende del runtime principal de Vantare.

## Planes ejecutables

Antes de volver al roadmap largo de release, ejecutar la linea publica inmediata:

| Version | Estado | Objetivo |
|---------|--------|----------|
| `0.1.0.0` | Completado | Primera beta publica: login obligatorio, gating free/paid/suite, perfiles recomendados, overlay edit mode, updater. |
| `0.1.0.1` | Completado | Hotfix Supabase env vars en release build + login Google empaquetado. |
| `0.1.0.2` | Completado | Hotfix Supabase backend Go + Free plan desbloqueado + UnconfiguredScreen + verificacion manual completa. |
| `0.1.x` | Por planear | Linux/Proton experimental. |
| `0.1.x` | Por planear | Vantare Setup Launcher v1. |
| `0.1.x` | Por planear | LMU race countdown beta: import manual/asistido por IA del calendario semanal publicado en Discord y notificacion overlay sobre el simulador. |
| `0.1.x` | Por planear | Launcher de simuladores: primer corte LMU-only para abrir simulador desde Vantare y agrupar acciones asociadas. |
| `0.1.x` | En progreso | Hub v5.2: primer corte visual implementado (shell, Dashboard con calendario integrado y pestaña Launcher real). Pendiente review/commit y siguientes cortes de paginas internas/cableado. |
| `0.1.x` | Por planear | Overlays publicos adicionales, hardening, rendimiento y UX posterior. |
| `0.1.x` | Por planear | Setup UI Tabs Rework (SETTINGS-01), icon branding Vantare (PACKAGING-01), UI polish del Hub. |
| `0.1.x` | Por planear | Stripe/licencias paid/suite reales, race data real desde LMU. |

Ejecutar por orden salvo decision explicita:

1. [Release 01 - Beta baseline, recomendados y presets](superpowers/plans/2026-06-26-release-01-beta-baseline-recommended-presets.md)
2. [Release 02 - Stripe, Supabase, auth y licencias](superpowers/plans/2026-06-26-release-02-stripe-supabase-licensing.md)
3. [Release 03 - Autoupdater y distribucion](superpowers/plans/2026-06-26-release-03-autoupdater-distribution.md)
4. [Release 04 - Preview avanzada y LayoutStudio profesional](superpowers/plans/2026-06-26-release-04-advanced-preview-layout-editor.md)
5. [Release 05 - Data reliability matrix](superpowers/plans/2026-06-26-release-05-data-reliability-matrix.md)
6. [Release 06 - iRacing y Assetto Corsa como simuladores](superpowers/plans/2026-06-26-release-06-multisim-iracing-assetto.md)
7. [Release 07 - Assetto Corsa Lua/CSP Overlay Pack](superpowers/plans/2026-06-26-release-07-assetto-corsa-lua-csp-pack.md)
8. [Release 08 - Layouts por sesion y visibilidad condicional](superpowers/plans/2026-06-26-release-08-session-layouts-visibility.md)
9. [Release 09 - Widget pack y data blocks](superpowers/plans/2026-06-26-release-09-widget-pack-data-blocks.md)
10. [Release 10 - Multiclase, headers y standings release](superpowers/plans/2026-06-26-release-10-multiclass-headers-standings.md)
11. [Release 11 - Engineer radio overlay y calendario Discord](superpowers/plans/2026-06-26-release-11-engineer-radio-calendar-discord.md)
12. [Release 12 - OBS y streaming](superpowers/plans/2026-06-26-release-12-obs-streaming.md)
13. [Release 13 - UX, onboarding, i18n y design system](superpowers/plans/2026-06-26-release-13-product-ux-i18n-design-system.md)
14. [Release 14 - Docs, soporte, legal y release candidate](superpowers/plans/2026-06-26-release-14-docs-support-legal-rc.md)
15. [Release 15 - Auditoria de seguridad, code review y refactors profundos](superpowers/plans/2026-06-26-release-15-security-code-review-refactor.md)

### Release 02 — Mini-Plan tracking

- Mini-Plan A (architecture + Supabase schema + Stripe plan): design-only, aceptado.
- Mini-Plan B (Go LicenseService + webhook backend): implementado y aceptado con P3.
- Mini-Plan C (frontend auth/license UI): implementado y aceptado con P1-P3. Correcciones P1-P3 del review aplicadas el 2026-06-27.
- Webhook entitlement mapping implementado con tests. Pendiente: gate manual OAuth/Stripe real y validación real del flujo OAuth en builds empaquetadas.

### Linea publica 0.1.x — tracking

- `0.1.0.0`: publicado con release GitHub y 6 assets verificados. Detectado P0 posterior: build sin configuracion Supabase completa.
- `0.1.0.1`: completado — hotfix Supabase env vars en release build + login Google empaquetado.
- `0.1.0.2`: completado — hotfix Supabase backend Go (via `generate_supabase_config.ps1`), estado `UnconfiguredScreen`, plan Free desbloqueado tras Google OAuth. Verificacion manual completa.
- `HUB-01`: completado — dashboard beta honesto, Topbar sin nombre hardcodeado, BetaWelcome una sola vez.
- `HUB-02`: completado — ActiveOverlayCard con acciones reales de overlay activo en Dashboard.
- `HUB-03`: completado — recommended first-use flow: Hub → recomendado → guardar como propio → overlay funcionando.
- `HUB-04`: completado y commiteado — role-aware BetaWelcome con copy adaptado por tipo de usuario.
- `HUB-05`: implementado, pendiente review/commit — primer corte visual v5.2 del Hub: shell/navegacion, Dashboard con calendario integrado, Launcher como pestaña real y placeholders honestos sin fake data.
- `0.1.x por planear`: Linux/Proton experimental. Validar primero si conviene app Windows bajo Proton, build Linux nativa o bridge/proxy para telemetria.
- `0.1.x por planear`: Vantare Setup Launcher v1. Scope inicial: Windows only, UI propia, verificacion SHA256, NSIS por debajo, aviso SmartScreen y enlaces de soporte.
- `0.1.x por planear`: LMU race countdown beta. Scope inicial: importar manualmente o con IA el calendario semanal publicado en Discord, validar horarios/zona horaria y mostrar avisos temporales sobre el simulador. No incluye scraping automatico de Discord ni bot.
- `0.1.x por planear`: launcher de simuladores. Primer corte LMU-only para abrir el simulador desde Vantare y agrupar acciones asociadas por simulador.
- `0.1.x por planear`: Setup UI Tabs Rework (SETTINGS-01), icon branding Vantare (PACKAGING-01), UI polish del Hub, hardening de licencias y rendimiento.
- `0.1.x por planear`: Stripe/licencias paid/suite reales, race data real (safety/rating/progression desde LMU).

## Paralelizacion segura

Se puede paralelizar:

- Release 02 con Release 03 si los workers no tocan los mismos workflows.
- Release 05 con Release 13.
- Release 06 investigacion AC/iRacing con Release 07 analisis Lua/CSP.
- Release 11 calendario Discord con Release 12 OBS, si no comparten frontend.

No paralelizar:

- cambios de schema de perfiles;
- cambios de auth/licencia;
- cambios de preview/LayoutStudio;
- cambios de widget runtime y `WidgetHost`;
- dos simuladores que modifiquen la misma capa de `internal/telemetry` sin contrato cerrado.

## Gates globales

Cada plan debe cerrar con:

- inventario tecnico;
- miniplan acotado;
- implementacion por worker;
- review GLM adversarial;
- fixes P0/P1/P2;
- checks automaticos;
- verificacion manual si toca UI/runtime;
- update documental;
- commit/push/tag si es checkpoint funcional.

## Auditorias globales de calidad

- Primera auditoria global: al cerrar `Release 03` completo, antes de avanzar fuerte en `Release 04`. Alcance minimo: auth/licencias, webhooks, versionado, build/package/updater, seguridad, persistencia local, tests complacientes y deuda P3 acumulada.
- Segunda auditoria global: `Release 15`, obligatoria antes de aceptar la release candidate final.
- No lanzar auditorias globales entre miniplanes salvo P0/P1/P2 transversal; usar reviews por feature para evitar ruido mientras el codigo esta en movimiento.

## Release 15 - Security/code audit gate

Release 15 se ejecuta cuando la mayoria de features de release ya esten implementadas. No sustituye los reviews por feature: es una auditoria transversal final para seguridad, arquitectura, deuda tecnica y refactors profundos controlados.

Release 15 debe cerrarse antes de aceptar la release candidate final de Release 14. Release 14 prepara docs, soporte y RC; Release 15 decide si esa RC es apta para publicar o si necesita fixes/refactors previos.

No debe ejecutar refactors grandes sin:

- inventario;
- tests de caracterizacion;
- propuesta de refactor;
- aprobacion de alcance;
- review GLM;
- rollback plan.

## Prompt base para workers

```markdown
Actua como worker senior de Vantare Simracing Suite.

Lee obligatoriamente:
- AGENTS.md
- docs/current-plan.md
- docs/release-roadmap-execution-index.md
- docs/roadmap-execution-board.md
- docs/feature-architecture-map.md
- el plan release-* asignado

Si tocas Go, usa las skills:
- golang-error-handling
- golang-testing
- golang-code-style
- golang-safety
- golang-concurrency y golang-context si hay goroutines, SSE, lifecycle o cancelacion

Reglas:
- no commits ni staging;
- no dependencias nuevas sin aprobacion;
- no tocar archivos fuera del alcance;
- TDD para cambios de comportamiento;
- reportar en espanol archivos, checks, riesgos y verificacion manual.
```

## Prompt base para reviewer GLM

```markdown
Actua como reviewer adversarial senior para Vantare Simracing Suite.

Review only. No edites codigo.

Lee:
- AGENTS.md
- docs/current-plan.md
- docs/release-roadmap-execution-index.md
- docs/roadmap-execution-board.md
- plan release-* correspondiente
- diff del worker
- reporte del worker

Si hay Go, aplica mentalmente:
- golang-error-handling
- golang-testing
- golang-code-style
- golang-safety
- golang-concurrency/context cuando aplique

Busca:
- P0/P1/P2/P3;
- cambios fuera de alcance;
- tests complacientes;
- responsabilidades mezcladas;
- bugs de persistencia/licencia/auth;
- regresiones de preview/LayoutStudio/runtime/OBS;
- docs contradictorias.

Devuelve veredicto: ACCEPT, ACCEPT WITH P3, NEEDS FIXES o BLOCKED.
```
