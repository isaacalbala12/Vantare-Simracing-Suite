# Revisión de integración Functional — 2026-09-10

Revisión independiente de lectura sobre un snapshot aislado de ISA-1083,
base b6b5754eee059bc239fce18c08b39adae8c553fa. El reviewer no modificó código.

## Hallazgos y cierre

1. P2: Signature recortaba la cabecera con Posición → GAP → Piloto.
   Corregido: solo se integra en el prefijo si contiene Piloto y suma al menos
   238 px. La misma decisión reserva altura para la cabecera independiente.
   Incluye el caso Piloto estrecho → GAP con clase HYPERCAR.
2. P2: S/M/L no cambiaban varias columnas. Corregido: añaden espacio sobre
   mínimos legibles y comparten el cálculo entre renderer y marco, incluido Piloto.
   Auto conserva las dimensiones de la exploración visual aceptada.
3. P2: crecer de 420 a 670 px junto al borde inferior ocultaba filas.
   Corregido: normalización vertical compartida en Studio, Desktop/OBS, preview
   DOM y movimiento confirmado; usa el viewport del documento, no un 1080 fijo.

Veredicto final del reviewer: **sin hallazgos bloqueantes** en el corte revisado.
Las tres observaciones quedan cerradas. No encontró otros bloqueantes en
persistencia, registro, catálogo o frontera compartida de renderizado.

## Evidencia y límites

- RED de cabecera/borde inferior: C:/tmp/vantare-isa1083-review-red.log.
- GREEN tras correcciones: 166 tests; ajuste final de cabecera: 22 tests PASS.
- Suite completa tras los primeros fixes: 424 archivos, 3345 PASS, 2 omitidos,
  exit 0. El ajuste final añade un caso y tiene validación focal posterior.
- Inspector normal del harness Orbit: elegir Functional, ocultar Posición,
  Número y Última vuelta; Piloto estrecho → GAP y HYPERCAR. Chromium confirma
  cabecera fuera de la celda, clientWidth/scrollWidth 340/340; reloj 63/63.
  No se fuerza un perfil ni se accede a estado interno de React.
- Guard visual: los mismos tres fallos Endurance en la base limpia y la rama.
  Logs C:/tmp/vantare-isa1083-base-design-guard.log y -final-design-guard.log.

Revisión estática y navegador con fixtures: no certifica Wails/LMU físico,
rendimiento, CI remoto ni integración a Nightly. Esos estados se registran
en las issues #1083 y #1098.

## Nomenclatura Efficiency — 2026-09-10

Decisión de Isaac: un sistema Efficiency, Eficiencia en español, con estilos
Signature y Broadcast. IDs y URLs conservados; no se migran documentos.

Revisión independiente incremental en el mismo snapshot aislado:
- P2 reproducido: Orbit mostraba los nombres históricos al reabrir perfiles.
- Corregido: nombre actual del catálogo solo para procedencia oficial compatible
  en tipo, sistema y versiones. Los nombres de usuario y selecciones desconocidas
  se conservan. Resúmenes y cabecera del inspector comparten esta resolución pura.
- Cierre del reviewer: sin hallazgos bloqueantes. No editó la implementación.

Regresiones: cuatro etiquetas localizadas fallaron antes de la corrección; dos
casos de procedencia histórica fallaron antes del resolver. El conjunto focal
posterior pasó 31 tests, incluidos los nombres de usuario y sistemas incompatibles.
Logs locales: `C:/tmp/vantare-isa1083-naming-red.log`,
`C:/tmp/vantare-isa1083-naming-provenance-red.log` y
`C:/tmp/vantare-isa1083-naming-provenance-green.log`.

Suite completa final: **424 archivos, 3356 PASS, 2 omitidos**, exit 0
(`C:/tmp/vantare-isa1083-efficiency-final-tests.log`). Lint final PASS
(`C:/tmp/vantare-isa1083-efficiency-final-lint.log`). El aviso AbortError de
teardown de happy-dom permanece visible en el log, sin fallos de suite.

Workshop verificado en Chromium: Eficiencia, Estilo, Signature y Broadcast;
alternancia funcional conservando URL/IDs y regreso a Signature.

Build canónico `wails3 task build`: PASS, incluye frontend/typecheck y binario
Windows. Artefacto local: `C:/tmp/vantare-isa1083/vantare-v2/bin/vantare.exe`,
SHA256 `F1240EFDD4B3AE4D57D3E9A4B0404A044451FF71FAA5272D01780E4438EE3653`.
Sin configuración de servicios añadida, sin lanzamiento de la app ni release;
no certifica autenticación, licencia real ni la prueba física de Studio/Desktop.
Se conserva el warning de chunks grandes y el aviso del generador de bindings
sin paquetes Go en la raíz. El cambio incidental de clasificación en go.mod
producido por tidy se descartó: ninguna dependencia cambió.
