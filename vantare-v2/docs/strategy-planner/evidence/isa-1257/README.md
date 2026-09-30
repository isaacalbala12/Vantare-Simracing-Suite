# ISA-1257 — cliente de apertura exacta de revisiones

## Problema reproducido

El bridge Go ya podía abrir una revisión por su referencia completa, pero el
cliente TypeScript sólo tipaba `open` con `draftId` y aceptaba cualquier
revisión válida correlacionada por `commandId`. Una respuesta con otra revisión
íntegra podía resolver la petición equivocada.

## Solución mínima

La operación `open` del cliente acepta exactamente un `draftId` o un
`RevisionRefV1`. Cuando se pide una revisión, la respuesta debe contener un
documento cuya firma sea válida y cuyos `planId`, `variantId`, `revisionId` y
`contentHash` coincidan con la referencia solicitada. La ausencia o cualquier
diferencia falla cerrada. La apertura por borrador conserva el contrato previo.

Las pruebas cubren apertura exacta sin `draftId`, respuesta válida pero distinta,
respuesta sin revisión y el recorrido legacy. El test de ciclo de vida sólo
estrecha el nuevo selector antes de construir su borrador simulado.

## Límite

Es capacidad del cliente, todavía sin vista de historial del plan. T14 continúa
con esa vista y con la recuperación duradera de comandos tras reiniciar. No
demuestra consulta histórica en Wails ni cierra A15/A16.

## Verificación local

- Focales del cliente y ciclo de vida: 72/72.
- Suite frontend: 448 archivos y 3830 pruebas.
- Typecheck, ESLint, auditoría i18n y build de producción: correctos.
- Suite documental: 137 pruebas; digest del roadmap regenerado y estable.
- Revisión Astra read-only: 9/10 de sencillez, sin P0–P2.

El build conserva el aviso previo de dos chunks mayores de 500 kB. No se abrió
la app ni se ejecutaron Wails, LMU o DuckDB.
