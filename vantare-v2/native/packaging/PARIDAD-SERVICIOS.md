# Matriz de paridad de servicios — candidato fase 7 (ISA-1432)

Inspección actualizada en fase 7b, base `a6cd70ab`, 2026-09-30. Autoridad arquitectónica:
ADR 0099 §3/§7 y fase 7 del plan. El paquete contiene **la base de esta rama**,
no los cambios aún aislados de otros workers. Compilar un servicio o tener
fixtures no equivale a paridad funcional/visual ni validación física.

| Servicio del producto Wails | Equivalente en este candidato | Evidencia local / aceptación pendiente | Dependencia |
| --- | --- | --- | --- |
| Adquisición, estado y derivaciones LMU | Parcial, Core real empaquetado | `runtime/src/bin/vantare-core.rs`, `runtime/src/adapter/lmu/`, tests de conformidad/oráculo y core_e2e. Capturas físicas, recursos y sesión prolongada no se ejecutan aquí. | Fases 1/8/9 |
| Segundo simulador y neutralidad | Parcial, adaptador ACC en la base | `runtime/src/adapter/acc/`, `runtime/tests/acc_conformance.rs`. ACC no es Assetto Corsa 2014; no afirmar fase 6 completa. Test live ACC ignorado. | Fases 1/6 |
| Ciclo de vida/instancia única | Disponible como mecanismo, sin nueva paridad comercial | `runtime/src/bin/vantare/`, `runtime/tests/lifecycle.rs`; siete escenarios pasan en suite. Launcher Wails tiene catálogo/discovery/perfiles de juego adicionales. | Fase 5 para paridad completa |
| IPC, foto actual y reconexión | Disponible en la base | `ipc/`, `runtime/src/service.rs`; DTO/ACL/revisión y core_e2e en gates. Eventos por `runtime/src/service.rs`; packaging no prueba paridad del transporte. | Fases 3/4 |
| Widgets Eficiencia y captura de ventana OBS | Parcial, UI actual empaquetada | `ui/src/registry.rs`, `ui/reference/`, `ui/src/bin/vantare-overlays.rs`. Workers de fase 2 y revisión visual están fuera de este diff. El smoke de packaging no abre GPUI/OBS. | Fases 2/8/9 |
| Otros diseños Wails | Fuera del porte, decisión explícita | Crystal, Endurance, iRacing y Original quedan en Wails hasta corte según fase 2. La copia de perfiles conserva todos sus bytes sin activar estos diseños en Rust. | ADR 0099 / fase 2 |
| Hub y Overlay Studio | Parcial, Hub/Studio empaquetados | `hub/src/main.rs`, `hub/src/studio.rs`, `ui/src/layout.rs`. Editor sobre layout común; paridad completa de servicios y validación física pendientes. | Fase 5 |
| Workshop | Parcial, binario empaquetado | `ui/src/bin/vantare-workshop.rs`, `ui/README.md`: selección de widget/escena y recompilación. Aceptación de Workshop completo pertenece a fase 5. | Fase 5 |
| Licencia local firmada y permisos | Ausente como servicio nativo equivalente | Wails: `internal/app/updater_service.go` y composición de autorizador en `cmd/vantare/main.go`. Campo channel del manifiesto no concede derechos ni es una validación de licencia. | Fase 5 / núcleo |
| Cuenta, Supabase, renovación y Billing | Ausente | Servicios Wails en `internal/app/` y contrato `docs/vantare-program/product-contract.md`. No hay credenciales, llamadas remotas o persistencia de cuenta en packaging. | Fase 5 |
| Calendario, Discord y notificaciones | Parcial: calendario/notificaciones locales del Hub | `hub/src/calendar.rs`, `notifications.rs`; los servicios remotos requieren lista de paridad. No se verifican aquí. | Fase 5 |
| Preferencias, idiomas y perfiles | Parcial: formato puro y conversión V4 explícita | `domain/src/format.rs`, `ui/src/profile_import.rs`, `candidate.ps1` ImportLayout. Golden y rollback de layout. No importa layouts por sesión ni políticas de rendimiento. | Fases 5/7b |
| Planes de Strategy / solver pesado | Ausente como servicio nativo | Wails: `internal/strategy/repository/`, `internal/strategy/application/`. Widget Fuel Strategy es presentación, no editor/solver/persistencia de planes. | Fases 4/5 |
| Engineer/Spotter y voz | Parcial, binario Engineer empaquetado bajo demanda | `engineer/src/main.rs`, `engineer/README.md`; voz/cursor/eventos en la base. Packaging solo verifica carga CLI, no aceptación física de audio. | Fase 3 |
| Eventos y recuperación durable | Parcial, eventos IPC y journal en la base | `runtime/src/service.rs`, `runtime/src/flows/`, `native/README.md` describe recording opt-in. No declarar garantía durable sin pruebas correspondientes del propietario. | Fases 3/4 |
| Series, recording y almacén DuckDB | Parcial, Storage empaquetado | `storage/src/main.rs`, `storage/README.md`; dueño DuckDB de esta base. Las grabadoras de diagnóstico LMU/ACC no sustituyen recording de producto. | Fase 4 |
| Análisis histórico/live | Parcial, implementación de Storage en la base | `storage/README.md` y tests workspace; empaquetar no prueba paridad completa de producto. | Fase 4 |
| Testing Center | Ausente, **requisito de sustitución** | Wails: `internal/testingcenter/`, puentes de borradores/diagnóstico en `cmd/vantare/main.go:2727`. Se mantienen límites de autoridad de ISA-318/322; no habilitar remotos o auto-merge. | Trabajo nativo fuera del núcleo, según ADR §7 |
| Instalación/portable | Mecanismo offline disponible | `candidate.ps1`, `tests.ps1`: diez exe, sidecars, PE x64, integridad, instalado/portable y smoke CLI. Instalador script por usuario; no distribución comercial. | Distribución final pendiente |
| Actualización/rollback | Mecanismo offline disponible | Generaciones y state.json atómico, copias verificadas, exclusión, exe en uso y muerte real del actualizador en tres fronteras. No hay feed, descarga, autenticidad remota o autorización de canal. | Fase 5 + integración de release revisada |
| Migración Wails → nativo | Conversión de perfiles V4 explícita y reversible | `IMPORTACION-V4.md`: posiciones, enabled, opacidad y Settings admitidos. Reporte de omisiones y rollback de layout previo. Sin migración DB/Strategy/cuenta. | Fases 3/4/5 para otros datos |
| Red remota para análisis y render 3D | Fuera de la sustitución | Extensiones explícitas de ADR 0099 y fase 7; no requisitos para este corte. | Plan posterior separado |

