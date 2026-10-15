# ipc — fotos versionadas

DTO explícito, transporte autenticado y demanda; la versión de foto es independiente de servicios y control.

## #1562 · Ocultar fuera de pista

DTO v10 añade `state.driving_situation` a fotos completas y parciales, también
con demanda vacía. Campo ausente se lee Unknown; valor desconocido se rechaza.
El pipe live solo admite v10; los lectores guardados aceptan v7/v8/v9/v10
sin reescribir originales. Servicios y control mantienen sus versiones propias.
Ver [contrato y señales](../runtime/README.md).

## #1638 · Avisos de sesión

DTO v11 añade los siete campos de `Session.timing` al grupo `SessionInfo`.
El cable solo negocia v11: hay que recompilar Core, Hub y overlays juntos.
Los lectores explícitos de datos guardados aceptan v7–v10 y convierten estos
campos a `Unavailable`; no cambian los archivos originales. Los tests y la
geometría demo usan ese lector de fixtures, nunca el pipe productivo.
Contrato, relojes, límites y conexión con #1653:
[`session-alerts-contract.md`](../../docs/telemetria/session-alerts-contract.md).
