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

## Decisiones pendientes de Isaac

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
