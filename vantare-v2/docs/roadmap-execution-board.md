# Roadmap Execution Board

Tablero operativo para ejecutar el roadmap por minifases y miniplanes.

Este documento esta pensado para que otro modelo pueda orquestar el desarrollo sin depender del contexto de este chat.

Vantare debe tratarse como suite local. Overlays Studio e Ingeniero son modulos internos del mismo producto.

> Actualizacion 2026-06-26: para el release oficial, la fuente operativa principal es `docs/release-roadmap-execution-index.md`. Las tablas `0.1.X.X` a `0.9.X.X` de este documento se conservan como historial y contexto, pero no deben usarse para descartar features de release como pagos/licencias, autoupdater, multisimulador, OBS LAN, calendario LMU, Track Map o Input Telemetry/Trace.

## Release execution board actual

| ID | Plan | Estado | Reviewer obligatorio | Manual |
|---|---|---|---|---|
| R01 | Beta baseline, recomendados y presets | Ready | GLM | Si |
| R02 | Stripe, Supabase, auth y licencias | Planned | GLM + security review | Si |
| R03 | Autoupdater y distribucion | Planned | GLM | Si |
| R04 | Preview avanzada y LayoutStudio profesional | Planned | GLM + Isaac | Si |
| R05 | Data reliability matrix | Planned | GLM | No |
| R06 | iRacing y Assetto Corsa como simuladores | Planned | GLM | Si |
| R07 | Assetto Corsa Lua/CSP Overlay Pack | Planned | GLM | Si |
| R08 | Layouts por sesion y visibilidad condicional | Planned | GLM | Si |
| R09 | Widget pack y data blocks | Planned | GLM | Si |
| R10 | Multiclase, headers y standings release | Planned | GLM | Si |
| R11 | Engineer radio overlay y calendario Discord | Planned | GLM | Si |
| R12 | OBS y streaming | Planned | GLM | Si |
| R13 | UX, onboarding, i18n y design system | Planned | GLM + Minimax | Si |
| R14 | Docs, soporte, legal y release candidate prep | Planned | GLM | Si |
| R15 | Seguridad, code review y refactors profundos | Planned | GLM + security review | Si |

Regla: R15 se ejecuta antes de aceptar la RC final. R14 prepara la RC; R15 decide si se publica o vuelve a fixes.

## Regla principal

El agente principal de este hilo debe actuar como orquestador/reviewer por defecto.

No debe editar codigo salvo que:

- sea estrictamente necesario para desbloquear el trabajo;
- sea un fix muy pequeno y mas barato que crear un worker;
- el usuario lo pida explicitamente;
- la edicion sea documental o de planificacion.

La implementacion normal debe ir a workers.

## Como usar este tablero

1. Leer `AGENTS.md`.
2. Leer `docs/current-plan.md`.
3. Leer `docs/master-feature-plan.md`.
4. Leer `docs/vantare-suite-architecture.md` si la tarea toca limites entre Overlays, Ingeniero, telemetria, OBS o runtime.
5. Elegir la primera fila con estado `Next`.
6. Crear un miniplan en `docs/superpowers/plans/YYYY-MM-DD-<id>-<slug>.md`.
7. Crear prompt para worker con alcance cerrado.
8. Worker implementa.
9. Reviewer audita.
10. Corregir P0/P1/P2.
11. Ejecutar verificacion manual si aplica.
12. Actualizar este tablero y `docs/current-plan.md`.
13. Cuando una version funcional quede confirmada, hacer commit, push y tag Git antes de iniciar la siguiente version funcional.

Si la tarea toca Go, el prompt debe exigir estas skills:

- `golang-error-handling`;
- `golang-testing`;
- `golang-code-style`;
- `golang-concurrency` y `golang-context` si hay lifecycle, goroutines, SSE, loops o cancelacion;
- `golang-safety` si hay filesystem, I/O, procesos, config o datos externos.

## Estados

- `Done`: cerrado con review/verificacion.
- `In progress`: worker activo o pendiente de review.
- `Next`: siguiente trabajo recomendado.
- `Ready`: preparado para ejecutar despues de dependencias.
- `Blocked`: falta decision o informacion.
- `Later`: fuera de fase activa.

## Modelos recomendados

