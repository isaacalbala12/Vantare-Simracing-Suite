# Handoff vivo — Testing Center y automatización de errores

## Autoridad y lectura

- `docs/vantare-program/README.md`, `product-contract.md`, `project-map.md` y
  `execution-policy.md`.
- `docs/adr/0007-testing-center-and-automated-error-remediation.md`.
- `docs/superpowers/plans/2026-08-02-isa-205-testing-center-error-loop-master.md`.
- `docs/branch-channels.md` y `docs/discord-communications.md`.
- La issue activa de Linear y su branch generada prevalecen sobre este resumen.

## Estado

- ISA-205 / TAU-00: plan maestro y ADR en propuesta; PR #95 draft.
- Base histórica de planificación:
  `nightly@c71959167ef0c96a5eaaef86ec0beb1dd0819ed6`.
- ISA-206 / TAU-01: spike PostHog/Wails sintético implementado; PR #97 draft y
  CI verde. Frontend error tracking y replay quedan `GO` condicionado; errores
  Go requieren puente sanitizado propio.
- ISA-207 / TAU-02: dividido en ISA-208/209/210 por riesgo. ISA-208 implementa
  primero contratos puros sobre
  `nightly@b8ffd7c6c824f17ebcc09a5e44bf4ac12bafb7c5`.
- Implementación productiva, esquema, RLS y UI: ninguna integrada.
- Supabase/PostHog/Codex/Discord: no activados por este corte.
- La promoción de Billing ISA-203 aporta un arnés PostgreSQL/pgTAP desechable
  que TAU-02B/02C deben reutilizar sin tocar la instancia Supabase local activa.

## Resultado

Reportes in-app con diagnóstico consentido, deduplicación y trazabilidad hasta
GitHub Issue, PR Codex, build candidata, validación en Testing Center y
promoción `nightly -> testers -> master`.

## Ownership

- Testing Center posee la experiencia y el preview local.
- Diagnóstico local posee allowlist, límites y sanitización de evidencia.
- Supabase posee auth, roles, máquina de estados, idempotencia y audit trail.
- GitHub posee issues técnicos, PRs, checks, builds y promociones.
- PostHog aporta excepción/replay opcional; nunca workflow state.
- Discord comunica; nunca valida.
- Linear planifica los cortes; los testers no lo usan.

## Decisiones cerradas

- Pestaña dedicada, no overlay modal.
- Visible en nightly/testers; autorización siempre server-side.
- Una aceptación primary tester basta en nightly.
- Una aceptación beta basta en testers.
- Isaac revisa el PR antes de nightly y conserva master exclusivo.
- Una candidata se valida por SHA exacto; un commit nuevo invalida el voto.
- Cola serial y máximo un reintento automático durante el MVP.
- PostHog es opcional y no crea/dispara issues directamente en la fase inicial.
- Codex solo actúa en allowlist de bajo riesgo y abre PR draft.
- Pausa global y por issue antes de activar side effects.

## Riesgos

- **P0 potencial:** secretos o datos privados llegan a replay, issue o Discord.
- **P0 potencial:** una transición inválida publica/promueve código no validado.
- **P1:** prompt injection desde reporte, logs, issue o comentarios.
- **P1:** una aceptación no corresponde al binario/SHA realmente probado.
- **P1:** RLS o roles permiten que un tester valide fuera de su canal.
- **P2:** replay del WebView Wails no representa errores del proceso Go.
- **P2:** free tiers, pausing o retención corta pierden operabilidad/evidencia.
- **P2:** varias correcciones en nightly rompen la relación candidata-issue.

## Gates antes de escritura automática

1. Contratos y RLS testeados.
2. Sanitización local y backend con corpus adversarial.
3. Webhooks firmados e idempotentes.
4. Codex dry-run con prompt fijo y salida estructurada.
5. GitHub App y Action con permisos mínimos revisados.
6. Kill switch probado.
7. Isaac aprueba pasar de dry-run a PR automático.

## Siguiente acción

Cerrar ISA-208 con contratos y transiciones puras, review independiente y PR
draft. Después apilar ISA-209 para esquema fail-closed y rollback en contenedor
desechable; no iniciar RLS/RPC de ISA-210 hasta aprobar ese gate.

## Última actualización

2026-08-02, ISA-205/206/207/208, Codex orquestador. Sin merge ni promoción.
