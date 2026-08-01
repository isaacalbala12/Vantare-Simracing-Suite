# Mapa de proyectos y dependencias

Estado: 2026-08-01. Linear es la fuente del estado operativo.

## Grafo principal

```text
Telemetry Core
  ├─ Overlay Studio / Desktop / OBS
  ├─ Engineer / Spotter
  ├─ StrategyLiveProjection v1 → Strategy Planner live
  └─ Telemetry Analysis

Telemetry Analysis ── StrategyInputProjection v1 → Strategy Planner assisted

Account + Billing ─ permisos y canales
Launcher ───────── activación de LMU y módulos
Calendar ───────── eventos → perfiles, layouts y estrategias
Settings ───────── configuración común
Roadmap/Discord ── publicación sanitizada desde Linear
Installer/Updater  Nightly → Testers → Master
```

Los módulos consumen contratos versionados. Ninguno accede a la UI o al
almacenamiento privado de otro.

## Proyectos

| Proyecto | Resultado | Estado actual | Dependencia inmediata |
|---|---|---|---|
| Telemetry Core | Runtime live modular | ISA-117 / TC-09F técnicamente cerrado, `In Review`; no promovido | ISA-160/161 para Strategy live |
| Telemetry Analysis | Explicar post-sesión dónde se pierde tiempo | ISA-122/124 en review; ISA-126/135 activos; ISA-132 pendiente | ISA-159 productor Strategy histórico |
| Engineer/Spotter | Acompañamiento live, seguridad, voz y Pit Manager | ISA-123/125/127/133 en review; siguiente ISA-158 | ISA-158 scheduler determinista |
| Strategy Planner | Crear, comparar, ejecutar y adaptar estrategias | ISA-134 corrige review; PB canceladas como historia; STR backlog creado | ISA-136 después de STR-00 |
| Overlay Studio | Editor único, Desktop y OBS | proyecto activo | TC-07 y gates visuales |
| Launcher | Apps, perfiles y módulos fiables | implementación previa | auditoría de integración |
| Hub | Accesos y resumen real | conservar estructura | consistencia |
| Calendar | Feed, agenda y recordatorios | parcial/histórico | proyecto propio |
| Account/Profile | Identidad local, avatar, SR/DR | ISA-12 histórica | proyecto y auditoría DoX |
| Billing | Polar listo y Supabase endurecido | NO-GO | plan BIL y pruebas |
| Settings | Configuración global/por perfil | por consolidar | ownership modular |
| Installer/Updater | Instalación, rollback y canales | proyecto por crear | ramas y Billing |
| Roadmap/Linear/Discord | Estado público seguro | workflows previos | resumen público |
| Root migration | `vantare-v2` como raíz | auditoría ISA-14 | cerrar worktrees |

Contenido y marketing no se implementan autónomamente.

## Fronteras

- **Telemetry Core:** fuentes, validez, fusión, tiempo, calidad, capabilities,
  derivaciones y proyecciones. Sin UI, consejos, frases ni estrategia.
- **Telemetry Analysis:** sesiones históricas, comparaciones, métricas,
  correcciones, notas y workspaces. Sin decisiones live.
- **Engineer/Spotter:** hechos live, prioridades, mensajes, audio, voz y
  acciones confirmadas. Sin reader LMU propio.
- **Strategy:** planes, stints, inventario, optimización y ejecución. Engineer
  propone; Strategy aplica tras aceptación.
- **Overlay:** ViewModels puros. Sin fuentes, fusión ni lógica de producto.

## Orden global

1. Cerrar review ISA-117 sin promover; Core canónico permanece como base.
2. Analysis: ISA-126/135 -> ISA-132 -> ISA-159 productor histórico Strategy.
3. Engineer: continuar ISA-158 sobre ENG-04 sin reabrir adquisición LMU.
4. Strategy: cerrar STR-00 -> ISA-136..157 + ISA-162/163.
5. Core: ISA-160 audita señales y ISA-161 produce live antes de STR-17.
6. Strategy asistido se bloquea en ISA-159; live se bloquea en ISA-161.
7. Cerrar Overlay con LMU real y gates visuales pendientes.
8. Completar plataforma comercial, distribución y migración de raíz.
9. Solo después: `nightly` -> feedback -> `testers` -> aprobación -> `master`.

## Contratos Strategy pendientes

| Contrato | Owner | Productor | Consumidor bloqueado |
| --- | --- | --- | --- |
| `StrategyInputProjection v1` | Telemetry Analysis | ISA-159 / TA-05 | ISA-145 / STR-10 |
| `StrategyLiveProjection v1` | Telemetry Core | ISA-160 / TC-10A, ISA-161 / TC-10B | ISA-152 / STR-17 |

La proyección Strategy presente en ISA-117 solo cubre sesión, progreso y pit;
no es una entrada productiva suficiente para Fuel, Virtual Energy, neumáticos
o weather. No se autoriza un fallback local dentro de Strategy.