## Puertas antes de aceptar la fase completa

- Integrar/revisar las fases 2–6 y repetir la matriz sobre el SHA final, sin
  confundir un widget de presentación con su servicio.
- Acordar contratos de almacenamiento y adoptar el directorio de datos de
  generación con todos los propietarios detenidos. Golden de conversión real y
  rollback de DB/perfiles; el mecanismo de copia actual no resuelve semántica.
- Resolver MSVC/ICU y mínimo Windows admitido con preflight y prueba limpia;
  notices/licencias/SBOM completos, firma e instalador final revisados.
- Isaac/orquestador fijan y ejecutan soak con LMU + OBS y prueba en otra GPU,
  con hashes y criterios de duración/recursos acordados. Ninguna se ejecuta
  aquí; cuatro entradas live de la suite están ignoradas por diseño.
- Integrar assets nativos al canal existente de GitHub Releases solo tras
  revisión/autorización. No se modifica ni dispara release.yml en este trabajo.
- Reconciliar evidencia y seguimiento en Notion al recuperar acceso. La
  excepción del encargo no certifica estado de tarea/proyecto ni cierre remoto.

**Resultado: candidato técnico local y reversible; fase 7 completa bloqueada
en paridad de servicios/migración de otros datos, distribución final y evidencia física.**
