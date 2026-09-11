# Plan de etapas: beta pública, versiones iterativas y lanzamiento

Documento interno de planificación. Orquesta el camino de Vantare desde el
formato de desarrollo actual hasta la beta pública reiniciada, las versiones
iterativas dentro de la beta y la fase de lanzamiento estable.

> Decisión registrada el 2026-09-11 (Isaac): la beta pública será un **reinicio
> de la línea v0.1.0.0**. La línea actual `v0.1.x` es formato de desarrollo y la
> documentación pública se reinicia antes de la apertura.
>
> Estado: propuesta viva. Lo marcado como *pendiente de Isaac* no está decidido
> y no puede anunciarse en el roadmap público ni en Discord.

## Fuentes de verdad usadas

| Fuente | Qué aporta a este plan |
|---|---|
| `docs/vantare-program/product-contract.md` | Alcance de lanzamiento, licencias, privacidad, Polar como autoridad comercial |
| `docs/versioning-and-release-gates.md` | Rangos de versión `X.X.X.X` y gates de salida por rango |
| `docs/branch-channels.md` | Flujo `rama de issue -> nightly -> testers -> master` y acceso por rol |
| `docs/release-checklists.md` | Checklists operativas de alpha, beta testers, beta pública y release |
| `docs/release-beta-operations-runbook.md` | Procedimiento de release, tags, Discord y rollback |
| `docs/roadmap/plan.md` | Estado público vigente del roadmap |
| `docs/vantare-program/project-map.md` + handoffs | Estado operativo real de cada módulo |

## Estado real verificado (2026-09-11)

- `VERSION` del código: `0.1.0.7`. Builds publicadas hasta
  `v0.1.0.7-nightly.15` y `v0.1.0.7-testers.2`.
- `v0.1.0.0` se publicó como primera beta pública con login Google, gating
  free/paid/suite, perfiles recomendados y updater; `v0.1.0.1`/`v0.1.0.2`
  fueron hotfixes de Supabase/login.
- Canales en producción: `nightly` (Pro Plus), `testers` (Launch Edition) y
  `master` (estable, todos). La promoción la autoriza Isaac a mano.
- Módulos en construcción activa: Telemetry Core V2 (retirada V1 por fases
  R0-R5), Overlay Studio V3, editor in-place del overlay de escritorio,
  Calendario con lector Discord + revisión Owner, Engineer/Spotter (radio bus,
  familias, voz experimental), Strategy Planner sobre DuckDB, Launcher con
  cadenas, licencias con credencial offline.
- Billing: Polar es la autoridad decidida; estado **NO-GO** hasta cerrar la
  matriz monetaria y la reconciliación. Stripe queda en retirada.
- Programa de rendimiento abierto (ISA-1015): banco reproducible de huella
  junto a LMU ya en medición; la campaña de optimización del Hub Orbit tiene
  varios PR abiertos.

## Modelo de etapas, versiones y canales

El mapa reutiliza los rangos ya definidos en `versioning-and-release-gates.md`
y los gates ya escritos en `release-checklists.md`. Nada aquí inventa
versiones nuevas: cada etapa consume el rango que le corresponde.

| Etapa | Rango de versión | Canal dominante | Audiencia |
|---|---|---|---|
| 0. Desarrollo interno | `0.1.x` | `nightly` | Equipo + Pro Plus |
| 1. Insiders (pruebas cerradas) | `0.2.x` – `0.5.x` | `nightly` → `testers` | Pro Plus y Launch Edition |
| 2. Beta pública (reinicio) | `0.6.x` – `0.8.x` | `testers` → `master` | Público abierto |
| 3. Release candidate | `0.9.x` | `master` | Público |
| 4. Lanzamiento | `1.0.0.0` | tag en `master` | Público estable |
| 5. Post-lanzamiento | `1.x` | todos | Ecosistema |

Lectura clave: la beta pública **no reutiliza el tag `v0.1.0.0`** (los tags
publicados nunca se reasignan). El "reinicio de la 0.1.0.0" es un relanzamiento
del *producto público* sobre el rango `0.6.x`, no una reedición del tag.

## Etapa 0 — Desarrollo interno (`0.1.x`, en curso)

Objetivo: terminar la base técnica que hoy está a medio camino sin prometer
fechas ni cifras no medidas.

Contenido vigente (ya planificado, no nuevo):

