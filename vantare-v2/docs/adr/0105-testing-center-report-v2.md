# ADR 0105: informe v2 del Testing Center

Estado: aceptado para el paso 7a de VANTA-131 (2026-11-03). [Issue #1896](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1896). No autoriza despliegue.

## Decisión

Services envía a `testing-report-submit` un único cuerpo `testing.report.v2` para los tres recorridos: simple, triage y diagnóstico. El contrato contiene un UUID de informe, canal, título, cuerpo, consentimiento, clave de idempotencia y discriminante de variante. La cuenta procede exclusivamente del bearer nativo verificado por Edge. La variante triage lleva contexto y adjuntos redactados; el diagnóstico lleva solo metadatos acotados. Las capturas siguen desactivadas.

Edge valida la forma cerrada, cobra la cuota por cuenta tras autenticar y llama a `testing_report_v2_submit_admitted`. Su implementación privada escribe una sola raíz en `testing_contributions`, más contexto, adjuntos o seguimiento según la variante, en la misma transacción. La pareja cuenta/clave guarda el digest del cuerpo y la raíz: un reintento idéntico devuelve el mismo recibo; un cuerpo distinto se rechaza. El recibo incluye UUID, estado `received`, `idempotent` y fecha.

El constructor puro de Services genera los tres cuerpos. El agente v2 consulta el estado por UUID de `testing_contributions`; sus jobs y callbacks continúan inertes. Admin ya incluye y revisa estas contribuciones mediante `private.native_admin_reports` y `private.native_admin_review_report`; este paso no modifica admin. Edge rechaza los cuerpos de envío antiguos.

## Compatibilidad y retirada pendiente

Las tablas y RPC anteriores permanecen en el esquema para el paso 7b. La lectura y escritura de las filas antiguas por admin se migrará bajo VANTA-132 antes de retirarlas. El código nuevo no escribe en `testing_center_reports`. Se retiraron los adaptadores Edge antiguos tras probar el corpus de los tres cuerpos y buscar llamadores en Hub, web, digest y scripts. El punto final de compatibilidad de datos y el mapeo de IDs se fijarán en 7b con PostgreSQL local y rollback que rechace pérdida de datos.

No se configuraron dispatch, workflow, credenciales, ruleset, despliegue ni producción.

## Secuencia futura de entrega

En un entorno desechable, aplicar primero las dos migraciones y comprobar sus ACL y lectura; después publicar la Edge v2 y el Hub que emite v2 como un corte coordinado. La Edge rechaza binarios Hub antiguos que aún envíen v1. No promover este corte a testers o master hasta que Isaac decida la compatibilidad de esos binarios. Para revertir antes del primer informe v2, volver al Hub/Edge anteriores y ejecutar los `.down.sql` en orden inverso. Con informes v2 o enlaces de agente, los rollbacks rechazan la operación para conservar datos; la recuperación exige una migración de datos revisada, no borrar filas.
