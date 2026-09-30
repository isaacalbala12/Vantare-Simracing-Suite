# ISA-1074 — custodia escalar

Base9b4df895, rama vantareapp/isa-1074-correction-custody, worktree C:/tmp/vantare-isa1074.
Cinco Go nuevos: corrections_store, corrections_document, lease Windows/Unix y tests.
RED inicial API ausente; RED real en confirmación perdida del primer backup;
GREEN tras clasificar commit incierto y probar replay de candidato duradero.
Reapertura, historia/restauración, conflictos, replay antiguo, corrupción/backup,
revisión perdida, cancelación, lease, dos escritores, manipulación y cuota probados.
Gofmt, paquete Analysis, vet, build frontend y go test ./... sobre código final pasan.
Compilación de tests Analysis GOOS=linux pasa; no ejecución Linux ni prueba de pérdida
física de alimentación. Backend todavía no conectado al bridge o UI.

Save debe recibir base/observaciones de la autorización vigente de Analysis;
Load también requiere esa autorización en el servicio. Hashes son integridad, no permisos.
Reintentos se resuelven bajo lease antes de expectedRevision/validación de originales;
preflight acota representación. Un ID perdido no se sustituye por backup más antiguo.
La restauración usa un nuevo snapshot completo; conserva revisiones referenciadas.

Revisión personal completada: errores, cuotas, copias, concurrencia, replay e I/O.
Originales/LMU intactos. Sin dependencias nuevas ni cambios de lockfile.
Sin push, PR nuevo, CI remoto, merge o release. Siguiente C3/vista efectiva y conexión.