- Telemetría V2: retirada completa de V1 (fases R0–R5), auditoría integral y
  optimización medida con el banco de huella.
- Overlay Studio V3 y editor in-place del overlay de escritorio.
- Calendario: validación conjunta, recordatorios, vigencia del horario.
- Engineer/Spotter: radio bus, familias de avisos, voz experimental acotada.
- Strategy Planner: motor sobre sesiones DuckDB reales.
- Licencias con credencial offline y arranque desde caché.
- Programa de huella de la base de la app (ISA-1015) y optimización del Hub.

Gate de salida hacia Etapa 1:

- Telemetría V2 es la única cadena productiva o el plan de retirada está
  cerrado con rollback demostrado.
- No hay P0/P1 abiertos en las superficies que tocan los insiders.
- El checkout `nightly` produce builds verificadas de forma rutinaria.

## Etapa 1 — Insiders: pruebas cerradas (`0.2.x` – `0.5.x`)

Objetivo: convertir el producto interno en algo que un tester externo instala
y usa sin asistencia. Corresponde a las antiguas "alpha privada" + "beta
privada de testers" del plan histórico, hoy materializadas en los canales
`nightly` y `testers`.

Subetapas (cada una es un corte de versión `feature`):

| Subetapa | Rango | Contenido | Gate |
|---|---|---|---|
| 1a. Producto usable | `0.2.x` | App arranca, overlay desktop funciona, perfiles guardan/cargan, mover/redimensionar, recomendado → copia editable, mock/live/demo claro | Un tester cercano completa el flujo real sin asistencia |
| 1b. Widgets core | `0.3.x` | `Relative` y `Standings` cerrados (salvo multiclase), rework UI acotado del Studio, sin regresiones críticas de preview | Relative/Standings configurables bastan para perfiles reales LMU |
| 1c. Distribución testers | `0.4.x` | Build compartible, instrucciones, known issues, canal de feedback, OBS local sencillo, hotkeys básicas o pospuestas explícitas, `deltaBest` live fiable o decisión documentada | Tester externo instala, abre overlay, usa recomendado, edita y reporta bugs |
| 1d. Cierre core LMU | `0.5.x` | `Pedals` beta v1, recomendados pulidos, smoke test completo | Sin P0/P1 abiertos; P2 documentados y aceptados |

Dependencias:

- Las subetapas son secuenciales; cada una hereda el gate anterior.
- El canal `testers` ya existe: lo que falta es que el *contenido* cumpla los
  gates, no la infraestructura.

Riesgos:

- `deltaBest` live sigue siendo la deuda funcional más antigua; si no cierra
  en 1c debe quedar decisión documentada, no arrastrada.
- Meter voz/engineer avanzado aquí diluye el cierre; va a la Etapa 2 o se
  marca experimental.

## Etapa 2 — Beta pública: el reinicio (`0.6.x` – `0.8.x`)

Objetivo: reabrir Vantare al público como beta real, con documentación
reiniciada, acceso/pago funcionando y un ciclo de versiones visibles. Es el
reemplazo honesto de lo que `v0.1.0.0` anunció antes de tiempo.

### 2.0 — Preparación del relanzamiento (`0.6.x`)

Debe cerrar (gate de apertura):

- **Reinicio de documentación pública**: guía de instalación, primeros pasos,
  known issues publicables y soporte reorganizados; las guías internas dejan
  de ser requisito para usar el producto. Detalle en §"Reinicio de
  documentación".
- **Billing Polar operativo**: matriz monetaria cerrada, reconciliación,
  trial de 7 días con recordatorio, un dispositivo activo reemplazable,
  credencial offline firmada hasta su expiración. Sin esto no hay venta
  pública (contrato de producto).
- **Instalación/update clara**: instalador verificado, canales
  stable/testers/nightly con acceso por rol, updater que valida entitlement
  antes de ofrecer builds no estables.
- **Producto**: `Relative`, `Standings`, `Pedals` estables; OBS y overlay
  desktop robustos; el producto no depende de asistencia manual para arrancar.
- **Soporte**: Discord + GitHub público + proceso de refund/feedback.

### 2.1 — Polish y layouts (`0.7.x`)

- Layouts por sesión manuales estables (fallback a `general`); auto-switch
  solo si lo manual está estable.
- Temas/densidad/opacidad maduros sin romper overlays existentes.
- Recomendados que funcionan con cambios de layout.

