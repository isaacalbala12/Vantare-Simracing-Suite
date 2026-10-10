# Modelo de dominio nativo

| Concepto | Significado y fuente |
|---|---|
| Snapshot | Hechos neutrales, calidad y procedencia; [domain/model.rs](../native/domain/src/model.rs). El DTO de [IPC](../native/ipc/src/dto.rs) es el formato del transporte, no el dominio. |
| Board | Proyección común a los Looks de un widget; [Standings](../native/domain/src/standings.rs), Relative, Delta y Fuel proyectan sus hechos en domain. |
| Widget | Tipo funcional del [registro UI](../native/ui/src/registry.rs), con Settings y estado de presentación. |
| Look | Apariencia Eficiencia/Vantare en [look.rs](../native/ui/src/look.rs); no cambia los hechos ni crea otra proyección. `standings::Look` aún denomina la variante Neo/Neutro; su renombrado pertenece a PR-3 de #1561. |
| Layout / Document | Composición, posiciones, opciones y persistencia UI en [layout.rs](../native/ui/src/layout.rs), versión propia v1. |
| Editor | Historial y edición del documento en [Hub/document.rs](../native/hub/src/document.rs); Studio presenta lienzo e inspector. |
| Policy | Derechos de módulos, widgets y canales en [IPC/control.rs](../native/ipc/src/control.rs); no es el estado de sesión ni la geometría. |
| Workshop | Host de desarrollo GPUI del renderer productivo; [UI/README](../native/ui/README.md). |
| Analysis | Consultas post-sesión; [storage](../native/storage/README.md) posee DuckDB. |
| Engineer/Spotter | Consumidor de eventos/radio/voz bajo demanda; [Engineer](../native/engineer/README.md). |
| Strategy | Documento y cálculo con procedencia; [strategy/document.rs](../native/strategy/src/document.rs). |
| Desconectado | Sin fuente live disponible; no implica datos sintéticos ni una vuelta real. |

[Arquitectura](architecture.md) · [fronteras y handoffs](vantare-program/project-map.md).
[Modelo anterior por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/domain-model.md): nombres y rutas del legado, conservados como historia.
