# Roadmap Execution Board

Tablero operativo para ejecutar el roadmap por minifases y miniplanes.

Este documento esta pensado para que otro modelo pueda orquestar el desarrollo sin depender del contexto de este chat.

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
4. Elegir la primera fila con estado `Next`.
5. Crear un miniplan en `docs/superpowers/plans/YYYY-MM-DD-<id>-<slug>.md`.
6. Crear prompt para worker con alcance cerrado.
7. Worker implementa.
8. Reviewer audita.
9. Corregir P0/P1/P2.
10. Ejecutar verificacion manual si aplica.
11. Actualizar este tablero y `docs/current-plan.md`.

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
| A2 | 0.2.2.X | Inventario LayoutStudio drag/resize/save | Ready | Deepseek V4 Flash | Kimi o Codex | A1 | Si |
| A3 | 0.2.3.X | Implementar/fijar LayoutStudio drag/resize si falta | Ready | Minimax M3 o Kimi | GLM o Codex | A2 | Si |
| A4 | 0.2.4.X | Recomendado -> copia editable: inventario | Ready | Deepseek V4 Flash | Codex | A1 | Si |
| A5 | 0.2.5.X | Recomendado -> copia editable: implementacion/fixes | Ready | Kimi K2.7 | GLM o Codex | A4 | Si |
| A6 | 0.2.6.X | Mock/live/demo UX: inventario | Ready | Deepseek V4 Flash | Codex | A1 | Si |
| A7 | 0.2.7.X | Mock/live/demo UX: implementacion/fixes | Ready | Minimax M3 o Kimi | Codex | A6 | Si |
| A8 | 0.2.8.X | Checklist alpha privada | Ready | Deepseek V4 Flash | Codex | A3, A5, A7 | Si |

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
| S6 | 0.3.6.X | Standings verificacion completa y docs | Done | Deepseek V4 Flash | GLM | S5 | Si |
| UI1 | 0.3.7.X | Leer HTML referencia y extraer decisiones visuales | Next | Minimax M3 | Codex | A1 | No |
| UI2 | 0.3.8.X | Miniplan rework UI Overlays Studio | Ready | Minimax M3 | Codex | UI1 | No |
| UI3 | 0.3.9.X | Implementar rework UI en cortes pequenos | Ready | Minimax M3 | Codex | UI2, S6 | Si |
| UI4 | 0.3.10.X | Verificacion alpha privada completa | Ready | Usuario + Codex | Codex | UI3, A8 | Si |

## Fase 0.4.X.X - Beta privada testers: distribucion y uso real

| ID | Version | Minifase | Estado | Modelo worker | Reviewer | Depende de | Manual |
|---|---:|---|---|---|---|---|---|
| B1 | 0.4.1.X | Build compartible e instrucciones | Later | Kimi K2.7 | Codex | UI4 | Si |
| B2 | 0.4.2.X | Known issues y canal feedback | Later | Deepseek V4 Flash | Codex | B1 | No |
| B3 | 0.4.3.X | OBS setup local sencillo | Later | Kimi K2.7 | Codex | B1 | Si |
| B4 | 0.4.4.X | Hotkeys basicas | Later | GLM 5.2 | Codex | B1 | Si |
| B5 | 0.4.5.X | Delta best live inventario | Later | GLM 5.2 | Codex | B1 | Si |
| B6 | 0.4.6.X | Delta best live implementacion | Later | GLM 5.2 | Codex | B5 | Si |

## Fase 0.5.X.X - Beta privada testers: core LMU completo

| ID | Version | Minifase | Estado | Modelo worker | Reviewer | Depende de | Manual |
|---|---:|---|---|---|---|---|---|
| P1 | 0.5.1.X | Pedals inventario datos/diseño actual | Later | Deepseek V4 Flash | Codex | B6 | No |
| P2 | 0.5.2.X | Pedals nuevo diseño pequeño | Later | Minimax M3 | Codex | P1 | Si |
| P3 | 0.5.3.X | Pedals throttle/brake/clutch render | Later | Kimi K2.7 | Codex | P2 | Si |
| P4 | 0.5.4.X | Pedals configuracion visual basica | Later | Minimax M3 | Codex | P3 | Si |
| P5 | 0.5.5.X | Recomendados beta pulidos | Later | Minimax M3 | Codex | P4 | Si |
| P6 | 0.5.6.X | Smoke test beta privada | Later | Usuario + Codex | Codex | P5 | Si |

## Fase 0.6.X.X - Beta publica de pago: acceso y pago

| ID | Version | Minifase | Estado | Modelo worker | Reviewer | Depende de | Manual |
|---|---:|---|---|---|---|---|---|
| PAY1 | 0.6.1.X | Decision acceso/licencia | Later | GLM 5.2 | Codex | P6 | No |
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

## Proxima accion

S6 completado y verificado. Enviar a review adversarial con GLM. Proximo paso: `UI1 - Leer HTML referencia y extraer decisiones visuales` con worker Minimax M3.