### 2.2 — Ampliación de valor (`0.8.x`)

- Data blocks incluidos solo con datos fiables (`stable`); lo experimental se
  etiqueta como tal y nunca como estable.
- OBS avanzado/LAN para doble PC solo si no rompe OBS local.
- Métricas experimentales nunca presentadas como stable.

No entra en la beta pública:

- Multisimulador estable (iRacing/AC quedan para después del lanzamiento o
  como experimental explícito).
- Community layouts / marketplace.
- Sync cloud completo de perfiles.
- Companion app.
- Telemetry uploads/replays de usuarios.

### Reinicio de documentación

La decisión de reinicio implica rehacer la superficie documental pública, no
los documentos internos de ingeniería:

| Documento público | Acción |
|---|---|
| Guía de instalación | Reescribir para instalador + canales actuales |
| Primeros pasos / onboarding | Crear (idioma, login, sim, perfil recomendado, checklist) |
| Known issues públicos | Rehacer desde `tester-known-issues.md` depurado |
| Guía OBS/streaming | Reescribir con el flujo actual de Browser Source |
| FAQ + soporte | Crear: refund, device-limit, canales, requisitos |
| Changelog público | Mantener `docs/changelog.md` como fuente de anuncios |
| Docs de usuario por módulo | Crear mínimas: Studio, Launcher, Calendario, Engineer, Strategy |

No se reinician: contratos técnicos, ADR, handoffs, ni la documentación
interna de `docs/` — esa se conserva como expediente.

## Etapa 3 — Release candidate (`0.9.x`)

Objetivo: demostrar que `1.0.0.0` puede sostener reputación pública.

Debe cerrar (gate RC):

- Rendimiento validado junto al simulador con el banco de huella (CPU, RAM,
  GPU por proceso; cifras repetidas, no una sola corrida).
- Instalación/update probada en entorno limpio.
- Suite de regresión mínima: visual de overlays principales + smoke funcional.
- Documentación de usuario completa.
- Sin P0/P1 abiertos; P2 conocidos con decisión escrita.
- Revisión de pricing/acceso contra la realidad de la beta.

## Etapa 4 — Lanzamiento (`v1.0.0.0`)

Objetivo: versión estable que el público puede comprar y usar sin leer
documentación técnica.

Debe cerrar (gate 1.0):

- Promesa LMU-first cumplida: todos los módulos del contrato presentes y
  estables (Hub, Launcher, Overlay Studio, widgets principales, Telemetry
  Core, Telemetry Analysis, Engineer/Spotter Beta, Strategy Planner,
  Calendario, cuenta, Billing, ajustes, instalador, actualizador).
- Pago/acceso estable con Polar reconciliado.
- Soporte básico organizado.
- La app puede sostener reputación pública.

Procedimiento de publicación: `testers -> master` con aprobación de Isaac,
tag `v1.0.0.0` anotado sobre el commit ya integrado, release con los seis
artefactos y anuncio Discord por el workflow existente.

## Etapa 5 — Post-lanzamiento / ecosistema (`1.x`)

Futuro, no comprometido en fecha:

- Comunidad de overlays y community layouts.
- Sync cloud de perfiles/layouts.
- Multisimulador: iRacing, Assetto Corsa 2014, AC EVO, ACC, AMS2 en el orden
  del contrato de producto.
- Marketplace de temas, companion app, plugin system público.
- Datos reales de carrera y progresión.

## Matriz de módulos requeridos en lanzamiento

Del contrato de producto; ninguno puede faltar en `1.0.0.0`:

| Módulo | Estado a 2026-09-11 | Etapa que lo cierra |
|---|---|---|
| Hub | Estable, en optimización | 1 |
| Launcher | Implementado (apps, perfiles, cadenas) | 1 |
| Overlay Studio V3 | En curso | 1 |
| Widgets core (Relative/Standings/Pedals/Delta) | Relative/Standings avanzados; Pedals/deltaBest pendientes | 1b–1d |
| Telemetry Core V2 | Programa R0–R5 activo | 0 |
| Telemetry Analysis | Reader histórico + runtime Windows | 2 |
| Engineer/Spotter Beta | Radio bus y familias en revisión | 2 |
| Strategy Planner | Motor sobre DuckDB real | 2 |
| Calendario | Correcciones y validación en curso | 1 |
| Cuenta + Billing | Polar NO-GO | 2.0 |
| Ajustes | Consolidando | 1 |
| Instalador + Updater | Pipeline con 6 artefactos existe | 2.0 |

