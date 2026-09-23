# Pantalla funcional de Engineer — VAN-752 / #1336

Tarea: [VAN-752](https://app.notion.com/p/3e4e51695c6581a9a63bcf66960e60bc).
Proyecto: [Engineer / Spotter](https://app.notion.com/p/3dae51695c65811a8485ca41bc5c9a8e).
Base: nightly `8b25d076ea9a6ba6be8dc3065bcde978b6d24f07`.
Rama: `vantareapp/isa-1336-engineer-test-ui`.
[Diseño y alcance](../engineer/test-ui-1336.md).

## Resultado

Se reconstruye la pantalla Engineer existente. Todos los controles visibles
escriben preferencias reales; una respuesta correlacionada distingue cambio
guardado, rechazado, aplicado sin persistir y ausencia de confirmación. No se
muestra éxito por el mero envío del evento. Las consultas cada segundo se
cancelan al desmontar la pantalla; tras cuatro segundos sin respuesta, los
controles quedan pausados. Los errores del runtime se muestran sin filtrar
rutas locales al informe. La preferencia de subtítulos y el bloqueo visual por
rendimiento se muestran por separado.

Se retira la voz WebView y su volumen local sin efecto sobre la radio. El tono
WAV temporal y la frase Spotter cacheada usan el mismo AudioPlayer Go que el
producto, con Engineer desactivado y exclusión de reproducción concurrente.
Activar Engineer, parar el servicio o cancelar la llamada interrumpe la prueba.
La frase no dispara telemetría ni avanza reglas de Spotter. Caché vacía queda
como tal: no hay nueva síntesis ni descarga.

Las últimas 200 entregas seleccionadas por radio conservan modo de salida,
ciclo, texto, timestamps, ACK, publicación visual y estado de consulta/reproducción
audio. La configuración actual no reescribe su resultado histórico. Una entrega
cancelada antes del player queda como no intentada. Se filtra por ciclo/familia;
la exportación conserva todos los registros retenidos y exige vista previa
exacta e inmutable antes de descargar/copiar. No hay subida automática.

## Evidencia

- RED público Go previo: Diagnostics/TestAudio inexistentes; GREEN posterior
  cubre caché vacía, éxito/fallo del player, cancelación previa a reproducción,
  cancelación por Enable/Stop/caller, preferencia de subtítulos y límite de 200.
- Tests frontend de página, puente y descarga: estado/error visibles, ciclos,
  configuración histórica, confirmación y fallo al guardar, timeout, polling
  cancelable, prueba del player y copia/descarga del payload previsualizado.
- Typecheck, build y lint: PASS. Auditoría i18n ES/EN/PT/IT: PASS tras retirar
  las claves de la pantalla eliminada; no se modificaron sus reglas.
- Race: service, radio, spotter y app PASS. Vet de esos cuatro paquetes PASS.
- Go global macOS: 4 paquetes fallidos (`cmd/vantare`, `app/launcher`, `server`,
  `recording/sqlite`); se reproducen en un checkout limpio de la misma base.
  Incluyen APIs Windows, prueba de path Windows y fallos de fixtures/permisos
  SQLite. No se ocultan ni se modifican en esta entrega.
- Primer frontend global: 475 archivos PASS, 1 fallo i18n corregido, más una
  excepción de precarga al desmontar `OrbitShell` (código idéntico en la base).
  Repetición con cuatro workers: **476 archivos PASS, 3945 pruebas PASS y 2 omitidas**, sin error no manejado.
- Harness `pnpm --dir frontend visual:orbit-engineer`: PASS a 1920×1080 y
  1280×800, controles reales de la página conectados a respuestas simuladas,
  filtros de ciclo, salidas, tono/cache miss y descarga idéntica al preview.
  Capturas revisadas. **No es prueba de audio Windows ni LMU.**
- GPT-6 Sol: detectó y se corrigió el audio pendiente terminal; re-review de
  corrección, concurrencia y bridge sin otro P1/P2. GPT-6 Luna: PASS acotado de UI/bridge/exportación.

## Hallazgo del gate de duplicación

El ratchet detecta 42 identidades de clon nuevas tras retirar la CSS antigua,
aunque las 10 hojas señaladas (home, kit, launcher, profiles, races, roadmap,
settings, strategy, telemetry y testing) son idénticas byte a byte a la base.
El detector reporta 486 emplazamientos en la base y 478 en el candidato: cambia
cómo agrupa fragmentos existentes. No es duplicación añadida en esas pantallas,
pero **el gate sigue fallando** y requiere tratamiento separado de calidad.
No se restauró código muerto ni se cambió el baseline/reglas para ocultarlo.
Los dos exports señalados por knip sí se corrigen dentro del cambio: knip NEW=0.
El resto de analizadores tampoco añade hallazgos. Seguimiento separado:
[VAN-753](https://app.notion.com/p/3e4e51695c6581a8b409f12fcd1c3f39).
El gate fallido impide declarar la entrega lista para integrar; no impide
probar la rama aislada.

## Prueba manual Windows

1. Compilar/abrir esta rama y entrar en Ingeniero. Esperar estado actualizado.
2. Desactivar Ingeniero y pulsar Probar sonido. Confirmar por oído la salida
   correcta; completado solo describe al reproductor.
3. Probar frase en caché. Si no existe, comprobar que lo indica explícitamente.
4. Activar Ingeniero, Spotter y salidas deseadas. Esperar confirmación de guardado.
5. Entrar a LMU; observar conexión, disponibilidad de Spotter y entregas. Revisar
   texto, ciclo, modo seleccionado, resultado visual/audio y motivos de cierre.
6. Preparar informe, revisar el JSON y copiarlo o descargarlo para comunicar
   cualquier problema. La copia queda disponible si el WebView no descarga.

## Límites y estado

No cambia reglas/timings CrewChief predeterminado ni incorpora T1/T2 sin integrar.
El registro no contiene todos los candidatos suprimidos antes de selección ni
el rollback legacy. Los contadores y latencias internas no miden primer sonido.
El audio sigue cache-only. Persisten validación acústica, LMU físico y paridad
completa. Notion/PR conservan SHA, CI y estado actualizado. Entrega draft;
no merge, promoción ni release en esta tarea. Revertir la PR revierte el corte.

## Corrección adicional autorizada — rechazo de medios ausentes

Isaac autoriza corregir los pendientes de esta entrega. Windows repitió el
timeout de TestPlayerRejectsMissingMedia en run35849145213/intento1 y el
anterior35782437738. El player espera MediaFailed incluso si el archivo no
existe. Se fija el contrato: contexto cancelado prevalece; medio inexistente,
directorio y ruta vacía se rechazan en Go antes de lanzar PowerShell y antes
de interrumpir una reproducción válida. Un archivo desaparecido después de
la comprobación sigue cubierto por MediaFailed/timeout. No se aumenta el
límite de ocho segundos ni se añade una espera.

Contraste previo/posterior CrewChief: se conserva el contrato de fin por evento
y error explícito documentado en [reparación de audio](../engineer/repair-isa-1307.md).
Este cambio valida la entrada local; no modifica reglas ni timings y no
acredita latencia acústica. La regresión exige el error del sistema de archivos
sin PowerShell disponible; las pruebas de eventos y procesos se mantienen.
Resultado Windows y SHA definitivos en Notion/PR.

Regresión previa confirmada en Windows: run35852357505, head2cdc6a1d.
El medio ausente devuelve un error del proceso en vez de os.ErrNotExist;
sin PowerShell, los tres casos fallan porque intentan lanzarlo. Tras la
corrección, la prueba de proceso incluye un archivo existente y comprueba
que rechazar una sustitución inválida conserva el hijo hasta Stop. Compilación
y vet cruzado Windows PASS; revisión independiente sin P1/P2.
