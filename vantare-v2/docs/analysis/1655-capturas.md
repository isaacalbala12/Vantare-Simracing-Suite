# #1655 / VANTA-82 · Capturas seguras y en lote

El modo captura de Hub, Workshop y overlays crea un único HWND oculto fuera de
todos los monitores, sin activar y sin barra de tareas. Se comprueba su rectángulo
antes de presentarlo; los binarios QA tampoco crean consola. No hace falta
`VANTARE_CAPTURE_OFFSCREEN` ni mover ventanas después de aparecer. La imagen sale
de `PrintWindow` del HWND propio. Esta revisión de GPUI no expone lectura de textura
en el binario normal: mantener su renderer real es la ruta más sencilla y fiel.

El manifiesto, los comandos individuales compatibles, los scripts y los recibos
incrementales se describen en [native/README.md](../../native/README.md#capturas-sin-ocupar-la-pantalla-1655).
Los recibos comparan entradas y contenido PNG. La escena QA heredada
`calendario-beta-prueba` añade su reloj real al hash; las demos congeladas
conservan el caché. Alterar la escena, ajustes,
dimensiones, apariencia, ejecutable, DLL, fixtures o PNG obliga a recapturar.

## Método y fuentes

Medición Windows, binarios `dev` de las fuentes disponibles de las ramas de referencia.
Antes significa una invocación segura del mismo renderer por imagen; después,
un manifiesto en una ejecución. No se ejecutó el capturador antiguo que activaba
ventanas. Se aísla el coste de los relanzamientos y se excluye la antigua
sobrecarga PowerShell del Hub. Los recibos se invalidan para las pasadas completas; la repetición incremental
conserva el caché. No se lanzan builds propios durante la medición. Otros workers
compilan en el mismo servidor; son tiempos observados con carga variable, no una
comparación de CPU aislada. Los 52 controles de calendario anteriores al reinicio
T3 se verifican por hash y se reanudan únicamente los dos restantes.

La primera pasada detectó un viewport GPUI antiguo tras `SetWindowPos`: se
conserva y descarta como resultado final. El lote final añade `bounds_changed`
y valida el tamaño de pintura; el resto del renderer y de las entradas coincide.
Los JSON guardan por separado SHA-256 de los binarios de antes y después.
La corrección también elimina bandas blancas de 16 px a la derecha y 8 px abajo
en ocho controles individuales a 1440. Sus tiempos se conservan, sus píxeles
no se presentan como referencia válida del nuevo viewport.

- Base de implementación: nightly `4651797cb6cb7abb0e26ff7d1e4ff6bbeadc07e1`.
- Calendario: 54 PNG de `1634-r3/nat`, 27 vistas a 1280×800 y 1440×900;
  código `97a0d76747b76b9ffbb6d6068f9c18e020b5b8cf`.
- Widgets: 236 PNG de `1629-r3`, 168 variantes y 68 estados canónicos de 17 widgets;
  código `f8b9ede8ec7f3e70ffc78f3d718a630b58f4b7f6`.
- Las features de esas ramas no se importan a esta entrega. Las fuentes de
  validación se guardan en el target ignorado del worktree, con targets propios
  `C:/VantareServer/targets/1655/calendar` y `widgets`, separados del producto.
- Dos fuentes sin commit del calendario se congelaron con hashes en
  `reference-source-calendar.json`. El código disponible había evolucionado
  después de algunas PNG; no se alteraron las referencias.
- El selector QA de #1634 recibe `parameters.calendar` mediante el parche
  `native/hub/reference/tools/calendar-batch-1634.patch`, comprobado con
  `git apply --check`. Al integrar esa rama, hay que aplicar el adaptador.

El observador externo registra creación/presentación/posición/foco con
`SetWinEventHook` y `EnumWindows`. Cada proceso usa `CREATE_NO_WINDOW` y verifica
los monitores. Las ventanas contadas en la tabla son HWND de captura; los
auxiliares internos ocultos de Windows también constan en la traza. Se detiene
el ensayo si una ventana propia se ve en un monitor o recibe foco.

## Medición

| Serie | Individual (s) | Lote (s) | Incremental (s) | Procesos / HWND antes → lote → incremental |
| --- | ---: | ---: | ---: | --- |
| Calendario · 54 PNG | 1682.88 | 345.04 | 4.05 | 54/54 → 1/1 → 1/0 |
| Widgets · 236 PNG | 958.50 | 250.57 | 3.61 | 236/236 → 1/1 → 1/0 |

Cero ventanas propias visibles en un monitor y cero foco en todas las pasadas.
Los incrementales omiten todas las imágenes y conservan sus mtimes. Calendario
usa (-3328,0,-2048,800) y (-3488,0,-2048,900); widgets
(-4352,0,-2048,1440). Las trazas comprueban creación oculta, NOACTIVATE y
TOOLWINDOW antes de presentar, además del rectángulo/foco durante el ensayo.


## Paridad

Comparación RGBA píxel a píxel, sin umbral, máscaras, reescalado ni regeneración
de referencias. Se comparan las invocaciones individuales con el lote y ambos
con las PNG existentes. Los JSON registran por imagen tamaño, píxeles distintos,
diferencia máxima por canal y rectángulo afectado.

| Comparación | PNG idénticas | Mismo tamaño | Observación |
| --- | ---: | ---: | --- |
| Calendario individual → lote | 23/54 | 54/54 | 23 con diferencia máxima 1; ocho controles con viewport antiguo |
| Widgets individual → lote | 126/236 | 236/236 | Diferencias máximas por canal ≤2 |
| Calendario histórico → lote | 10/54 | 54/54 | Diferencias de referencia descritas abajo |
| Widgets histórico → mismo Look | 105/236 | 236/236 | Aspecto Vantare explícito en 29 casos |

El control de resize 1280→1440→1280 coincide exactamente (0 píxeles distintos en
las tres imágenes). En los ocho controles antiguos del calendario con viewport
1424×892, el 100 % de la franja derecha de 16 px y de la inferior de 8 px era
blanco. El lote final pinta el cliente completo de 1440×900. El JSON
`calendar-before-viewport-audit.json` conserva la comprobación y su comparación
con cada referencia histórica, sin borrar los controles defectuosos.

En widgets se mantiene el default histórico Eficiencia del CLI individual.
Las referencias de Fuel/Pedals usaban Vantare: 29 discrepancias de dimensiones
eran de apariencia. Se repiten esas 29 entradas con `designSystem: "vantare"`,
sin modificar las referencias ni el lote medido; los otros 207 candidatos son
los del lote final. Comparación completa: `parity-widgets-matched-look.json`.

Las referencias de Calendario no corresponden todas al mismo estado del código:
30/54 coinciden o solo varían ≤1 por canal; cuatro adicionales varían ≤3.
Los cambios de paleta de `chrome.rs` (`#D80000` → `#E14A54`, diferencia azul 84)
y del gradiente/hero explican las diferencias mayores de 19 imágenes; se
conservan las fuentes/diff/hashes usados. Una referencia, `1280-22-serie.png`,
contiene 1.022.720/1.024.000 píxeles negros y una fila gris: no muestra la vista.
No se regenera ni se considera paridad aceptada esa referencia defectuosa.

En Banderas, el commit previo `48d7b8898` cambia el damero de 3×4 a 5×6,
añade la franja azul y contextualiza los textos de clasificación/fin de carrera.
Las seis diferencias grandes de Banderas pertenecen a esos símbolos/textos,
ya presentes en la rama de widgets usada para validar; no son cambios de #1655.
Delta Trace conserva geometría y datos: en p00/race varían 433 píxeles, 432
con diferencia ≤2 y uno (201,98) hasta 39 en el borde del trazado. La lectura
antigua pasaba por el escritorio/DWM; ahora se lee el HWND. La atribución de ese
píxel al rasterizado/composición es una inferencia; no se afirma igualdad exacta
con ese PNG histórico. El control individual → lote del renderer actual permite
comprobar por separado que el lote no altera la escena. Los demás residuos
pequeños se registran como redondeo de rasterizado/alfa, sin tolerancia que los
oculte. No se afirma paridad histórica total: los residuos quedan para revisión.


## Comprobaciones

Repetidas tras fusionar nightly `9e48eb86f` (merge `563262ad2`); logs
`post-merge-*.log`, `final-verified-*.log` y sus JSON. La última base
nightly `354c207aa` se fusiona como `01b067766`; `git diff d0444395a HEAD -- native/`
confirma cero cambios nativos en ese tramo (registro de equivalencia adjunto).
No se repiten builds por cambios exclusivos de otras áreas. Captura se valida además sobre
las fuentes de referencia fijadas arriba, sin importar sus features al producto.

- `cargo fmt --all -- --check`, y formato del vendor GPUI: PASS.
- Clippy `--workspace --all-targets -- -D warnings`, con defaults de producto
  conservados y DuckDB oficial según `gates.ps1`: PASS.
- Nextest Hub/UI habitual: 791/791 PASS, 8 skips existentes.
- Nextest con captura, sin fail-fast: 802/804 PASS, 8 skips. Fallan dos tests
  previos de Track Map en `app.rs` y `demand.rs`, también registrados en 1629-r3:
  `new_samples_with_unchanged_values_request_no_repaint_without_histories` y
  `requested_photos_preserve_every_default_widget_projection`. No se modifican.
- Las nueve pruebas focales de captura pasan, incluidas cinco nuevas de manifiesto,
  recibos, preview externo, reloj QA y posición con múltiples monitores.
- Clippy con captura: FAIL por 18 avisos previos en `analysis/view.rs` (QA de
  #1648) y los brazos duplicados del selector antiguo de `calendar.rs`. Ningún
  aviso nuevo de la herramienta; el log completo se conserva.
- Lifecycle workspace: PASS, cero fallos.
- Sintaxis PowerShell de los ocho scripts modificados: PASS.
- Retirada y calidad: 462 archivos fijados PASS. Los cinco scripts originales
  y el README histórico siguen archivados byte a byte como `.txt`, con sus hashes
  originales; no se cambia el verificador ni se recalibran baselines.
- Telemetría omitida: no se cambia runtime/domain/ipc/testdata. La captura Win32
  se valida en Windows con DPI 96; no se afirma captura Linux/macOS ni DPI mixto.

Los gates se ejecutan por `compilar.ps1`, un job cada vez, con target propio.
En la reanudación se fija `VANTARE_CARGO_MIN_GB=0` por orden del orquestador;
los intentos iniciales usaron umbrales locales de 2,5/1,5 GB. No se modifica la
configuración del servidor. Se
conservan los intentos fallidos: PATH de DuckDB del harness corregido, primer
build de referencia sin `network`, intento descartado de reutilizar target entre
copias y parada de fail-fast. Los ensayos definitivos usan fuentes/targets
separados, PATH correcto y todos los tests ejecutados.

## Entrega y evidencia

Implementación: rama `vantareapp/isa-1655-capturas`; motor medido `d32f82dc4`,
desde nightly `4651797cb`. La publicación es un PR draft a nightly para revisión
del orquestador; el PR, HEAD final, estado de CI y tarea Plane se registran en
la issue [#1655](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1655)
y en el [handoff vivo](../vantare-program/handoffs/overlays-launcher-hub.md).
Después de medir se añadió el hash del reloj de una escena QA antigua y se
alejaron las ventanas ocultas de dos tests del perfil; no cambia el pintado
de las vistas medidas. Código de esos ajustes: `399f670ce` y `d0444395a`.
No hay nuevas dependencias. Falta aceptación visual de las referencias que
ya difieren, aplicar el adaptador al integrar #1634 y validar otros DPI/plataformas.
No se abre una ventana interactiva normal para comprobarla: el encargo prohíbe
ventanas visibles. La seguridad y renderización QA sí se han comprobado fuera
de pantalla en Windows/DPI 96.


Evidencia externa: `C:/VantareServer/evidence/1655/`, incluidos manifiestos,
referencias congeladas, binarios/hash, `benchmark-calendar.json`,
`benchmark-widgets.json`, `logs/`, `final-*.log`, `pe-subsystems.json`,
`validation-sources.json`, el parche y las dos fuentes congeladas. Se fusiona `origin/nightly@9e48eb86f` en la rama propia (`563262ad2`), por
orden del orquestador; después `354c207aa` mediante `01b067766`, sin cambios
nativos adicionales. Sin merge del PR a nightly, promoción de canal, release,
despliegue ni acciones de cuenta/datos reales.
