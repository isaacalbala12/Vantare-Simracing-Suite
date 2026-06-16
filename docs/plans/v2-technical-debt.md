# Vantare Overlays v2 — Deuda técnica y mejoras futuras

> Este documento recoge todos los puntos mencionados como "deuda técnica" o "mejoras a añadir" que no forman parte de las implementaciones activas del roadmap.
> Se consulta antes de cerrar cada fase y se usa para decidir qué incluir en la siguiente.

## Rendimiento y optimización

| # | Item | Origen | Prioridad | Notas |
|---|---|---|---|---|
| 1 | **Frecuencia de actualización live configurable** | Demo mode Fase A | Alta | Ahora mismo los widgets reciben datos a la frecuencia del pipeline. Debe ser configurable globalmente y/o por widget (60 Hz, 30 Hz, 20 Hz, 10 Hz). |
| 2 | **Activar/desactivar muestreo de CPU en Ops panel** | Fase A, implementación 12 | Media | Incluido parcialmente en Fase A, pero debe poder desactivarse completamente en producción para evitar carga innecesaria. |
| 3 | **Perfilar memoria/CPU con todos los widgets activos** | Fase 3 roadmap original | Media | Objetivo: < 120 MB RAM y < 2% CPU en runtime. |
| 4 | **Buffer circular eficiente para inputs y últimas vueltas** | Fase 2 widgets | Media | Revisar allocations en Go al mantener histórico de datos. |

## Delta y telemetría

| # | Item | Origen | Prioridad | Notas |
|---|---|---|---|---|
| 5 | **Reconstrucción precisa de vueltas de referencia para delta session/global** | Fase A, delta best | Alta | Ahora se usa aproximación por tiempo total. Idealmente reconstruir la vuelta de referencia por distancia para coches que no son el jugador. |
| 6 | **Clutch live** | README v0.1.1 | Baja | LMU no expone offset de clutch de forma fiable; revisar en futuras versiones del sim o en otros sims. |
| 7 | **Histórico completo de vueltas por distancia** | Item 5 | Media | Base de datos ligera de vueltas por pista/coche para comparativas avanzadas. |

## Instalador y distribución

| # | Item | Origen | Prioridad | Notas |
|---|---|---|---|---|
| 8 | **Firma de código con certificado Authenticode** | Discusión plan general | Alta (cuando haya ingresos/usuarios) | Evita SmartScreen/Defender "Windows protegió tu PC". De pago (~80–400 USD/año). Fuera del plan hasta fase monetizable. |
| 9 | **Cierre graceful más sofisticado del updater** | Discusión plan general | Media | Ahora se fuerza el cierre tras 3s. Idealmente notificar al usuario y permitir guardar perfiles antes de actualizar. |
| 10 | **Instalador silencioso opcional** | Updater v0.1.4 | Baja | Ahora corre el installer UI. Opción silent mejoraría UX. |

## UI/UX y onboarding

| # | Item | Origen | Prioridad | Notas |
|---|---|---|---|---|
| 11 | **Mini tutorial visual para setup OBS** | Fase A, OBS setup | Media | Instrucciones en texto por ahora. Tutorial visual o GIFs en Fase D/E. |
| 12 | **Onboarding de primer uso** | Sugerido implícito | Media | Primera vez que se abre la app: explicar perfiles, preview, overlay. |
| 13 | **Undo/redo avanzado en editor** | Fase A, guardado | Baja | Ctrl+Z/Ctrl+Y básico en Fase A. Historial completo de estados para deshacer cualquier cambio. |
| 14 | **Indicadores de error más visuales** | General | Baja | Cuando una fuente de telemetría falla, mostrarlo en overlay y hub. |

## Community y seguridad

| # | Item | Origen | Prioridad | Notas |
|---|---|---|---|---|
| 15 | **Validación de layouts de comunidad** | Fase E | Alta | Sandbox/validar JSON de layouts descargados para evitar perfiles maliciosos o rotos. |
| 16 | **Sistema de rating y comentarios** | Fase E | Baja | Community Layouts fase inicial solo upload/download. Rating/comentarios más adelante. |
| 17 | **Moderación de layouts** | Fase E | Baja | Reportar/banear layouts inapropiados. |

## Multisimulador

| # | Item | Origen | Prioridad | Notas |
|---|---|---|---|---|
| 18 | **iRacing sin suscripción activa** | Fase B | Media | Desarrollo con mocks/replay hasta tener acceso real. |
| 19 | **AC Competizione** | No solicitado | Baja | No está en el plan inicial; valorar si hay demanda. |

## Assetto Corsa EVO

| # | Item | Origen | Prioridad | Notas |
|---|---|---|---|---|
| 20 | **Implementación real de app nativa en AC EVO** | Fase F | Incierta | Depende de madurez de API de apps nativas. Puede quedar solo como documento. |

## Accesibilidad e internacionalización

| # | Item | Origen | Prioridad | Notas |
|---|---|---|---|---|
| 21 | **Atajos de teclado configurables desde UI visual** | Fase A hotkeys | Media | Ahora se configuran en settings globales. Mejorar con captura de tecla visual. |
| 22 | **Idioma español/inglés** | Comunicación actual | Baja | App en español por ahora. Internacionalización futura. |

## Como usar este documento

- Antes de cerrar una fase, revisar si algún item de deuda técnica debe resolverse antes del tag.
- Al planificar la siguiente fase, mover items de aquí al plan activo cuando sea estratégico.
- No intentar resolver todo a la vez; priorizar por impacto en usuarios reales.