- `Deepseek V4 Flash`: inventarios, documentacion, grep, tareas mecanicas, checks simples.
- `Kimi K2.7`: backend medio, frontend medio, integraciones acotadas.
- `Minimax M3`: frontend visual, UI, rework de Overlays Studio, previews.
- `GLM 5.2`: backend duro, schema, persistencia, arquitectura, reviews criticas.
- `Gemini 3.5 Flash`: analisis rapido, segunda opinion, tareas largas de lectura con prompt cerrado.

## Fase 0.1.X.X - Cierre foundation

| ID | Version | Minifase | Estado | Modelo worker | Reviewer | Depende de | Manual |
|---|---:|---|---|---|---|---|---|
| 0.1.1 | 0.1.X.X | Ordenar documentacion viva | Done | Codex/orquestador | Codex | Ninguna | No |
| 0.1.2 | 0.1.X.X | Documentar preview bugs y arquitectura sandbox | Done | Workers + Codex | Codex/GLM | Relative preview | Si |
| 0.1.3 | 0.1.X.X | Confirmar que no quedan regresiones criticas de preview | Done | Usuario + Codex | Codex | 0.1.2 | Si |

## Fase 0.2.X.X - Alpha privada: producto usable

| ID | Version | Minifase | Estado | Modelo worker | Reviewer | Depende de | Manual |
|---|---:|---|---|---|---|---|---|
| A1 | 0.2.1.X | Verificar separacion WidgetStudio/LayoutStudio | Done | Deepseek V4 Flash | Kimi o Codex | 0.1.3 | Si |
| A2 | 0.2.2.X | Inventario LayoutStudio drag/resize/save | Done | Deepseek V4 Flash | Kimi o Codex | A1 | Si |
| A3 | 0.2.3.X | Implementar/fijar LayoutStudio drag/resize si falta | Done | Kimi K2.7 | GLM o Codex | A2 | Si |
| A4 | 0.2.4.X | Recomendado -> copia editable: inventario | Done | Deepseek V4 Flash | Codex | A1 | Si |
| A5 | 0.2.5.X | Recomendado -> copia editable: implementacion/fixes | Done | Kimi K2.7 | GLM o Codex | A4 | Si |
| A6 | 0.2.6.X | Mock/live/demo UX: inventario | Done | Deepseek V4 Flash | Codex | A1 | Si |
| A7 | 0.2.7.X | Mock/live/demo UX: implementacion/fixes | Done | Deepseek V4 Flash | Codex | A6 | Si |
| A8 | 0.2.8.X | Checklist alpha privada | Done | Deepseek V4 Flash | Codex | A3, A5, A7 | Si |

## Fase 0.3.X.X - Alpha privada: UI y widgets core

| ID | Version | Minifase | Estado | Modelo worker | Reviewer | Depende de | Manual |
|---|---:|---|---|---|---|---|---|
| S1 | 0.3.1.X | Standings inventario tecnico | Done | Deepseek V4 Flash | Codex | A1 | No |
| S2 | 0.3.2.X | Standings catalogo/metricas/columnas | Done | Kimi K2.7 | GLM | S1 | No |
| S3 | 0.3.3.X | Standings variantes y persistencia frontend | Done | Kimi K2.7 | GLM | S2 | No |
| S4 | 0.3.4.X | Standings render configurable en preview/desktop/OBS | Done | Kimi K2.7 | GLM | S3 | Si |
| S4.5 | 0.3.4.X | Mock scenarios practica/qualy/carrera para preview | Done | Kimi K2.7 | GLM | S4 | Si |
| S4.6 | 0.3.4.X | Guardado explicito en WidgetStudio sin autosave | Done | Kimi K2.7 | GLM | S4.5 | Si |
| S5 | 0.3.5.X | Standings UI en WidgetStudio | Done | Minimax M3 | GLM | S4.6 | Si |
| S6 | 0.3.6.1 | Standings verificacion completa y docs | Done | Deepseek V4 Flash | GLM | S5 | Si |
| UI1 | 0.3.7.X | Leer HTML referencia y extraer decisiones visuales | Done | Minimax M3 | Codex | A1 | No |
| UI2 | 0.3.8.X | WidgetStudio Visual Rework | Done | Minimax M3 | GLM + Isaac | UI1 | Si |
| PREVIEW2 | 0.3.9.0 | Intrinsic width contract en WidgetStudio preview | Done | GLM 5.2 + Kimi K2.7 | GLM + Isaac | UI2 | Si |
| UI3 | 0.3.10.X | Polish visual final de WidgetStudio | Later | Minimax M3 | Codex | Features core | Si |
| REL1 | 0.3.11.X | Changelog publico y publicacion Discord por version | Ready | Kimi K2.7 | GLM o Codex | UI3 | Si |
| UI4 | 0.3.12.X | Verificacion alpha privada completa | Later | Usuario + Codex | Codex | UI3, REL1, A8 | Si |

