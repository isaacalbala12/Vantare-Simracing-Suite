# Matriz de paridad de servicios — candidato fase 7 (ISA-1432)

Inspección del worktree de fase 7, 2026-09-30. Autoridad arquitectónica:
ADR 0099 §3/§7 y fase 7 del plan. El paquete contiene **la base de esta rama**,
no los cambios aún aislados de otros workers. Compilar un servicio o tener
fixtures no equivale a paridad funcional/visual ni validación física.

| Servicio del producto Wails | Equivalente en este candidato | Evidencia local / aceptación pendiente | Dependencia |
| --- | --- | --- | --- |
| Adquisición, estado y derivaciones LMU | Parcial, Core real empaquetado | `runtime/src/bin/vantare-core.rs`, `runtime/src/adapter/lmu/`, tests de conformidad/oráculo y core_e2e. Capturas físicas, recursos y sesión prolongada no se ejecutan aquí. | Fases 1/8/9 |
| Segundo simulador y neutralidad | Parcial, adaptador ACC en la base | `runtime/src/adapter/acc/`, `runtime/tests/acc_conformance.rs`. ACC no es Assetto Corsa 2014; no afirmar fase 6 completa. Test live ACC ignorado. | Fases 1/6 |
| Ciclo de vida/instancia única | Disponible como mecanismo, sin nueva paridad comercial | `runtime/src/bin/vantare/`, `runtime/tests/lifecycle.rs`; siete escenarios pasan en suite. Launcher Wails tiene catálogo/discovery/perfiles de juego adicionales. | Fase 5 para paridad completa |
| IPC, foto actual y reconexión | Disponible, alcance snapshot | `ipc/`, `runtime/src/service.rs`; DTO/ACL/revisión y core_e2e en gates. No equivale a transporte de eventos/series activo. | Fases 3/4 |
| Widgets Eficiencia y captura de ventana OBS | Parcial, UI actual empaquetada | `ui/src/registry.rs`, `ui/reference/`, `ui/src/bin/vantare-overlays.rs`. Workers de fase 2 y revisión visual están fuera de este diff. El smoke de packaging no abre GPUI/OBS. | Fases 2/8/9 |
| Otros diseños Wails | Fuera del porte, decisión explícita | Crystal, Endurance, iRacing y Original quedan en Wails hasta corte según fase 2. La copia de perfiles conserva todos sus bytes sin activar estos diseños en Rust. | ADR 0099 / fase 2 |
| Hub y Overlay Studio | Ausente en los binarios de esta base | No hay binario Hub/Studio ni esquema persistido nativo equivalente. No sustituirlo por Workshop ni inventar conversión de layout. | Fase 5 |
| Workshop | Parcial, binario empaquetado | `ui/src/bin/vantare-workshop.rs`, `ui/README.md`: selección de widget/escena y recompilación. Aceptación de Workshop completo pertenece a fase 5. | Fase 5 |
| Licencia local firmada y permisos | Ausente como servicio nativo equivalente | Wails: `internal/app/updater_service.go` y composición de autorizador en `cmd/vantare/main.go`. Campo channel del manifiesto no concede derechos ni es una validación de licencia. | Fase 5 / núcleo |
| Cuenta, Supabase, renovación y Billing | Ausente | Servicios Wails en `internal/app/` y contrato `docs/vantare-program/product-contract.md`. No hay credenciales, llamadas remotas o persistencia de cuenta en packaging. | Fase 5 |
| Calendario, Discord y notificaciones | Ausente | Wails: `internal/calendar/`, servicios/puentes de `internal/app/`. Necesita lista de comprobación funcional del Hub. | Fase 5 |
| Preferencias, idiomas y perfiles | Parcial: formato puro; archivo de perfiles reversible | `domain/src/format.rs` y `candidate.ps1` ImportProfiles. Copia opaca de JSON públicos Wails con recibo/hash; no los transforma ni los consume la app nativa. No prueba cuatro idiomas ni preferencias del Hub. | Fase 5 |
| Planes de Strategy / solver pesado | Ausente como servicio nativo | Wails: `internal/strategy/repository/`, `internal/strategy/application/`. Widget Fuel Strategy es presentación, no editor/solver/persistencia de planes. | Fases 4/5 |
| Engineer/Spotter y voz | Ausente | Wails: `internal/engineer/`, `internal/app/engineer_port.go`. Flujos internos no son un worker Engineer/voz. | Fase 3 |
| Eventos y recuperación durable | Parcial, frontera interna probada | `runtime/src/flows/README.md`: boxes del jugador, journal/ACK/huecos y opt-in interno; sin transporte IPC, consumidor Engineer ni flag CLI. `service.rs` usa `Core::new`, recording desactivado. | Fases 3/4 |
| Series, recording y almacén DuckDB | Parcial, tipos/prueba de frontera; almacén ausente | `runtime/src/flows/series.rs`, `recording.rs`; sin worker DuckDB nativo propietario/integración productiva. Las grabadoras de diagnóstico LMU/ACC no sustituyen recording de producto. | Fase 4 |
| Análisis histórico/live | Ausente | Wails: `internal/telemetryanalysis/`, `internal/app/telemetry_analysis_service.go`, contrato/handoff Analysis. Ningún consumidor/worker nativo empaquetado equivalente. | Fase 4 |
| Testing Center | Ausente, **requisito de sustitución** | Wails: `internal/testingcenter/`, puentes de borradores/diagnóstico en `cmd/vantare/main.go:2727`. Se mantienen límites de autoridad de ISA-318/322; no habilitar remotos o auto-merge. | Trabajo nativo fuera del núcleo, según ADR §7 |
| Instalación/portable | Mecanismo offline disponible | `candidate.ps1`, `tests.ps1`: seis exe reales, PE x64, integridad, árbol idéntico instalado/portable y smoke CLI. Instalador script por usuario, sin NSIS gráfico, registro, UAC, WebView2 o servicios. | Distribución final pendiente |
| Actualización/rollback | Mecanismo offline disponible | Generaciones y state.json atómico, copias verificadas, exclusión, exe en uso y muerte real del actualizador en tres fronteras. No hay feed, descarga, autenticidad remota o autorización de canal. | Fase 5 + integración de release revisada |
| Migración Wails → nativo | Bloqueada funcionalmente; archivo reversible disponible | Perfiles archivados sin cambiar origen y reversión de generación. No migrar sesiones/DB/Strategy/cuenta sin esquema destino y propietarios detenidos. | Fases 3/4/5 |
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
  aquí; dos pruebas live de la suite están ignoradas por diseño.
- Integrar assets nativos al canal existente de GitHub Releases solo tras
  revisión/autorización. No se modifica ni dispara release.yml en este trabajo.
- Reconciliar evidencia y seguimiento en Notion al recuperar acceso. La
  excepción del encargo no certifica estado de tarea/proyecto ni cierre remoto.

**Resultado: candidato técnico local y reversible; fase 7 completa bloqueada
en paridad/migración funcional, distribución final y evidencia física.**
