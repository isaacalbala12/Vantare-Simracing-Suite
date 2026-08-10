# Mapa de proyectos y dependencias

Estado: 2026-08-11. Linear es la fuente del estado operativo.

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
| Engineer/Spotter | Sustituto clean-room de CrewChief: acompañamiento live, seguridad, voz y Pit Manager | Base ENG-01..12, 14 y 15 en Nightly; ISA-313 fija el brief clean-room y el roadmap general replanificable | Replanning de entrada de la Fase 1: Spotter observable |
| Strategy Planner | Crear, comparar, ejecutar y adaptar estrategias | Pila acumulativa integrada en Nightly por ISA-309@7e39104; sin STR-15B ni ejecución live | Productores Telemetry ISA-159/160/161 y siguientes cortes del handoff Strategy |
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
3. Engineer: avanzar por fases generales — Spotter observable, Engineer de
   carrera, control, acciones LMU, Strategy/Overlays y Beta integrada—. Cada
   fase se microplanifica al entrar y se prueba manualmente más una aceptación
   acumulativa ejecutable por IA. La primera Beta excluye cambio de piloto.
4. Engineer voz: mantener una línea condicionada en paralelo. Kokoro, STT y
   wake solo convergen si pasan licencias, rendimiento, privacidad, corpus y
   pruebas humanas. Español e inglés se validan primero; italiano y portugués
   brasileño llegan en la expansión posterior.
5. Engineer Strategy/Overlays avanzados: integrarlos dentro de la fase de
   acciones seguras, después de cerrar las bases anteriores y sin duplicar el
   `engineer-radio` visual existente.
6. Strategy: revisar la pila integrada y continuar sus cortes propios; Core y
   Analysis siguen siendo productores de sus proyecciones versionadas.
7. Cerrar Overlay con LMU real y gates visuales pendientes.
8. Completar plataforma comercial, distribución y migración de raíz.
9. Solo después de cada aprobación aplicable: rama de issue -> `nightly` ->
   feedback -> `testers` -> aprobación -> `master`.

## Contratos Strategy pendientes

| Contrato | Owner | Productor | Consumidor bloqueado |
| --- | --- | --- | --- |
| `StrategyInputProjection v1` | Telemetry Analysis | ISA-159 / TA-05 | ISA-145 / STR-10 |
| `StrategyLiveProjection v1` | Telemetry Core | ISA-160 / TC-10A, ISA-161 / TC-10B | ISA-152 / STR-17 |

La proyección Strategy presente en ISA-117 solo cubre sesión, progreso y pit;
no es una entrada productiva suficiente para Fuel, Virtual Energy, neumáticos
o weather. No se autoriza un fallback local dentro de Strategy.
