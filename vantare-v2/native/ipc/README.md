# ipc — fotos versionadas

DTO explícito, transporte autenticado y demanda; la versión de foto es independiente de servicios y control.

## #1562 · Ocultar fuera de pista

DTO v10 añade `state.driving_situation` a fotos completas y parciales, también
con demanda vacía. Campo ausente se lee Unknown; valor desconocido se rechaza.
El pipe live solo admite v10; los lectores guardados aceptan v7/v8/v9/v10
sin reescribir originales. Servicios y control mantienen sus versiones propias.
Ver [contrato y señales](../runtime/README.md).
