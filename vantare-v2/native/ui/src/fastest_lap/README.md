# Fastest lap — Eficiencia (ISA-1427)

Porte del renderer productivo `FastestLapFunctional.tsx` y su store, para el
tamaño congelado **480 × 104** y la configuración por defecto: avisos personal
y de clase, piloto visible, duración 6 s, movimiento completo y fondo sin blur.
La primera foto solo establece la referencia. Una mejora observada genera un
aviso; clase tiene prioridad si también mejora la marca personal. Llegada y
salida CSS duran 220 ms; la salida está dentro de los 6 s. Sin movimiento,
`Wake::At` programa la salida; al terminar se devuelve `Wake::Idle`.

`domain::fastest_lap` filtra la clase del jugador, valida tiempos medidos y
frescos, redondea a milisegundos y reutiliza `domain::format`. Tiempos ausentes,
estimados, obsoletos o inválidos no generan marcas; el renderer vacío es
transparente. No se usa la mejor vuelta general como sustituto de la clase.
Las primeras vueltas requieren contador creciente y última vuelta coincidente.
Entradas de coches, cambios de piloto, sesión o época no anuncian marcas antiguas.

La feature `parity-capture` usa la previsualización persistente del harness
productivo; no reproduce avisos live. `animating()` es falso para esa escena.
Los tests del build normal comprueban el aviso temporal y su caducidad sin
nuevas muestras. El host todavía no entrega configuración de contenido,
preferencias de movimiento/efectos ni layout variable: no se portan sus
controles ni la variante compacta aquí.

## Escena y captura

`ui/fixtures/fastest-lap.snapshot.json` reconstruye Workshop
`default/race/track/ready` en DTO v3. Usa los mismos veinte coches que la
escena base de pedales; época 3 y secuencia 2 del frame congelado. Las identidades
opacas se traducen por orden de fila a coches 1–20, clases 1–3 y sesión 1.
El resultado esperado es **Antonio Giovinazzi, HYPERCAR, 1:30.904**.
Es una demostración reconstruida; no es una captura de LMU ni prueba de OBS.

Desde `native/`, con DPI 100 %, ejecutar exclusivamente `compare.ps1`. Esta
base del script fija `-j 4`; la siguiente función limita su invocación a 2
sin editar infraestructura fuera del alcance:

```powershell
$env:CARGO_PROFILE_DEV_DEBUG = '0'
$env:RUST_TEST_THREADS = '2'
$cargoBin = (Get-Command cargo -CommandType Application).Source
function cargo {
    $limited = @($args)
    $index = [Array]::IndexOf($limited, '-j')
    if ($index -ge 0) { $limited[$index + 1] = '2' }
    & $cargoBin @limited
    $global:LASTEXITCODE = $LASTEXITCODE
}
.\ui\compare.ps1 -Widget fastest-lap -MaxPercent 4
```

Resultado final del 30-09-2026: **2347/49920 px distintos (4,7015 %)**,
umbral por canal 8, RGBA premultiplicado, sin máscaras; delta máximo 224.
`compare.ps1` sale con **código 1**: **no cumple la puerta ≤ 4 %**. La captura
480 × 104 cabe en el monitor; no hubo bloqueo por ancho ni cambios al marcador.

Zonas principales que imprime el comparador:

| Zona | Caja x/y/w/h | Píxeles distintos |
| --- | --- | ---: |
| Tiempo | 94/35/143/32 | 684 |
| Título | 92/13/121/20 | 477 |
| Piloto | 92/69/118/19 | 460 |
| Cronómetro | 20/26/40/50 | 247 |
| Clase | 216/18/58/14 | 226 |
| Franja derecha | 393/0/87/104 | 159 |
| Franja izquierda | 345/0/77/104 | 117 |

La geometría, los valores y los colores interiores coinciden; quedan diferencias
en bordes de glifos, curvas, diagonales y esquinas. El patrón apunta a la
rasterización de GPUI/DirectWrite y SVG frente a Chromium. Los desplazamientos
horizontales de ±0,25 px empeoraban el resultado y se retiraron. La línea de
base se redondea como en Standings; el cronómetro usa el SVG productivo y las
franjas reproducen el skew y recorte interior del CSS. Se conserva el mejor
resultado sin modificar el kit compartido, las referencias ni el comparador.

