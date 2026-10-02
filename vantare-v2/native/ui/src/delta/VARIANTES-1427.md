# Variantes Eficiencia del worker B — #1427

Rama `vantareapp/isa-1427-w-variantes-b`; base recibida
`63a59d0762f33b7e20455a0bc14dee073be175a6`. Seguimiento técnico:
https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427.
Notion no estaba disponible; Isaac autorizó GitHub como excepción para este worker.
No se modifica el Hub, el registro, el layout, el kit ni otros widgets.

## Cobertura

| Widget | Opciones implementadas | Límite declarado en `Settings::UNSUPPORTED` |
| --- | --- | --- |
| delta | `templateId=instrument/capsule`, mismo delta y motor de movimiento | session-best y previous-lap: Snapshot solo publica delta personal |
| delta_trace | `windowSeconds` 1–8; observaciones, cortes y límite de memoria | sectores y mapa: faltan series y geometría canónicas |
| pedals | `transparentBackground` | ninguno |
| pedals_telemetry | `steeringWheel`: genérico + 31 selecciones productivas; `showClutch` | `showPosition`: Eficiencia no lo dibuja |
| input_telemetry | `historySeconds` 1–8; `showClutch` | cuatro segundos por defecto conserva el recorte heredado de 120 muestras |
| racing_flags | `textColor`, `showSectorFlags`, `hideWhenGreen` | ninguno |
| fastest_lap | `showPersonal`, `showClass`, `durationSeconds` 3–15, `showDriver` | ninguno |
| fuel_strategy | `historyRows` 1–8, `showProjection`, `source`, `units=liters` | energía virtual: estado explícito de señal ausente; no datos fabricados |
| track_map | persiste `showTrackLabel` | el renderer TSX no consulta este booleano; conserva el pie |
| track_weather | persiste sus cuatro filtros | el renderer TSX no consulta ninguno de ellos |
| car_damage_visual | `showAero` (solo leyenda, como TSX) | `showPercent`: el productivo siempre imprime porcentajes |
| car_damage_numbers | `showTyres`, `format=percent` | ninguno; percent es el único formato productivo |
| radar | renderer existente | no hay opciones Eficiencia en el manifest |

La UI recibe ViewModels puros. No hay nuevas dependencias, API, renderer paralelo,
telemetría simulada en producción ni acceso a persistencia desde el pintado.
Los SVG de volantes proceden literalmente de `SteeringWheelArtwork.tsx`;
Toyota GR010/TR010 comparten artwork como en el productivo. El genérico permanece
byte a byte igual. Las trazas conservan 120 muestras por defecto. Delta admite hasta 161 para
ventanas mayores de cuatro segundos; inputs admite hasta 401 para ventanas
distintas de cuatro segundos. La selección predeterminada de inputs conserva
su recorte heredado de 120 muestras (2,38 s a 20 ms), para no cambiar píxeles;
las demás ventanas sí cubren el plazo solicitado incluyendo ambos extremos.
Los cortes por gaps se conservan.

## Escenas y evidencia

Cada módulo con variantes incluye `scenes/variants.json`: claves camelCase,
valores seleccionados y ruta al Snapshot/secuencia. Los sectores, ocho vueltas y las secuencias de inputs de 3,9/7,8 segundos
son escenas reconstruidas de demostración; no representan una captura LMU.
Las variantes temporales de Fastest Lap se prueban con reloj explícito; la imagen
estática de Workshop no acredita duración ni un aviso real en carrera.

Directorio de evidencia local: `C:/tmp/vw3-variantes-b-evidence`.
La línea base se capturó antes de editar los trece widgets con `compare.ps1`.
La comparación de regresión usa después esas imágenes locales, umbral **0** y
máximo **0 %**. No sustituye la comparación contra el productivo Wails, que ya
presentaba diferencias heredadas.

Las capturas productivas nuevas usan `WidgetVisualHost` + `WidgetVisualViewport`,
Eficiencia y Workshop del mismo checkout en Chromium. Solo se cambia contenido o
apariencia declarados. No se congelan ni se promueven como referencias de paridad.
La CLI nativa compartida todavía no acepta Settings: para tomar las variantes se
instrumentó únicamente el constructor de cada módulo asignado, bajo
`parity-capture`, con un JSON de Settings; se restauran los bytes originales al
terminar. El hash de ese binario queda en `variant-binary.sha256` y el procedimiento
local en `capture.ps1`. No se entrega esa instrumentación en código productivo.
`MaxPercent=100` para variantes sirve para producir PNG/diff y métricas, **no es
un gate de paridad**. La valoración visual se registra abajo.

## Integración pendiente del orquestador

`native/ui/src/app.rs::settings_limit` sigue diciendo pendiente para varias
apariencias ya soportadas. `native/hub/src/inspector.rs` sigue mostrando controles
limitados. Ambos archivos están fuera del alcance de este worker: el orquestador
debe habilitar controles soportados y consumir las razones de `UNSUPPORTED`.
Por ello esta entrega no acredita un flujo Studio completo, persistencia nueva,
Desktop/OBS, runtime LMU ni rendimiento físico.

No hubo push, PR, merge, promoción, release ni publicación externa. No se actualizó
Notion y no se declara entregado allí.

## Checks de la fuente final

Verificados el 2026-09-30 a las 12:23 CEST. Todos los comandos usan como máximo
dos trabajos; las comprobaciones de Cargo indicadas llevan `-j 2`.

- `cargo fmt --check`: salida 0. Además, `rustfmt --edition 2024 --check` sobre los
  módulos UI asignados incluidos mediante el registro: salida 0.