## Modulo Ingeniero - Suite foundation

| ID | Version | Minifase | Estado | Modelo worker | Reviewer | Depende de | Manual |
|---|---:|---|---|---|---|---|---|
| EN0 | 0.3.13.X | Inventario integracion Vantare-Ingeniero-Go | Done | Gemini/Kimi | GLM | Suite decision | No |
| EN1 | 0.3.13.X | Import core determinista bajo `internal/engineer` | Done | Gemini/Kimi | GLM | EN0 | No |
| EN2 | 0.3.13.X | EngineerService + bridge Wails defensivo | Done | Gemini/Kimi | GLM | EN1 | No |
| EN3 | 0.3.13.X | Pagina Hub Ingeniero | Done | Gemini/Kimi | GLM | EN2 | Si |
| EN4 | 0.3.13.X | Bus notificaciones Wails + SSE `/engineer/stream` | Done | Gemini/Kimi | GLM | EN2 | Si |
| EN5 | 0.3.13.X | Widget `engineer-notifications` en overlays | Done | Gemini/Kimi | GLM | EN4 | Si |
| EN6 | 0.3.14.X | LMU live adapter reutilizando fuente/buffer de overlays | Ready | GLM 5.2 | GLM | EN0-EN5 | Si |

Nota operativa: EN6 queda aparcado mientras no se pueda probar live. Se puede continuar con la seccion Overlays sin bloquear la suite.

## Fase 0.4.X.X - Beta privada testers: distribucion y uso real

| ID | Version | Minifase | Estado | Modelo worker | Reviewer | Depende de | Manual |
|---|---:|---|---|---|---|---|---|
| B1 | 0.4.1.X | Build compartible e instrucciones | Done | Deepseek V4 Flash | Codex | A8 | Si |
| B2 | 0.4.2.X | Known issues y canal feedback | Done | Deepseek V4 Flash | Codex | B1 | No |
| B3 | 0.4.3.X | OBS setup local sencillo | Done | Kimi K2.7 | Codex | B1 | Si |
| B4 | 0.4.4.X | Hotkeys basicas | Done | GLM 5.2 | Codex | B1 | Si |
| B5 | 0.4.5.X | Delta best live inventario | Done | GLM 5.2 | Codex | B1 | Si |
| B6 | 0.4.6.X | Delta best live implementacion | Done | GLM 5.2 | Codex | B5 | Si |

## Fase 0.5.X.X - Beta privada testers: core LMU completo

| ID | Version | Minifase | Estado | Modelo worker | Reviewer | Depende de | Manual |
|---|---:|---|---|---|---|---|---|
| P1 | 0.5.1.X | Pedals inventario datos/diseño actual | Done | Gemini 3.5 Flash | Codex | B6 | No |
| P2 | 0.5.2.X | Pedals nuevo diseño pequeño | Done | Minimax M3 | Codex | P1 | Si |
| P3 | 0.5.3.X | Pedals throttle/brake/clutch render | Done | Kimi K2.7 | Codex | P2 | Si |
| P4 | 0.5.4.X | Pedals configuracion visual basica | Done | Gemini 3.5 Flash | Codex | P3 | Si |
| P5 | 0.5.5.X | Recomendados beta pulidos | Later | Minimax M3 | Codex | P4 | Si |
| P6 | 0.5.6.X | Widget Preset Gallery | Planned | Kimi K2.7 / Minimax M3 | GLM | P5 | Si |
| P7 | 0.5.7.X | Smoke test beta privada | Later | Usuario + Codex | Codex | P6 | Si |

## Fase 0.6.X.X - Beta publica de pago: acceso y pago

