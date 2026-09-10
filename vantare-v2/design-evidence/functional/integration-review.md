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
