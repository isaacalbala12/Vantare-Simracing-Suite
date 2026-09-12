# Revisión documental del cambio a Notion — ISA-1189

Fecha: 2026-09-12. Decisión y estado real: [notion-transition.md](notion-transition.md).

## Alcance y método

Búsqueda en el repositorio de Markdown y plantillas por GitHub Issues, tracker,
Linear, autoridad de tarea, handoff y convención ISA. Revisión individual de las
reglas afectadas y de **todos los hunks del diff**, con segunda revisión independiente.
Los documentos normativos breves y el nuevo contrato se leen completos. En los
archivos extensos de historia/handoffs se revisan su entrada, reglas operativas y
cambios propuestos; no se reauditan miles de líneas de evidencia de producto.
Este inventario no certifica los estados técnicos de esos cuerpos históricos.
No se hace un reemplazo global de Linear ni de ISA: son también procedencia y
campos persistidos que deben conservarse. Cada archivo cambiado figura abajo.

## Cambios por archivo

Rutas relativas a la raíz Git. Los enlaces se resuelven desde este inventario.

| Documento o plantilla | Revisión y disposición |
|---|---|
| [.github/CODEOWNERS](../../../.github/CODEOWNERS) | Añade propietario a AGENTS raíz y documentos de autoridad del corte; no activa reglas remotas ni certifica enforcement. |
| [.github/ISSUE_TEMPLATE/roadmap-not-required.yml](../../../.github/ISSUE_TEMPLATE/roadmap-not-required.yml) | Aviso visible de congelación y preparación; campos y labels de validación intactos. |
| [.github/ISSUE_TEMPLATE/roadmap-required.yml](../../../.github/ISSUE_TEMPLATE/roadmap-required.yml) | Aviso visible de congelación y preparación; campos y labels de validación intactos. |
| [.github/PULL_REQUEST_TEMPLATE.md](../../../.github/PULL_REQUEST_TEMPLATE.md) | Enruta plantilla a preparación; no presenta un enlace Notion como autoridad ya aceptada por CI. |
| [AGENTS.md](../../../AGENTS.md) | Nueva entrada raíz: exige leer reglas v2, fase del corte y expediente canónico. |
| [README.md](../../../README.md) | Entrada de desarrollo enlazada al contrato actual; sin reescribir catálogo ni contenido técnico antiguo. |
| [docs/engineer/INDEX.md](../../../docs/engineer/INDEX.md) | Cabecera histórica y enlace de autoridad; conserva el cuerpo fechado, no lo convierte en instrucciones actuales. |
| [docs/engineer/README.md](../../../docs/engineer/README.md) | Cabecera histórica y enlace de autoridad; conserva el cuerpo fechado, no lo convierte en instrucciones actuales. |
| [docs/engineer/agent-workflow.md](../../../docs/engineer/agent-workflow.md) | Cabecera histórica y enlace de autoridad; conserva el cuerpo fechado, no lo convierte en instrucciones actuales. |
| [docs/proyecto/10-WORKFLOW-DESARROLLO.md](../../../docs/proyecto/10-WORKFLOW-DESARROLLO.md) | Cabecera histórica y enlace de autoridad; conserva el cuerpo fechado, no lo convierte en instrucciones actuales. |
| [docs/proyecto/PROMPT-ORQUESTADOR.md](../../../docs/proyecto/PROMPT-ORQUESTADOR.md) | Cabecera histórica y enlace de autoridad; conserva el cuerpo fechado, no lo convierte en instrucciones actuales. Guardia también dentro del bloque copiable. |
| [docs/proyecto/README.md](../../../docs/proyecto/README.md) | Cabecera histórica y enlace de autoridad; conserva el cuerpo fechado, no lo convierte en instrucciones actuales. |
| [vantare-repository-context.md](../../../vantare-repository-context.md) | Cabecera histórica y enlace de autoridad; conserva el cuerpo fechado, no lo convierte en instrucciones actuales. |
| [vantare-v2/AGENTS.md](../../AGENTS.md) | Autoridad por fase; lote congelado; IDs históricos separados; no exigir issue espejo tras activar. |
| [vantare-v2/README.md](../../README.md) | Entrada de desarrollo enlazada al contrato actual; sin reescribir catálogo ni contenido técnico antiguo. |
| [vantare-v2/docs/README.md](../README.md) | Lectura obligatoria del corte y expediente; corrige clasificación del índice viejo de release. |
| [vantare-v2/docs/agent-workflow.md](../agent-workflow.md) | Acota reglas GitHub a preparación; elimina sustitución global e incorrecta de IDs Linear. |
| [vantare-v2/docs/branch-channels.md](../branch-channels.md) | Acota nombres ISA al soporte vigente; corrige la referencia activa a ramas Linear; topología intacta. |
| [vantare-v2/docs/calendar-weekly-hotfix/README.md](../calendar-weekly-hotfix/README.md) | Preflight por fase antes de ejecutar una actualización semanal. |
| [vantare-v2/docs/calendar-weekly-hotfix/weekly-update-prompt.md](../calendar-weekly-hotfix/weekly-update-prompt.md) | Guardia dentro del prompt copiable y referencia a tarea autoritativa. |
| [vantare-v2/docs/current-plan.md](../current-plan.md) | Cabecera histórica y enlace de autoridad; conserva el cuerpo fechado, no lo convierte en instrucciones actuales. |
| [vantare-v2/docs/documentation-inventory.md](../documentation-inventory.md) | Enlaza esta revisión individual y corrige precedencia del índice antiguo. |
| [vantare-v2/docs/master-feature-plan.md](../master-feature-plan.md) | Cabecera histórica y enlace de autoridad; conserva el cuerpo fechado, no lo convierte en instrucciones actuales. |
| [vantare-v2/docs/plan-beta-publica-y-lanzamiento.md](../plan-beta-publica-y-lanzamiento.md) | Gate Review e hitos pasarán a Notion; conserva propuestas de producto y requisitos de release. |
| [vantare-v2/docs/prompts/bugfix-template.md](../prompts/bugfix-template.md) | Guardia dentro del prompt: tarea real, fase, IDs separados y alcance del lote; conserva su método específico. |
| [vantare-v2/docs/prompts/miniplan-template.md](../prompts/miniplan-template.md) | Guardia dentro del prompt: tarea real, fase, IDs separados y alcance del lote; conserva su método específico. |
| [vantare-v2/docs/prompts/reviewer-template.md](../prompts/reviewer-template.md) | Guardia dentro del prompt: tarea real, fase, IDs separados y alcance del lote; conserva su método específico. |
| [vantare-v2/docs/prompts/worker-template.md](../prompts/worker-template.md) | Guardia dentro del prompt: tarea real, fase, IDs separados y alcance del lote; conserva su método específico. |
| [vantare-v2/docs/release-beta-operations-runbook.md](../release-beta-operations-runbook.md) | Enruta tracker/decisiones actuales; corrige fuente del digest: roadmap y fallback milestones GitHub. |
| [vantare-v2/docs/release-roadmap-execution-index.md](../release-roadmap-execution-index.md) | Cabecera histórica y enlace de autoridad; conserva el cuerpo fechado, no lo convierte en instrucciones actuales. |
| [vantare-v2/docs/roadmap-agent-guide.md](../roadmap-agent-guide.md) | Preflight de transición antes de editar roadmap; no cambia semántica del parser. |
| [vantare-v2/docs/roadmap-execution-board.md](../roadmap-execution-board.md) | Cabecera histórica y enlace de autoridad; conserva el cuerpo fechado, no lo convierte en instrucciones actuales. |
| [vantare-v2/docs/roadmap-maintenance.md](../roadmap-maintenance.md) | Autoridad de ejecución por fase; conserva plan editorial y JSON generado. |
| [vantare-v2/docs/roadmap/plan.md](../roadmap/plan.md) | Añade solo milestones:development-continuity como plan; no declara migración entregada. |
| [vantare-v2/docs/roadmap/roadmap.json](../roadmap/roadmap.json) | Regenerado con herramienta existente desde base nightly; no editado a mano. |
| [vantare-v2/docs/runbooks/testing-center-candidate-feedback.md](../runbooks/testing-center-candidate-feedback.md) | Marca instrucciones Linear como históricas; preserva contratos técnicos/privacidad y no activa adaptador Notion. |
| [vantare-v2/docs/runbooks/testing-center-codex-human-handoff.md](../runbooks/testing-center-codex-human-handoff.md) | Marca instrucciones Linear como históricas; preserva contratos técnicos/privacidad y no activa adaptador Notion. |
| [vantare-v2/docs/runbooks/testing-center-posthog-privacy.md](../runbooks/testing-center-posthog-privacy.md) | Marca instrucciones Linear como históricas; preserva contratos técnicos/privacidad y no activa adaptador Notion. |
| [vantare-v2/docs/runbooks/testing-center-triage-outbox.md](../runbooks/testing-center-triage-outbox.md) | Marca instrucciones Linear como históricas; preserva contratos técnicos/privacidad y no activa adaptador Notion. |
| [vantare-v2/docs/superpowers/skills/roadmap-management/SKILL.md](../superpowers/skills/roadmap-management/SKILL.md) | Enruta skill reutilizable al contrato por fases; mantiene controles editoriales. |
| [vantare-v2/docs/telemetry-core/README.md](../telemetry-core/README.md) | Retira autoridad operativa Linear; conserva contratos técnicos y estados fechados con alcance explícito. |
| [vantare-v2/docs/vantare-program/README.md](README.md) | Precedencia del tracker por fase, lectura obligatoria, captura de hallazgos y nuevos documentos. |
| [vantare-v2/docs/vantare-program/execution-policy.md](execution-policy.md) | Acota contrato GitHub al lote/preparación; preserva autonomía y autorizaciones. |
| [vantare-v2/docs/vantare-program/handoff-template.md](handoff-template.md) | Añade tarea autoritativa, IDs separados y único sucesor operativo Notion después del corte. |
| [vantare-v2/docs/vantare-program/handoffs/engineer-spotter.md](handoffs/engineer-spotter.md) | Ruta compartida a transición; las entradas cronológicas no se reinterpretan como estado remoto actual. Retira proyecto Linear de lectura operativa. |
| [vantare-v2/docs/vantare-program/handoffs/overlays-launcher-hub.md](handoffs/overlays-launcher-hub.md) | Ruta compartida a transición; las entradas cronológicas no se reinterpretan como estado remoto actual. |
| [vantare-v2/docs/vantare-program/handoffs/platform-commercial.md](handoffs/platform-commercial.md) | Ruta compartida a transición; las entradas cronológicas no se reinterpretan como estado remoto actual. Nueva continuidad de #1189, alcance entregado y siguiente trabajo. |
| [vantare-v2/docs/vantare-program/handoffs/strategy-planner.md](handoffs/strategy-planner.md) | Ruta compartida a transición; las entradas cronológicas no se reinterpretan como estado remoto actual. |
| [vantare-v2/docs/vantare-program/handoffs/telemetry-analysis.md](handoffs/telemetry-analysis.md) | Ruta compartida a transición; las entradas cronológicas no se reinterpretan como estado remoto actual. Retira proyecto Linear de lectura operativa. |
| [vantare-v2/docs/vantare-program/handoffs/telemetry-core.md](handoffs/telemetry-core.md) | Ruta compartida a transición; las entradas cronológicas no se reinterpretan como estado remoto actual. |
| [vantare-v2/docs/vantare-program/handoffs/testing-center.md](handoffs/testing-center.md) | Ruta compartida a transición; las entradas cronológicas no se reinterpretan como estado remoto actual. |
| [vantare-v2/docs/vantare-program/notion-document-audit.md](notion-document-audit.md) | Este inventario individual, alcance de revisión y controles pendientes. |
| [vantare-v2/docs/vantare-program/notion-transition.md](notion-transition.md) | Contrato completo: estado único, lote, destinos reales, importación, cortes técnicos y recuperación. |
| [vantare-v2/docs/vantare-program/project-map.md](project-map.md) | Distingue mapa arquitectónico de tablas históricas de agosto; no inventa estados nuevos. |
| [vantare-v2/docs/vantare-program/research-policy.md](research-policy.md) | Hallazgos nuevos a Notion pendiente según fase, sin implementar fuera del lote. |

