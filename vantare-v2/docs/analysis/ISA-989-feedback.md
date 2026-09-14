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

## Resumen por queja

| # | Resultado en la rama candidata |
|---|---|
| 1 | Track Map ya admitido en esta base; nueva prueba de persistencia y revisión. |
| 2 | ACK equivalente deja Studio limpio aunque Go reordene claves JSON. |
| 3 | Relative Crystal respeta campos admitidos, ancho, orden y alineación; Última vuelta conectada. Intervalo/Vuelta independientes no existen en su contrato actual. |
| 4 | Cambiar filas de Standings Crystal ajusta altura persistida; mínimo existente 240px. |
| 5 | THR/BRK/CLU usan el color configurado también en la etiqueta. |
| 6 | Trail conserva ceros del embrague, Dense incluye su canal y tiene espacio visible. Bloqueo de fuente temporal no reproducido. |
| 7 | Marcha -1 = R, 0 = N y valores desconocidos = guion. |
| 8 | Retirado falso corte a 6k; escala explícita 0–10k y RPM numéricas reales. El corte real necesita dato de motor no disponible en el contrato. |
| 9 | Filtros Relative usan controles Orbit legibles. |
| 10 | Tablas Crystal con mayor tipografía y filas; comprobadas a 340/420/520px. |
| 11 | Dense/Capsule/Blade reservan ancho para pedales y gráfico; nueve combinaciones verificadas. |
| 12 | Head-to-Head contiene filas y usa proporción segura 360:128. |
| 13 | Solo Track Map: fondo transparente, marcadores mayores, leyenda de clases y jugador. |
| 14 | Multiclass explica clasificación y referencia; filtro otras clases funcional y divisores visibles. Preferencia estética requiere aceptación humana. |
| 15 | Broadcast se mantiene como franja de clasificación; gap al líder y estados sin dato explicados. |
| 16 | RPM neutras, sin luces rojas falsas ni sombras exteriores en cápsulas. No se simula aviso de corte. |
| 17 | Delta Endurance expone color de pérdida en apariencia; opacidad original conservada. |
| 18 | Head-to-Head identifica rivales de clasificación y gap respecto a ti; sin fallback al líder. |
| 19 | Delta Advanced sustituye B/S/T/L por etiquetas y referencia efectiva; respeta ocultar campos ausentes. |

## Cambios observables y comprobación manual

1. Abrir una copia del perfil del tester en Studio, editar y esperar el guardado;
   cerrar/reabrir y verificar valores. Probar error/conflicto y undo/redo.
2. Activar/desactivar columnas y cambiar anchos/alineación; pasar Standings de
   20 a 5 filas. No activar once columnas a 340px esperando nombres completos:
   esa composición necesita mayor anchura o menos campos.
3. Head-to-Head antiguo 360×304 se conforma a 360×128; 720×96 a 720×256.
   Verificar posición/ancho preservados y resize proporcional.
4. En HUD/LMU: R/N/avance, tres colores, trail continuo de tres canales y RPM
   comparadas con el coche. La escala no es una alerta de cambio de marcha.
5. Comprobar Track Map transparente con clases reales, comparaciones con datos
   ausentes y color Delta guardado. Valorar legibilidad sobre pista y DPI reales.

Se conserva `WidgetVisualHost`, sin dependencias nuevas ni nuevas fuentes.
Cambios productivos, tests y documentación repartidos en commits por ISA-989–992.

## Validación final del conjunto

- `pnpm --dir frontend exec vitest run --maxWorkers=1`: **438 archivos,
  3342 tests PASS**, exit0, 434,79s. Aparece AbortError de teardown happy-dom;
  la suite final termina sin tests fallidos ni error de salida.
- `go test ./...`: PASS, incluido disco temporal de Track Map. Ejecutado tras
  build frontend para disponer del dist embebido.
- `pnpm --dir frontend run build`: PASS (typecheck real tsc-b y Vite).
  Aviso de chunks mayores de500kB, sin error de build.
- `pnpm --dir frontend run lint`: PASS.
- Chromium integrado: tablas y Head-to-Head incluidos en suite; Track Map
  320×220/640×440; script instrumentos pasa nueve tamaños/variantes con
  historial no vacío y tres trazas visibles, más Compact260×92.
- Gate local `validate_issue_contract`: PASS para el único ID modificado
  `milestones:overlay-tester-feedback`. Artefacto generado desde origin/nightly.
- `git diff --check`: PASS. Checkout principal conserva los dos JSON modificados
  y sus entradas no versionadas; ningún archivo ajeno se incorporó.

Entrega: PR borrador [#993](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/993),
rama `vantareapp/isa-989-feedback-tester`, base `659b2c57`.
No merge/promoción/release. Los checks locales anteriores no equivalen a CI
remoto completo ni a aceptación física Wails/LMU, que permanece pendiente.