Candidato y diff quedan en `%TEMP%\vantare-parity\fastest-lap\`.
SHA-256 para verificar esta evidencia:

| Fichero | SHA-256 |
| --- | --- |
| Fixture DTO v3 | `FE02379BC123C405F6E0AC1E39D0FD2B9E3021F6B8ED6090EDD1F1D8BA487890` |
| Referencia congelada | `4DD95E3D42C338E047379E5933A26F84A14ECE16DE20C40A2643A35A2A227F28` |
| Candidato | `295620128980FEF4BED6ED28622EC63C3922D0E68E93737F6A19DBFBE3AED7E5` |
| Diff | `F012B889C9561D432478AB7E9AC4C1A85D3A4B387BAD22B267C8DBE007339227` |

## Verificación y entrega local

Rama `vantareapp/isa-1427-w-fastest-lap`, base recibida
`6973c81f29574a573d76f3fae48e128d6964960a`. El dominio está en
`cf563d337c2acaa28d16ea1945c92dcf118c0137` y el widget en
`75df4ab35cdf86b9413006171a3b267b36fac93c`; el siguiente hito conserva esta
escena, su regresión y el resultado de paridad. Referencia técnica:
[GitHub #1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427).

Los gates se ejecutan antes de cada commit con `CARGO_PROFILE_DEV_DEBUG=0`,
`RUST_TEST_THREADS=2` y máximo dos jobs:

```text
rustfmt --edition 2024 ui/src/fastest_lap/mod.rs
cargo fmt --check
cargo clippy --workspace --all-targets -j 2 -- -D warnings
cargo test --workspace -j 2
```

También se verifica Clippy con `parity-capture` y los tests propios de esa
feature. Salida final de los gates: fmt y ambos Clippy **código 0**; tests
workspace **código 0**, sin fallos (domain 23 passed, UI 33 passed);
tests propios con `parity-capture`: **3 passed, 0 failed**, código 0.
El dominio añade 8 tests; el build normal del widget añade 3 y la
feature reemplaza el test live por otro de preview. Las pruebas protegen
calidades, redondeo, clase real, referencia silenciosa, mejora corroborada,
prioridad, cambios de ámbito, caducidad, Wake y escena/etiquetas congeladas.
Las 4 pruebas live ignoradas por el workspace requieren LMU/ACC en marcha;
no se ejecuta validación física LMU/OBS. No hay push, PR, CI remoto, merge,
promoción ni release. Quedan revisión del orquestador y la puerta visual.

## Señales y límites

El modelo representa todos los tiempos, contadores, pilotos y clases visibles.
Faltan dos metadatos del contrato productivo, sin ampliar domain/IPC:

- `overlayV2Source.retry`: contador entero de reconexiones, sin unidad física;
  metadata vigente de la fuente. Una reconexión sin cambio de época ni foto
  degradada no puede reiniciar de forma explícita la referencia.
- `overlayV2Source.state`: estado categórico `live/stale/error/disconnected`,
  sin unidad física; declara vigencia/conexión de la fuente. Las calidades y
  capacidades recibidas limpian los avisos al degradarse, pero un pipe caído
  sin nueva foto no se puede observar desde este widget. El aviso sí caduca
  por su propio reloj a los 6 s.

No se inventan valores para estos metadatos. Pendiente su coordinación con
los propietarios del modelo y transporte. Notion no está disponible según
el encargo; el orquestador debe reconciliar el seguimiento de GitHub #1427.

## Recursos para el kit

Se reutilizan `efficiency::{text, col, rect, paint_rect}`. El peso Inter 750
no existe en el kit de esta base: `make_font.py` reutiliza su generador para
crear `Inter-750.ttf` local a partir del mismo Inter variable productivo,
con licencia OFL adjunta. Se registra una sola vez por App; no hay dependencia
nueva. Candidatos para el kit: este peso tipográfico y la curva CSS ease-out
(Standings ya tiene el otro consumidor). El cronómetro, las franjas y la
composición permanecen en este módulo.
