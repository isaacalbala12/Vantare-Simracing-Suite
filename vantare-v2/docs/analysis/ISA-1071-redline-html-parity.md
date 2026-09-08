# ISA-1071 — copia del HTML aprobado en el renderer React

## Actualización: Tower Preview seleccionable (2026-09-08)

Isaac acepta la cabecera **actual**, selección roja sin línea y alpha .95.
El catálogo añade `standings-endurance-redline-tower`, sin sustituir defaults
ni migrar perfiles. `WidgetVisualViewport` usa base 482 y el marco persistido;
el renderer reserva filas completas. V2 aporta pista, total y posición de
clase; consume dorsal solo si viene en el contrato, no lo genera.
Fabricante/dorsal no emitidos por Core quedan pendientes en **ISA-1072**.

Preview mantiene columnas fijas y no anima. El inspector lo declara, conserva
las configuraciones previas y permite ajustar filas; al volver al clásico se
recuperan sus controles. No se certifica todavía el contrato modular completo.

Evidencia nueva: 32 tests focales PASS. Test Chromium con cuatro anchos
280/340/482/650 contiene once filas con aviso largo y gaps `+12345.7`, sin
invadir nombres ni cortar filas. CUA verifica Desktop/OBS en 313x707:
doce filas de referencia completas, cero overflow, cabecera `current`.
El escenario V2 separado muestra siete Hypercar y ninguna marca inventada.
Estas comprobaciones son navegador/fixtures, **no Wails ni LMU físico**.