## Criterios exactos de subida de versión

Esta sección responde "¿cómo valoramos que ya podemos subir?" con un
procedimiento ejecutable. Las condiciones de contenido vienen de
`versioning-and-release-gates.md`; lo que aquí se añade es la medición, la
evidencia exigible y el acto concreto de subida.

### Tipos de bump

| Bump | Segmento | Cuándo | Ejemplo |
|---|---|---|---|
| Patch | 4.º | Hotfix sin cambio de alcance | `0.6.1.0` → `0.6.1.1` |
| Corte de feature | 3.º | Milestone de GitHub cerrado al 100 % dentro de la fase | `0.6.1.0` → `0.6.2.0` |
| Transición de fase | 2.º | La fase anterior superó su gate review | `0.5.x` → `0.6.0.0` |
| Release | 1.º | La candidata superó el gate 1.0 | `0.9.x` → `1.0.0.0` |

Reglas:

- Los números no se reutilizan ni retroceden. Un tag publicado es inmutable.
- Un bump de fase no es una fecha ni una cuenta de features: es la
  certificación de un gate. Si el gate no pasa, la versión no sube.
- La decisión la toma Isaac con evidencia. Nunca es automática ni la dispara
  el cierre de un milestone por sí solo (regla ya vigente en `AGENTS.md`).
- Las builds de canal (`vX.Y.Z-nightly.N`, `vX.Y.Z-testers.N`) son
  prereleases continuas e independientes: subir de fase solo cambia la versión
  base de la que cuelgan.

### Instrumento: la Gate Review

Cada transición de fase se evalúa con una issue de GitHub
`roadmap:required` titulada `Gate review vX.Y.0.0`, cuyo cuerpo es la
checklist de la fase con la evidencia enlazada punto a punto. Se cierra solo
cuando:

1. cada punto del gate tiene evidencia enlazada (PR, run de CI, medición del
   banco o verificación manual firmada);
2. `nightly` acumula un periodo sin regresión P0/P1 nueva — propuesta: **7
   días** en insiders, **14 días** en beta pública, **21 días** en candidata;
3. el smoke manual del canal correspondiente pasa en un entorno limpio (no la
   máquina de desarrollo);
4. la checklist operativa de `release-checklists.md` de esa etapa está al
   100 % o con excepciones escritas y aceptadas por Isaac.

Soporte de tracking: cada versión de fase tiene su **milestone de GitHub**
(`v0.2.0.0`, `v0.3.0.0`, …, `v1.0.0.0`). Las issues se asignan al milestone
cuando se comprometen para ese corte; el milestone cerrado al 100 % marca el
corte como candidato a promoción, y la gate review decide.

### Transiciones y criterios medibles

#### `0.1.x` → `0.2.0.0` — entrar en insiders (producto usable)

Contenido (gate 0.2): app arranca, overlay desktop funciona, perfiles
guardan y cargan, mover/redimensionar funciona, recomendado → copia editable,
mock/live/demo no confunde, separación WidgetStudio/LayoutStudio.

Evidencia medible exigida:

- Checklist alpha de `release-checklists.md` al 100 % con evidencia enlazada.
- Telemetría V2 como única cadena productiva o retirada V1 cerrada con
  rollback por build anterior demostrado (programa R0–R5).
- CI de `nightly` verde y 7 días sin P0/P1 nuevo.
- Smoke manual en entorno limpio: instalar → login → abrir overlay → cerrar.

#### `0.2.x` → `0.3.0.0` — widgets core

Contenido (gate 0.3): `Relative` configurable cerrado; `Standings`
configurable cerrado excepto multiclase; rework UI acotado aplicado; sin
regresiones críticas de preview; un tester cercano completa un flujo real sin
asistencia.

Evidencia medible exigida:

- Todas las opciones aprobadas de `Relative`/`Standings` marcadas `stable` o
  `tester` (nada experimental sin etiquetar).
- Suite visual de previews sin regresión nueva respecto a la base.
- Un tester cercano ejecuta el guion completo (abrir → editar → guardar →
  reabrir → overlay) sin ayuda, con el resultado grabado en la issue.

