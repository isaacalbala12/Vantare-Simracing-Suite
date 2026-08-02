# Handoff vivo — Testing Center y automatización de errores

## Autoridad y lectura

- `docs/vantare-program/README.md`, `product-contract.md`, `project-map.md` y
  `execution-policy.md`.
- `docs/adr/0007-testing-center-and-automated-error-remediation.md`.
- `docs/superpowers/plans/2026-08-02-isa-205-testing-center-error-loop-master.md`.
- `docs/branch-channels.md` y `docs/discord-communications.md`.
- La issue activa de Linear y su branch generada prevalecen sobre este resumen.

## Estado

- ISA-205 / TAU-00: plan maestro y ADR en propuesta.
- Base de planificación: `nightly@c71959167ef0c96a5eaaef86ec0beb1dd0819ed6`.
- Implementación: ninguna.
- Supabase/PostHog/Codex/Discord: no activados por este corte.
- Siguiente corte propuesto: TAU-01, spike PostHog en Wails con datos sintéticos.

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

Tras aceptar TAU-00, crear en Linear TAU-01 como issue independiente. Debe
usar solo datos sintéticos, no añadir todavía dependencia productiva y cerrar
con una decisión GO/NO-GO para replay en Wails. No abrir TAU-02 desde este
worktree.

## Última actualización

2026-08-02, ISA-205 / TAU-00, Codex orquestador.
