# ISA-1255 — lectura exacta de una revisión sin fuente

## Problema reproducido

El repositorio ya conservaba revisiones inmutables y Export podía seleccionar
una referencia completa, pero `open` exigía `draftId`. El RED guardó A, avanzó
el borrador y la revisión a B, reabrió el repositorio e intentó abrir A por JSON;
el bridge respondió `invalid_command (draftId)`.

## Solución mínima

La operación `open` existente acepta exactamente un `draftId` o un
`RevisionRef`. Para la referencia busca igualdad completa, incluido el hash, y
devuelve el `Result.Revision` ya existente. No usa Export como envoltorio, no
consulta telemetría, no escribe y no sustituye por la revisión más reciente.

La prueba acredita A con su payload exacto tras la reapertura, B mediante el
selector legacy, ausencia de mutación y rechazo de hash discordante, revisión
ausente o selectores ambiguos.

## Límite

Es una capacidad del bridge Go. T14 continúa con el cliente y la vista de
Revisiones, además de la recuperación duradera de comandos tras reiniciar. No
demuestra todavía consulta histórica desde la UI ni cierra A15.