#### `0.3.x` → `0.4.0.0` — distribución a testers

Contenido (gate 0.4): build compartible, instrucciones, OBS local claro,
hotkeys básicas o pospuestas explícitamente, `deltaBest` live o decisión
documentada, canal de feedback/bugs definido.

Evidencia medible exigida:

- Los seis artefactos de release se generan y verifican en CI sin intervención
  manual.
- Las instrucciones de instalación las ejecuta alguien que no desarrolló el
  producto, en entorno limpio.
- OBS Browser Source validado físicamente (no solo HTTP/SSE).
- Canal de feedback activo y known issues publicados.

#### `0.4.x` → `0.5.0.0` — cierre del core LMU

Contenido (gate 0.5): `Pedals` beta v1 cerrado, recomendados pulidos, smoke
test completo, sin P0/P1 abiertos, P2 documentados y aceptados.

Evidencia medible exigida:

- Checklist beta testers al 100 %.
- Smoke de los seis artefactos en Windows limpio.
- 0 issues P0/P1 abiertas; registro de P2 aceptados firmado por Isaac.

#### `0.5.x` → `0.6.0.0` — abrir la beta pública (el reinicio)

Contenido (gate 0.6 + decisión de reinicio): Polar/checkout integrado de
forma suficiente, licencia beta decidida, soporte/refund/feedback con
proceso, versión y changelog visibles, el producto no depende de asistencia
manual para arrancar.

Evidencia medible exigida:

- Matriz monetaria cerrada y reconciliación probada en sandbox; transacción
  de prueba de extremo a extremo (pago → entitlement → app).
- Credencial offline verificada por rol (14 días tester, 72 h nightly,
  30 días owner).
- Los siete documentos públicos de §"Reinicio de documentación" escritos.
- Instalación/update probada en entorno limpio por tercero.
- Canal estable habilitado para el rol Gratuito.
- 14 días de `testers` sin P0/P1 nuevo.

#### `0.6.x` → `0.7.0.0` — polish y layouts

Contenido (gate 0.7): layouts por sesión manuales estables o pospuestos
explícitamente; temas/densidad/opacidad no rompen overlays; recomendados
funcionan con cambios de layout.

Evidencia medible exigida:

- Cambio de layout por sesión persiste tras reinicio en prueba física.
- Suite visual sin regresión en los catálogos activos.

#### `0.7.x` → `0.8.0.0` — data blocks y OBS avanzado

Contenido (gate 0.8): data blocks incluidos usan datos fiables; métricas
experimentales no aparecen como stable; OBS avanzado/LAN no rompe OBS local.

Evidencia medible exigida:

- Cada data block lleva etiqueta `stable`/`tester`/`experimental` verificada
  contra la matriz de datos.
- OBS local y LAN conviven en la misma prueba sin regresión.

#### `0.8.x` → `0.9.0.0` — release candidate

Contenido (gate 0.9): performance validada, instalación/update clara,
regresiones visuales principales cubiertas, docs de usuario listas, sin
P0/P1, P2 conocidos con decisión.

Evidencia medible exigida:

- Banco de huella con cifras repetidas (mínimo 3 corridas) publicadas en el
  handoff: CPU, RAM y GPU por proceso junto al simulador.
- Suite de regresión visual mínima verde en CI.
- Documentación de usuario completa.
- 0 P0/P1 abiertas; P2 con decisión escrita.

#### `0.9.x` → `1.0.0.0` — lanzamiento estable

Contenido (gate 1.0): promesa LMU-first cumplida, pago/acceso funciona,
soporte básico preparado, el usuario no necesita leer documentación técnica,
la app puede sostener reputación pública.

Evidencia medible exigida:

- Los trece módulos del contrato (tabla anterior) presentes y estables.
- Compra real de extremo a extremo verificada en producción.
- Reinstalación limpia y actualización entre versiones probadas.
- La candidata acumula 21 días sin P0/P1 nuevo.
- Checklist de release de `release-checklists.md` al 100 %.

### Qué nunca justifica una subida

- Tiempo transcurrido desde la última versión.
- Cantidad de features mergeadas sin gate superado.
- Presión de calendario, marketing o comparación con competidores.
- "Casi pasa" el gate: o pasa con evidencia o no se sube.

### Mecánica operativa del bump

1. Gate review PASS → Isaac autoriza la promoción del corte
   (`nightly → testers` o `testers → master` según la etapa).