## Revisados y conservados sin modificación

| Archivo | Motivo |
|---|---|
| `.github/ISSUE_TEMPLATE/config.yml` | Mantener formularios actuales hasta sustituir entrada; `blank_issues_enabled: false` no se cambia. |
| `vantare-v2/docs/adr/0007-testing-center-linear-operational-authority.md` | Ya marcado deprecado; conservar la decisión histórica, sin reactivar Linear. |
| `vantare-v2/docs/runbooks/testing-center-linear-contracts.md` | Ya deprecado; campos técnicos y referencias históricas intactos. |
| `vantare-v2/docs/runbooks/testing-center-linear-outbox.md` | Ya deprecado; no reimplementar una dependencia retirada. |
| `vantare-v2/docs/runbooks/testing-center-linear-webhook.md` | Ya deprecado; conservar contratos como evidencia. |
| `vantare-v2/docs/runbooks/testing-center-linear-pilot.md` | Ya deprecado; el piloto histórico no autoriza activar servicios. |
| `vantare-v2/docs/runbooks/testing-center-ui.md` | Contrato técnico/local fechado; no sustituir sus IDs por nombres de Notion. |
| `vantare-v2/docs/runbooks/testing-center-github-delivery.md` | Contrato técnico de entrega existente; la mención a Linear limita datos privados, no prescribe reactivación. |

