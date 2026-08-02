# Mapa de proyectos y dependencias

Estado: 2026-07-27. Linear es la fuente del estado operativo.

## Grafo principal

```text
Telemetry Core
  ├─ Overlay Studio / Desktop / OBS
  ├─ Engineer / Spotter
  ├─ Strategy Planner live
  └─ Telemetry Analysis

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

| Proyecto | Resultado | Estado inicial | Dependencia inmediata |
|---|---|---|---|
| Telemetry Core | Runtime live modular | ISA-37 en review; TC-04D/TC-05–09 pendientes | ISA-38 |
| Telemetry Analysis | Explicar post-sesión dónde se pierde tiempo | proyecto creado; investigación pendiente | TC-05/06 |
| Engineer/Spotter | Acompañamiento live, seguridad, voz y Pit Manager | proyecto creado; código no confiable | TC-05 y auditoría |
| Strategy Planner | Crear, comparar, ejecutar y adaptar estrategias | proyecto unificado; B/C quedan como historia | reauditar backlog |
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

1. GOV-01 y reconciliación de Linear.
2. Completar Telemetry Core TC-04D–TC-09.
3. Investigación profunda de Analysis y Engineer en paralelo.
4. Implementar Analysis sobre TC-06.
5. Implementar Engineer sobre TC-05/08.
6. Unificar y completar Strategy.
7. Cerrar Overlay con LMU real.
8. Completar plataforma comercial y distribución.
9. Migrar raíz y ramas cuando se cierren grandes worktrees.
10. Auditoría transversal, Testers y gate final de Master.
