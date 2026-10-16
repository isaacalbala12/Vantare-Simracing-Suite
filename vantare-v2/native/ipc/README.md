# ipc — fotos versionadas

DTO explícito, transporte autenticado y demanda; la versión de foto es independiente de servicios y control.

VANTA-83/#1661: `BillingProduct::Founders` en servicios v10 y
`CatalogAccess::Founders` en control v5. Las fotos usan v11 en esta rama (#1638). Los componentes
del conjunto se recompilan juntos; no negociar silenciosamente el plan con peers antiguos.

## #1562 · Ocultar fuera de pista

DTO v10 añade `state.driving_situation` a fotos completas y parciales, también
con demanda vacía. Campo ausente se lee Unknown; valor desconocido se rechaza.
En la entrega original el pipe live admitía v10; #1638 lo eleva a v11.
Los lectores guardados aceptan v7/v8/v9/v10/v11
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
