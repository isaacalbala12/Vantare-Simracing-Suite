# ISA-989 — correcciones del feedback de tester

Base: `origin/nightly@659b2c57dc2c7fc75962cc3c8e425ed1289266ec`.
Trabajo aislado en `vantareapp/isa-989-feedback-tester`; checkout principal y sus
cambios ajenos preservados. No implica integración, promoción ni release.

## Guardado y Track Map

- Studio comparaba documentos con `JSON.stringify` sensible al orden de claves.
  Un ACK equivalente serializado por Go podía dejar `dirty=true`. La comparación
  ahora ordena claves de objetos recursivamente y conserva el orden de arrays.
  No cambia el protocolo de revisiones ni oculta errores/conflictos.
- Regresión observada antes del cambio: ACK con claves reordenadas dejaba el
  historial sucio. Después pasan historial y proveedor, incluyendo un ACK de
  guardado que conserva el cambio y elimina pendiente con una sola llamada.
- El tipo `track-map` ya estaba admitido por Go en esta base. Se añade prueba de
  guardado/recarga en disco que conserva tipo, contenido y revisión; no se
  atribuye a esta entrega una corrección preexistente.
- Solo Track Map pasa a fondo transparente. Marcadores mayores, clases del
  contrato V2, leyenda y aro blanco para el jugador. Clase ausente se comunica
  como desconocida; no se añade telemetría ni un renderer alternativo.

## Cortes relacionados

- ISA-990: pedales, trail, marcha, RPM y legibilidad de instrumentos.
- ISA-991: controles y geometría de Relative/Standings e inspector.
- ISA-992: significado, estados y geometría de comparaciones; color Delta.

## Evidencia inicial

- Historial/proveedor: 36 tests pasan; regresión de orden JSON falló antes.
- TrackMap VM/componente: 8 tests pasan; clase/leyenda fallaron antes.
- `go test ./pkg/config`: pasa, incluido round-trip Track Map.
- `pnpm --dir frontend run typecheck`: pasa antes de integrar cortes.

Estas pruebas usan fixtures y disco temporal, no Wails ni LMU. El coche del
tester, su versión exacta y el HUD real requieren comprobación posterior.
