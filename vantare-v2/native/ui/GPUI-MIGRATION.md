# Kit / Pre publicados — VANTA-139

## Resolución y licencia comprobadas

`gpui-kit =0.9.1` selecciona `gpui-pre 0.3.12` y su plataforma Windows
`gpui-pre-windows 0.3.12`. Los paquetes publicados declaran Apache-2.0;
su propietario en crates.io es `huacnlee` (Jason Lee). Kit/Fast enlazan
Longbridge; Pre es un snapshot de Zed, no una publicación oficial de Zed.
Fuentes y versiones: [Kit](https://crates.io/crates/gpui-kit/0.9.1),
[Pre](https://crates.io/crates/gpui-pre/0.3.12),
[Windows](https://crates.io/crates/gpui-pre-windows/0.3.12), manifests y API
`/api/v1/crates/<nombre>/owners` comprobados el 10-nov-2026.

El patch anterior apuntaba a un paquete/origen distintos y no podía resolver
este backend. Se parte del paquete publicado, con checksum del registro, y se
reaplica únicamente el delta de Vantare. Véase
[`vendor/gpui-pre-windows/README.md`](../vendor/gpui-pre-windows/README.md).

## Delta que se conserva

Comparación contra `72d28c32c2ba77a579e1c02f984654518552124b`: seis archivos
de fuente, +230/-16 antes de añadir el nuevo marcador de Present. El historial
original tiene dos commits: vendorizado `f49d71f4f` y capturas `c9a832d70`.
No se atribuyen todos los cambios al segundo commit.

| Parte | Cambios propios portados |
| --- | --- |
| Texto | Span DirectWrite, cobertura grayscale derivada de ClearType, gamma/coverage y test de regresión |
| Presentación | Spans GPU-submit y Present, marcador QPC de Present para medir frames reales |
| Shader | Guardas de alfa cero/sombras, dither solo transparente, tratamiento de ventana opaca |
| Ventana/eventos | Zoom por HWND y sus límites; captura naciendo fuera de monitores sin foco/topmost ni recolocación |

DirectWrite publicó funciones separadas para análisis y capas de color: se
adaptó la cobertura en esas funciones, conservando el código nuevo alrededor.
La captura tiene prioridad y no depende de instrumentación para funcionar.
El patch reproducible incluye manifest, dependencia al diagnóstico compartido
y fuente; no añade un renderizador. La copia antigua queda inerte e identificada.

## Consumidores del workspace

Tras el rebase, #1997 ya excluye el Hub de `default-members` e incluye Launcher.
Se conserva la migración mecánica de todos los consumidores: los builds
explícitos del Hub/admin/instalador tampoco necesitan el git de Zed ni otro core.

La opción más simple es migrar mecánicamente UI, Hub congelado, administración
e instalador a la misma dependencia de workspace y al namespace platform de
Kit. No se cambian pantallas ni el Hub Electron. Se actualizan los nombres
de scroll publicados y el lifetime de un helper de test del Hub. No se toca
default-members, gates, compilar.ps1 ni workflows. El test de grafo exige un
único Pre publicado y ninguna dependencia git Zed en el camino normal de todo
el workspace; el test de arquitectura sigue prohibiendo runtime desde UI/domain.

## Antes → después, mismo servidor (campaña sobre 62dde8da4)

Estas cifras preceden a #1997 y usan el mismo perfil con símbolos limitados en
ambas variantes. No compararlas con builds posteriores de `debug = 0`.

| Medida | GPUI git anterior | Kit 0.9.1 / Pre 0.3.12 |
| --- | ---: | ---: |
| Paquetes en Cargo.lock (todas las plataformas/features resueltas) | 783 | 915 |
| Paquetes únicos del grafo normal Windows UI | 305 | 329 |
| Build limpio UI lib, dev, paint-stats, -j 2 | 352 s | 323 s |
| Incremental tras tocar mtime de lib.rs, mismo comando | 10,23 s | 4,05 s |
| 4 widgets: ciclos CPU / Present | 13.627.950 | 14.032.689 |
| 4 widgets: privada media, fases activas | 80,87 MiB | 88,64 MiB |
| 4 widgets: privada media, diagnóstico apagado | 81,10 MiB | 80,87 MiB |
| 22 widgets: ciclos CPU / Present | 49.652.692 | 52.558.650 |
| 22 widgets: privada media | 84,05 MiB | 83,58 MiB |
| 1 widget estable: Present durante intervalo estable | 0 | 0 |

Builds limpios desde targets vacíos distintos, misma máquina y perfil.
No se purgaron el registro ni la caché global de sccache; limpio se refiere
al target, no a una descarga/compilación desde caché global fría. Es una
pasada de cada caso: no es una estimación estadística de ahorro. La migración
elimina el git de Zed, **no reduce el número de paquetes**. Las pasadas CPU no
demuestran una mejora; el coste del diagnóstico y la cuantización de Windows
impiden usar los ms de proceso como una ganancia fiable. Se conservan ciclos,
intervalos, hashes y fases en `measurements/raw-cycles-kit-*.json`; la memoria
del control ayuda a identificar diferencias transitorias de arranque/caché.

Cadencia cruda, núcleo fijo e IPC idénticos a [MEASUREMENT.md](MEASUREMENT.md).
Con cuatro widgets se notifican 1,006 por snapshot cambiado y se pintan 1,006
por snapshot pintado en ambas variantes. Con 22: 7,031→7,027 y 7,036→7,031;
coalescing y animación impiden exigir recuentos absolutos idénticos entre runs.

## Caracterización y capturas antes del rebase de perfil

Fmt y Clippy `-D warnings` pasaron para UI, profiling, Hub, admin e instalador,
todos sus targets, con las features de diagnóstico/captura. La suite completa
ejecutó 1.377 casos: 1.376 PASS y un rechazo del guard QA porque TEMP apuntaba
fuera de `D:/VantareServer/qa`. Tras preparar esa raíz, el instalador completo
pasó **76/76**. Los otros 1.301 casos habían pasado; 11 exclusiones existentes.
Se conservan los dos logs y un aviso LEAK del test existente de renovar el
launcher en ejecución. No se modifican tests, guards, plazos ni exclusiones.
El intento anterior sin `vantare-storage` se conserva; el auxiliar se construyó
con DuckDB oficial antes de repetir. Lifecycle completo: **0 fallos**.

Los tests del backend portado de cobertura grayscale y zoom por HWND pasaron.
Cargo prueba esa dependencia junto a Hub/UI, que activan su test-support; no
se añade el vendor a los miembros/defaults ni se altera su versión para probarlo.

La captura real produjo 28 PNG. Dos lotes independientes de Pre son idénticos
entre sí. Frente al GPUI anterior: **19/28 exactos**, con **31 píxeles distintos**
en los otros nueve casos; máximo RGBA **[1, 1, 1, 2] / 255**, dimensiones iguales.
El informe estricto queda FAIL y las referencias no se actualizan. Se declara
este delta de rasterización en la migración; no se presenta como igualdad bit
a bit. El detalle numérico y ejemplos están en `measurements/visual-kit-exact.json`.
El paquete publicado cambia también los factores de mezcla de alfa y el orden
de campos de sprites; se conservan esas revisiones publicadas y nuestro delta.
Esto no demuestra por sí solo cuál de ellas origina cada diferencia mínima.

Los logs íntegros quedan en `D:/VantareServer/evidence/isa-1996`; galería con
referencia/candidato/diferencias en `visual/kit-published/report.html`. Los checks
citados corresponden a la campaña anterior al rebase; las medidas posteriores
se separan por SHA y perfil conforme a MEASUREMENT.md.