- `cargo clippy --workspace --all-targets -j 2 -- -D warnings`: salida 0.
- `cargo test -p vantare-domain -p vantare-ui -j 2`: salida 0; 113 tests de dominio,
  uno de arquitectura y 111 de UI. No acredita toda la suite del workspace.
- `cargo test -p vantare-ui --features parity-capture -j 2`: salida 0; 114 tests
  de biblioteca, cinco de importación, tres del binario Overlays y cuatro del
  binario Workshop.
- `cargo clippy -p vantare-ui --features parity-capture --all-targets -j 2 -- -D warnings`:
  salida 0.
- `cargo test --workspace -j 2`, reintento completo: salida 0; **639 tests aprobados,
  cuatro ignorados existentes**. Tres necesitan LMU en marcha (REST y SHM) y uno
  ACC en una sesión activa con broadcasting configurado. No se ejecutaron esas
  pruebas físicas ni se inició un simulador.
- Primer `cargo test --workspace -j 2`: salida 1 antes de ejecutar tests, por
  `libduckdb-sys` / MSVC `fatal error C1060: compiler is out of heap space`.
  Evidencia: `gate-test-attempt1-C1060.log`; el reintento compiló la dependencia y
  pasó sin cambios de configuración global ni cambios de fuente adicionales.
- `git diff --cached --check`: sin errores. No quedan constructores instrumentados
  ni llamadas a `unwrap()` en los módulos UI entregados.

Los logs de comandos viven en `C:/tmp/vw3-variantes-b-evidence/gate-*.log`.
No se ejecutan checks frontend: sus fuentes no se modifican. No hay evidencia de
CI remota, de runtime LMU ni de uso físico Desktop/OBS.

## Observaciones de la revisión visual

- Los 31 volantes nuevos conservan forma, botones y giro del SVG TSX; las
  diferencias observadas son de rasterización y texto del panel existente.
- Delta cápsula conserva pista, centro, sentido, píldora y movimiento. Su brillo
  se recorta a la pista; quedan diferencias GPUI/Chrome de sombra, texto y bordes.
- Fuel sin proyección desplaza barra y tarjeta como flex CSS; ocho filas hacen
  crecer la pista interna a 331 px, que se recorta por el viewport de 204 px,
  exactamente como el grid del productivo. No se redimensiona el layout.
- Los filtros de eventos Fastest Lap seleccionan personal/clase o panel vacío.
  Driver oculto centra las dos líneas; las duraciones se acreditan con tests,
  porque el harness productivo previsualiza un aviso estable.
- Pedals transparente elimina el panel exterior; inputs sin embrague redistribuye
  las columnas; su historial recorta observaciones, sin inventar muestras.
- Daño visual oculta solo la leyenda AERO; daño numérico redistribuye tres celdas.
- Flags respeta color y filtro de sectores. `hideWhenGreen` omite texto/sectores,
  pero **deja un panel gris**, como el TSX real: la regla CSS del panel tiene mayor
  especificidad que `--hidden { display: none }`. Se replica esta peculiaridad y
  se deja documentada para el orquestador; no se arregla el frontend fuera de alcance.
- Track Map false conserva el pie también en el TSX: ajuste no soportado y
  deshabilitable. Weather/posición/porcentajes ignorados y señales ausentes quedan
  declarados, sin fabricar datos.

## Evidencia versionada y cómo revisar

- `scenes/defaults.json` registra los trece resultados antes/después: cero píxeles
  distintos con umbral 0 y hashes SHA-256 de ambas capturas locales.
- Cada `../<widget>/scenes/evidence.json` enlaza sus PNG nativos y registra ajustes,
  hash del productivo recién capturado, hash del binario instrumentado y diferencia
  medida. Hay 55 PNG; las imágenes productivas siguen en el directorio de evidencia
  externo, sin añadir nuevos golden ni referencias congeladas al repo.
- Para revisar a ojo, abrir las parejas de `variants/<widget>/<caso>/<widget>.png`
  y `product/<widget>-<caso>.png` bajo el directorio externo. Las hojas
  `wheels-review-*.png` y `final-review-*.png` reúnen las comparaciones.
- Para reproducir, el procedimiento externo `capture.ps1` monta los ajustes de
  `scenes/variants.json` en los constructores asignados y usa el `compare.ps1`
  compartido. Sus llamadas a Cargo convierten `-j 4` a `-j 2`; los constructores se
  restauran en `finally`. Las recapturas corregidas están en `recapture.ps1` y
  `recapture-flags.ps1`. No ejecutar varias capturas en paralelo: usan el mutex
  global existente. Después, verificar que no queda `INSTRUMENTACIÓN` en fuentes.

La paridad numérica contra Wails no está verde para todas las variantes. Ocho
capturas superan el umbral habitual del 4 %: pedals transparente (9,7708 %), flags
sin sectores (5,276 %), cápsula (4,8065 %), daño sin neumáticos (4,5398 %) y cuatro
avisos Fastest Lap (4,2468–4,7015 %). Se han revisado visualmente; persisten
aproximaciones de sombras, bordes y texto. La base ya superaba el 4 % en Fastest
Lap (4,7015 %) y daño numérico (6,0355 %). El gate exigido de **no cambiar ningún
píxel por defecto** sí da cero en los trece widgets. No confundir ambos resultados.

Preguntas bloqueantes: ninguna. Las decisiones sobre retirar el panel gris de
Flags, corregir filtros TSX ignorados y conectar controles Studio pertenecen al
orquestador y están fuera de estas rutas.