Los demás planes, ADR, análisis, changelogs y evidencias fechados permanecen como
fuentes de contexto. La guardia raíz y los índices de entrada establecen su
precedencia; no se modifican decisiones técnicas ajenas a la transición.

## Controles que deben adaptarse antes de ACTIVO

Estas superficies se inspeccionaron para descubrir dependencias. Su comportamiento
ejecutable **no se modifica ni se deshabilita en #1189**; las plantillas reciben
avisos y CODEOWNERS amplía cobertura documental, como detalla la tabla anterior.
El futuro corte técnico debe leer los controles íntegramente,
fijar diseño, probarlo y mantener compatibilidad con el histórico.

| Superficie exacta | Dependencia actual y condición de sustitución |
|---|---|
| `.github/scripts/validate_branch_channels.py`, `.github/scripts/test_validate_branch_channels.py` | Regex de ramas ISA/hotfix. Probar identidad Notion sin colisiones y conservar nightly → testers → master. |
| `.github/scripts/validate_roadmap_contract.py`, `.github/scripts/tests/test_validate_roadmap_contract.py` | Consulta issue GitHub viva derivada de rama; exige abierta, secciones, label única y tokens exactos. Sustituir por autoridad Notion verificable y fresca, no por texto libre en PR. |
| `.github/workflows/branch-channel-gates.yml` | Consume eventos/credenciales GitHub y ejecuta ambos validadores. Su modo audit no concede permiso para eludir el contrato. No exponer credenciales a código de PR. |
| `vantare-v2/docs/changelog/fragments/schema.json`, `.github/scripts/discord_communications.py`, `.github/scripts/release_notes.py` | IDs de fragmento/manifiesto ISA y TC. Añadir nueva identidad con pruebas de parsing, orden y compatibilidad; no renumerar archivos históricos. |
| `.github/scripts/tests/test_discord_communications.py`, `.github/scripts/tests/test_release_notes.py` | Regresiones de metadatos y publicaciones para el corte anterior. Extender a Notion sin perder checks actuales. |
| `.github/scripts/discord_communications.py`, `.github/workflows/discord-development-v2.yml` | Progreso editorial y fallback de milestones GitHub. Evitar que archivo histórico se anuncie como progreso actual tras el corte. |
| `vantare-v2/tools/testing-center-codex-preflight.mjs` | Convención ISA y origen de tarea; inventariar compatibilidad, sin activar automatización. |
| `supabase/functions/_shared/testing-center-codex-dossier.ts`, `supabase/functions/_shared/testing-center-codex-human-handoff.ts`, `supabase/functions/_shared/testing-center-rejection.ts` | Identidad/custodia técnica de reportes. Migrar solo mediante corte específico si es necesario; no cambiar campos persistidos o permisos por reemplazo textual. |
| `.github/ISSUE_TEMPLATE/config.yml`, `.github/ISSUE_TEMPLATE/roadmap-required.yml`, `.github/ISSUE_TEMPLATE/roadmap-not-required.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS` | Comprobar cobertura de `/AGENTS.md` y de `notion-transition.md`/`notion-document-audit.md` además de las reglas previas. La interfaz GitHub obtiene plantillas de la rama predeterminada master. Merge a nightly permite a agentes leer las nuevas reglas; no demuestra que la UI pública ni rulesets hayan cambiado. No promover master sin autorización. |

Notion necesita completar esquema de dependencias/procedencia, vistas y acceso
real de agentes. La conexión actual permite páginas/bases, pero no prueba una
integración GitHub Workspace instalada ni que CI tenga un acceso Notion confiable.
No solicitar planes de pago ni credenciales por suposición: comprobar primero el
circuito mínimo y pedir solo la acción concreta que resulte imprescindible.

## Verificación de esta entrega

- Parser/digest existente: 23 tests PASS.
- Contrato roadmap existente: 21 tests PASS.
- Revisar enlaces nuevos locales, JSON generado, igualdad de IDs declarados y
  cambio semántico real; registrar resultado final en la PR de #1189.
- No cambia código de aplicación ni comportamiento de workflows. La CI remota
  ejecuta sus gates normales; no se omiten ni se cambian tests para este merge.
- El estado de merge/CI está en la PR y SHA remoto, no en una afirmación estática
  dentro de un documento comprometido antes de integrarse.