| ID | Version | Minifase | Estado | Modelo worker | Reviewer | Depende de | Manual |
|---|---:|---|---|---|---|---|---|
| PAY1 | 0.6.1.X | Decision acceso/licencia | Later | GLM 5.2 | Codex | P7 | No |
| PAY2 | 0.6.2.X | Stripe/checkout externo plan tecnico | Later | GLM 5.2 | Codex | PAY1 | No |
| PAY3 | 0.6.3.X | Integracion acceso beta | Later | GLM 5.2 | Codex | PAY2 | Si |
| PAY4 | 0.6.4.X | Descarga, changelog y soporte | Later | Kimi K2.7 | Codex | PAY3 | Si |

## Fase 0.7.X.X - Beta publica de pago: polish y layouts

| ID | Version | Minifase | Estado | Modelo worker | Reviewer | Depende de | Manual |
|---|---:|---|---|---|---|---|---|
| L1 | 0.7.1.X | Layouts por sesion manuales inventario | Later | Deepseek V4 Flash | Codex | PAY4 | No |
| L2 | 0.7.2.X | Selector/duplicar layout general | Later | Kimi K2.7 | GLM | L1 | Si |
| L3 | 0.7.3.X | Fallback general y persistencia | Later | GLM 5.2 | Codex | L2 | Si |
| L4 | 0.7.4.X | Auto-switch por sesion | Later | GLM 5.2 | Codex | L3 | Si |

## Fase 0.8.X.X - Beta publica de pago: data blocks y OBS avanzado

| ID | Version | Minifase | Estado | Modelo worker | Reviewer | Depende de | Manual |
|---|---:|---|---|---|---|---|---|
| D1 | 0.8.1.X | Inventario datos fuel/tire/stint/damage/onboard | Later | GLM 5.2 | Codex | L4 | No |
| D2 | 0.8.2.X | Fuel/energy saver widget | Later | Kimi K2.7 | Codex | D1 | Si |
| D3 | 0.8.3.X | Tire wear si dato fiable | Later | Kimi K2.7 | Codex | D1 | Si |
| D4 | 0.8.4.X | Stint timer | Later | Kimi K2.7 | Codex | D1 | Si |
| OBSLAN | 0.8.5.X | OBS LAN/doble PC investigacion | Later | GLM 5.2 | Codex | D1 | Si |

## Fase 0.9.X.X - Release candidate

| ID | Version | Minifase | Estado | Modelo worker | Reviewer | Depende de | Manual |
|---|---:|---|---|---|---|---|---|
| RC1 | 0.9.1.X | Performance audit | Later | GLM 5.2 | Codex | OBSLAN | Si |
| RC2 | 0.9.2.X | Regression visual/browser harness | Later | Minimax M3 or GLM | Codex | RC1 | Si |
| RC3 | 0.9.3.X | Instalador/update hardening | Later | GLM 5.2 | Codex | RC2 | Si |
| RC4 | 0.9.4.X | Docs usuario y release notes | Later | Deepseek V4 Flash | Codex | RC3 | No |
| RC5 | 0.9.5.X | Release candidate smoke test | Later | Usuario + Codex | Codex | RC4 | Si |

## Plantilla de prompt worker

```markdown
Actua como worker para Vantare Overlays Studio.

Tarea: [ID] [titulo]
Version objetivo: [version]
Tipo: [inventario/documentacion/bugfix/feature/refactor]
Modelo asignado: [modelo]

Lee obligatoriamente:
- AGENTS.md
- docs/current-plan.md
- docs/master-feature-plan.md
- docs/roadmap-execution-board.md
- docs/vantare-suite-architecture.md si toca Ingeniero, telemetria, OBS, runtime o limites entre modulos
- [docs especificos de la tarea]

Alcance:
- [alcance exacto]

No tocar:
- [archivos/carpetas prohibidas]

Requisitos:
- cambios pequenos;
- TDD si cambia comportamiento;
- no dependencias nuevas;
- no commits ni staging salvo instruccion explicita;
- parar si aparece contradiccion o hace falta tocar mas scope.

Si toca Go:
- aplicar `golang-error-handling`, `golang-testing` y `golang-code-style`;
- aplicar `golang-concurrency` y `golang-context` si hay goroutines, SSE, loops, lifecycle o cancelacion;
- aplicar `golang-safety` si hay filesystem, I/O, procesos, config o datos externos.

Checks esperados:
- [comandos]

Reporte final en espanol:
- archivos modificados/creados;
- checks ejecutados;
- checks no ejecutados y motivo;
- riesgos;
- verificacion manual.
```

