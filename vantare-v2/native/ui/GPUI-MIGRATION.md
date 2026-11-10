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

La opción más simple es migrar mecánicamente UI, Hub congelado, administración
e instalador a la misma dependencia de workspace y al namespace platform de
Kit. No se cambian pantallas ni el Hub Electron. Se actualizan los nombres
de scroll publicados y el lifetime de un helper de test del Hub. No se toca
default-members, gates, compilar.ps1 ni workflows. El test de grafo exige un
único Pre publicado y ninguna dependencia git Zed en el camino normal de todo
el workspace; el test de arquitectura sigue prohibiendo runtime desde UI/domain.

## Antes → después, mismo servidor

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

Builds limpios desde carpetas vacías distintas, misma máquina y perfil. Es una
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