La primera suite completa tuvo cuatro timeouts Chromium al ejecutarse junto
al build y dos caracterizaciones que necesitaban reflejar el catálogo y los
campos aditivos. La repetición limitada a dos workers pasó 422 archivos y
3331 tests, con un fallo del selector Workshop corregido después (32 focales
verdes). La ejecución final con cuatro workers pasó **424 archivos, 3333
tests y 2 omitidos**, exit 0. No se ocultan los fallos previos ni se cambian
timeouts/aserciones de contención. Typecheck, build, lint y digest PASS.
Dist no contiene las identidades del fixture ni su aviso de referencia.
Recursos del HTML: trazabilidad/licencias para distribución pendientes.
Revisión Muse Spark 1.3 Contributor xhigh, solo lectura sobre `d8efd680`:
sin P1; apto para PR draft. Se atienden dos observaciones menores con `trim()`
en `data-session-mode` y aclaración del dorsal opcional: el gap del productor
Core se conserva hasta que realmente lo emita (#1072). La suite completa
anterior acredita `d8efd680` más el texto de roadmap corregido; el ajuste final
de normalización se verifica con las pruebas focales y CI de la PR.
No hay merge, promoción ni release; el historial de abajo describe el estudio.

## Alcance y estado

Isaac solicita reproducción 1:1 tras rechazar la tabla compacta restilizada.
Entrega local aislada, no promoción ni aceptación visual implícita.
Rama `vantareapp/isa-1071-workshop-redline-lab`, base/HEAD
`b6b5754eee059bc239fce18c08b39adae8c553fa`, worktree `C:/tmp/vantare-isa1071`.
No commit, push, PR, CI remoto, merge ni release de este corte.

## Copia y frontera de datos

- El HTML aprobado es `redline-taste/redline-tower.html` del estudio visual
  de 2026-09-08. La composición se implementa en `StandingsRedlineTower.tsx`
  y `standings-redline-tower.css`, dentro del renderer Endurance existente.
- No iframe, captura de la tabla como fondo, duplicado del renderer para
  Workshop ni pipeline alternativo. Nombres, posiciones y tiempos son DOM.
- Los emblemas y wordmark anterior conservan los sprites raster originales;
  las cuatro fuentes y el PNG son copias binarias del HTML. Ver procedencia
  en `standings/tower-assets/README.md`. No son nuevos logotipos oficiales.
- `WidgetVisualHost.authoringModel` acepta el fixture solo con `DEV=true` y
  tipo coincidente, sin omitir los checks de fuente V2. Producción lo ignora.
  El fixture reside en authoring, separado de la telemetría real.
- Campos opcionales puros de presentación: `manufacturer`, `trackName`,
  `totalRows`. La proyección real que aún no los provee no los inventa.
- El estudio Tower es opt-in y estático, igual al HTML. La tabla clásica
  conserva layout, datos, columnas y animaciones previas. Las animaciones y
  columnas intercambiables de la nueva composición siguen pendientes.

## Verificación de navegador (2026-09-08)

Comparación directa de tabs 5238/HTML y 5240/React, por CUA. Se normaliza
únicamente la escala de presentación para medir en píxeles del widget.

| Elemento | HTML y React |
|---|---|
| Torre | 482 × 1087 |
| Cabecera | 99 px |
| Categoría | 38 px |
| Filas 1–12 | 73,71,72,73,73,73,73,74,76,74,74,76 px |
| Primera fila | x=1, y=138, ancho=480 |
| Kobayashi | x=1, y=573, ancho=480, alto=73 |
| Pie | x=1, y=1020, ancho=480, alto=67 |
| Reloj de firma | x=352, y=46, ancho=104.97, alto=36.44 |
| Fondo | rgba(16,23,27,0.95) |

Se contrastaron 74 nodos por combinación: reloj, todas las filas, posiciones,
marcas, dorsales, nombres, gaps y pie. Las **16 combinaciones** (firma/sesión/
compacta/original × luz/marco/placa/original) coinciden en geometría redondeada
a 0.01px, texto, tamaño/peso/interlineado, color, fondo y padding inspeccionados.
Auditoría adicional de cabecera/firma/categoría: geometría, tipografía y fondos
coincidentes; familias CSS renombradas con los mismos binarios.

Dos instancias simultáneas Desktop/OBS tienen clips únicos y locales,
12 filas, el mismo tamaño y la misma transparencia. La fila de luz no crea
pseudo-línea lateral. Se inspeccionaron capturas completas, incluyendo pie.
Esto **no es un diff automatizado de todos los píxeles**, ni prueba Wails/LMU.

## Checks

- Typecheck y build frontend: PASS en la revisión de composición.
- 42 tests focales: PASS tras corregir la escala del contenedor sin cambiar
  el test anterior. Incluye rechazo de fixture en producción, datos V2 sin
  identidades inventadas, 12 filas, reducción a 11 filas completas y clips.
- La igualdad de markup normaliza solo el token de `useId`; se comprueba
  además que los IDs no colisionan y que cada referencia apunta a su clip.
- Suite completa final: **422 archivos PASS; 3324 tests PASS y 2 omitidos**,
  exit 0. Lint PASS; typecheck/build PASS. `git diff --check` PASS.
- Avisos no ocultados: AbortError de teardown happy-dom con resumen final
  verde y exit 0; chunks grandes en build. Un fallo inicial del test de escala
  se corrigió en el código conservando la aserción original.
- Verificado en dist: sin fixture `reference-12`/`KOBAYASHI`, aviso de
  referencia ni circuito del Workshop. Fuentes/sprites sí se empaquetan como
  recursos del renderer (aproximadamente 2.34 MB sin comprimir).
- No Go ni mediciones de rendimiento: no se modifica Telemetry Core ni se
  certifica rendimiento con un fixture de diseño.

## Archivos

Renderer: `StandingsRedlineTower.tsx`, CSS y assets nuevos;
`StandingsEndurance.tsx`, `StandingsRedlineTemplate.tsx`, settings, layout,
tokens, renderer-helpers y ViewModel. Host: `WidgetVisualHost.tsx`.
Workshop: ruta, query, CSS, circuito externo al widget, fixture explícito y
tests `redline-lab`/`workshop-runtime-parity`. Docs: este informe, handoff,
plan y digest generado.

## Cómo revisar

En Workshop, Standings → Endurance Redline → **Aplicar estudio azul · luz
roja**. Preset 482 × 1087, escala de pantalla 0.65, 12 pilotos de referencia.
Cambiar cabecera/selección/fondo/opacidad; Comparar con OBS permite comprobar
dos instancias. Seleccionar «Escenario V2» devuelve los datos existentes, sin
fabricantes o dorsales ficticios. No guarda perfiles.

Pendientes: aceptación visual de Isaac; fuentes reales de los metadatos;
columnas modulares; adaptación de animaciones y validación física. No se
declaran resueltos mediante esta comparación estática.