## Plantilla de prompt reviewer

```markdown
Actua como reviewer adversarial para Vantare Overlays Studio.

Review de tarea: [ID] [titulo]

Lee:
- AGENTS.md
- docs/current-plan.md
- docs/master-feature-plan.md
- docs/roadmap-execution-board.md
- diff del worker
- reporte del worker

No edites codigo.

Busca:
- P0/P1/P2/P3;
- cambios fuera de alcance;
- bugs funcionales;
- tests debiles;
- responsabilidades mezcladas;
- riesgos para usuario no tecnico;
- contradicciones con docs.

Devuelve:
- Findings ordenados por severidad;
- archivos/lineas;
- checks que recomiendas;
- si se puede aceptar o hay que corregir.
```

## Reglas de paralelizacion

Se puede paralelizar si:

- no tocan los mismos archivos;
- no dependen del mismo contrato inestable;
- cada worker tiene checks independientes;
- el orquestador puede reviewar antes de fusionar mentalmente los resultados.

No paralelizar:

- dos cambios en `WidgetStudio` a la vez;
- dos cambios de schema/persistencia;
- rework UI con cambios funcionales de widgets;
- `Standings` render y `Standings` persistencia sin contrato cerrado.

## Regla de cierre por version

Cuando el usuario confirme una version funcional o minifase ejecutable:

1. Actualizar `docs/current-plan.md` y `docs/roadmap-execution-board.md`.
2. Ejecutar checks proporcionales al tipo de cambio.
3. Hacer commit con scope claro.
4. Hacer push de la rama activa.
5. Crear y pushear tag Git `vX.X.X.X` solo si la version cierra feature, fix funcional, build/runtime o checkpoint ejecutable.

Las tareas puramente documentales, analisis, planes y reviews no crean version/tag por si solas. Pueden ir en commit normal sin bump ni tag.

La version visible de la app solo se actualiza cuando el checkpoint representa build/runtime publicable.

## REL1 - Changelog publico y Discord

Objetivo: preparar un flujo sencillo para que cada version funcional confirmada pueda anunciarse en el Discord oficial sin publicar ruido interno.

Alcance:

- Crear o consolidar `docs/changelog.md` como changelog publico orientado a testers/usuarios, y seguir el [Runbook de Operaciones de Release/Beta](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/docs/release-beta-operations-runbook.md) para el despliegue.
- Definir formato corto para Discord: nuevo, mejorado, corregido, notas para testers.
- Anadir checklist de release: actualizar changelog antes de commit/tag de version funcional.
- Preparar plan para webhook de Discord usando secreto externo, por ejemplo `DISCORD_WEBHOOK_URL`.
- Opcional si se aprueba en la tarea: GitHub Action que publique en Discord al pushear tags `v*`.
- Documentar que planes, analisis, reviews y docs-only no se publican como version nueva.

No alcance:

- No crear ni exponer secretos reales.
- No publicar automaticamente commits sueltos.
- No cambiar version runtime/build salvo que REL1 se cierre junto a una version funcional real.
- No mezclar con UI3 ni con la verificacion alpha privada.

## Proxima accion

Checkpoint funcional `v0.3.10.0` ya cerró la base de beta privada B1-B6. Después de ese checkpoint se completaron `P1`, `P2` y `P3` de Pedals: inventario, plan de diseño pequeño y render compacto `CLT/BRK/THR`.

El próximo paso operativo es `P5 - Recomendados beta pulidos`, salvo que se priorice antes una review GLM final de cierre del lote de workers o REL1.

Checklist manual pendiente para Isaac antes de distribuir:
1. Smoke manual (ver `docs/alpha-private-checklist.md` seccion Smoke test manual recomendado).
2. Confirmar que el .exe no está firmado (Windows Defender puede bloquearlo).
3. Decidir canal de feedback (Discord DM/hilo/formulario).
4. Comprimir y enviar `bin/vantare.exe` a testers.