2. `VERSION` se actualiza y `task version:sync` propaga a
   `cmd/vantare/main.go`, `build/config.yml`, `build/windows/info.json` y
   `build/windows/nsis/project.nsi`; el commit de versión viaja en el PR de
   promoción final.
3. Solo tras integrar en `master`: tag anotado `vX.Y.Z.0` sobre ese commit →
   `release.yml` genera los seis artefactos y publica en Discord.
4. Entrada en `docs/changelog.md` y el hito del roadmap correspondiente pasa
   de `plan` a `release` en el mismo PR de cierre.
5. Si aparece un fallo crítico post-tag: nunca reutilizar el tag; rama
   `vantareapp/hotfix-isa-N-*` desde `master`, bump del 4.º segmento.

### Señales que bloquean cualquier subida

- Cualquier P0/P1 abierta sin asignar.
- CI roja en el canal origen.
- El banco de huella fuera de presupuesto respecto a la versión anterior.
- Documentación pública desactualizada respecto a lo que la build hace.



1. **Versión de apertura de la beta pública**: este plan propone `0.6.0.0`
   (consistente con los gates ya escritos). Alternativa: renumerar el rango.
   Pendiente.
2. **Pago desde el día 1 de la beta pública** vs. apertura solo-Free con pago
   activado en `0.6.x` posterior. El contrato exige Polar cerrado antes de
   cualquier venta.
3. **Precios**: el contrato vigente define Free / Pro 4,99 € / Pro Plus
   9,99 € / Launch Edition 30 € único. Los tiers antiguos del índice de
   release (Beta Access/Supporter/Founder/Pro Founder/Visionary) quedan
   supersedidos salvo decisión contraria.
4. **Firma de código / SmartScreen**: fuera del plan hasta que haya ingresos
   o usuarios que lo justifiquen (decisión previa conservada).
5. **Multisimulador**: post-1.0 como regla; si algún sim entra antes, es
   `experimental` explícito.
6. **Linux/Proton**: sigue experimental y no se anuncia como estable.
7. **Voz de Engineer**: solo cuando los datos la sostengan; el carril
   experimental actual falla cerrado.

## Riesgos principales

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Polar no cierra antes de 2.0 | Sin venta pública | La beta puede abrir solo-Free; pago se activa después |
| `deltaBest` arrastrado | Gate 1c bloqueado | Decisión documentada explícita, no silencio |
| Retirada V1 incompleta | Dos cadenas de telemetría | Programa R0–R5 con rollback por build anterior |
| Documentación no reiniciada | Beta pública confunde usuarios | Es gate de 2.0, no opcional |
| Prometer experimental como estable | Reputación | Regla `stable`/`tester`/`experimental` ya decidida |
| Ritmo de una sola persona | Fechas se deslizan | El plan no fija fechas; fija gates y orden |

## Cómo se mantiene este plan

- Este documento es interno y puede cambiar con cada decisión de Isaac; se
  actualiza en el PR que introduce el cambio material.
- La cara pública vive en `docs/roadmap/plan.md`: cada etapa nueva o cerrada
  se refleja allí en el mismo PR, y `roadmap.json` se regenera con
  `python .github/scripts/roadmap_digest.py --repo . --ref origin/nightly`.
- Lo entregado nunca se anuncia como plan: un hito cumplido pasa de `plan` a
  `feature`/`fix`/`release` y su cuerpo se reescribe a lo que la app hace hoy.
- El estado operativo de cada trabajo vive en GitHub Issues y el handoff vivo
  del proyecto, no aquí.

## Reflejo en el roadmap público (plan.md)

Este PR introduce en `plan.md`:

- La fase `beta-foundation` pasa a titularse **Beta inicial** (era "Beta
  pública", nombre que se reserva para la apertura real).
- Fases nuevas: **Programa de insiders** (`0.2.x–0.5.x`, planned), **Beta
  pública** (`0.6.x–0.8.x`, planned), **Candidata de lanzamiento** (`0.9.x`,
  future) y **Lanzamiento 1.0** (`v1.0.0.0`, future).
- `engineer` y `ecosystem` solo renumeran su etiqueta de fase (5 y 8); su
  contenido no cambia.
- Nueve hitos de tipo `plan`, uno por puerta de etapa, en español con
  traducciones en/pt/it.
