> Evidencia histórica de #1427; contrato vigente en [README nativo](../../README.md). Estados, versiones DTO y gates siguientes describen su corte, no la base actual.

# Familia Relative — candidato parcial de ISA-1427

Worker Codex, 2026-09-30. Referencia técnica:
[#1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427).
Base del worktree: `8bff26972d6046841cb4c191682d6cca75d07ca2`.
Rama: `vantareapp/isa-1427-w-wrel`. Revisión pendiente de Claude Opus 5.5.
Notion no disponible: excepción expresa del encargo. Su tarea, proyecto,
estado y continuidad no se han leído ni actualizado.

## Comportamiento cubierto

- `domain::relative::track_window` es una función pura reutilizable: selecciona
  los vecinos por magnitud y signo de `relative_s`, con desempate por identidad;
  presenta delante lejos→cerca, jugador, detrás cerca→lejos y conserva huecos.
  No usa la clasificación para fabricar vecinos ni deriva segundos de nuevo.
- Multiclass Relative conserva su selección por posición/clase; Head-to-Head
  conserva el vecino de clasificación seleccionado. Ambos leen el gap de la
  misma función compartida `relative_seconds`, aunque su signo contradiga la
  posición en carrera. H2H solo dibuja el gap del rival seleccionado.
- Relative presenta `relative_laps` actuales (fiables o estimados) solo en
  carrera y fuente Live; los obsoletos no producen distintivos de vueltas.
  El núcleo publica esta derivación como Estimated: no se convierte en Reliable.
- Relative: Waiting = SIN DATOS, Stale = DATOS ANTIGUOS, Lost = DESCONECTADO,
  sin filas; Live presenta la ventana. Una interrupción cancela los fantasmas
  animados y la recuperación fija una nueva base silenciosa.
- Multiclass conserva las filas obsoletas y muestra DATOS ANTIGUOS, como el
  ViewModel V2; Waiting/Lost vacían las filas con su etiqueta correspondiente.
- H2H no presenta filas fuera de Live; conserva SIN RIVAL, que es la salida
  de `HeadToHeadFunctional.tsx` para un modelo no disponible, también Stale.
- Las tres escenas incluyen `fixture_provenance`: sus señales se reconstruyen
  desde los metadatos congelados que generó `tools/widget-reference/scene.tsx`.
  No son una captura de telemetría live. Los valores no publicados siguen
  Unavailable; no se convierten en cero ni se completan usando gaps al líder.

## Capturas del renderer productivo

`compare.ps1`, RGBA premultiplicado, umbral por canal 8, sin máscaras ni cambios
de referencias. El script fija `-j 4`: se ejecutó su contenido en memoria con
la única adaptación de jobs a `-j 2` y su directorio original explícito.
Se usó el mutex global de captura del script. Sin cambios al script compartido.

| Widget | Antes | Después | Gate ≤ 4 % |
| --- | ---: | ---: | --- |
| Relative | 7258/86640 = 8,3772 % | 5033/86640 = 5,8091 % | FAIL |
| Multiclass Relative | 3036/65100 = 4,6636 % | 2811/65100 = 4,3180 % | FAIL |
| Head-to-Head | 635/46080 = 1,3780 % | 635/46080 = 1,3780 % | PASS |

Ninguno empeora, pero **la aceptación de paridad de esta familia queda pendiente**.
Relative corrige las líneas de base conforme a las cajas CSS escaladas:
nombre 19,5 px, celdas de 13 px a 18,25 px, número a 17,75 px y badge a 17 px.
El resto del diff se concentra en texto y límites de filas. La geometría
congelada y el diagnóstico del kit (`../efficiency/RASTERIZACION.md`) orientan
la revisión; no demuestran una única causa del error residual.

Un ensayo con +50 de peso de fuente empeoró Relative a 6,0792 % y se retiró.
No se retocaron referencias, umbrales, fuentes, GPUI, gamma global ni el kit.

## Gates y bloqueos

Antes del commit local se ejecutaron, desde `native/`:

```powershell
cargo fmt --check
cargo clippy --workspace --all-targets -j 2 -- -D warnings
cargo test --workspace -j 2 --no-fail-fast
```

- fmt y clippy: PASS.
- Domain: 89 pruebas PASS y arquitectura PASS. UI: 93 pruebas PASS, incluidos
  los valores de las tres escenas y la interrupción/reconexión sin fantasmas.
- La suite completa termina con un único target fallido: `vantare-ipc --lib`,
  prueba `every_workshop_scene_is_migrated_with_new_signals_unavailable`,
  `ipc/src/lib.rs:169`. Exige Unavailable para todas las escenas; recibe
  `Reliable(4.5)`, necesario para esta tarea. Cambiar esa guarda de migración
  corresponde al propietario de IPC y queda fuera de las rutas del worker.
  No se debilitó ni se omitió la prueba. La suite global **no está verde**.
- Las regresiones de los tres gaps fallaron antes de la implementación y
  pasan después. Las pruebas de domain, arquitectura, UI y runtime se
  ejecutan completas con `--no-fail-fast`; los ensayos físicos que el repo
  marca ignored no se consideran verificados.
- Una primera ejecución global y varias capturas se interrumpieron por falta
  de espacio. La limpieza de la caché incremental propia fue rechazada por
  la política de ejecución. No se borró nada. Las ejecuciones definitivas
  usan `CARGO_INCREMENTAL=0`, sin cambiar la configuración del repositorio.
- Una repetición solapó el build siguiente con la ejecución del binario de
  tests de overlays y recibió `os error 32` (archivo en uso). Se conserva
  esa salida en `cargo-test-workspace.log`; la ejecución final separada queda
  en `cargo-test-final.log`.

Logs y PNG locales: `C:/tmp/vw2-wrel-evidence/`, subdirectorios `before/` y
`after/`, más `cargo-test-final.log`, `cargo-clippy-workspace.log` y
`parity-summary.json`.
El orquestador debe repetir los resultados; los artefactos no se versionan.

## Siguiente paso del orquestador

Revisar el diff y las capturas, conciliar la guarda de IPC con las escenas
reconstruidas y resolver el diff visual restante antes de aceptar la familia.
Para inspección manual desde `native/`, abrir el Workshop con
`target/debug/vantare-workshop.exe --widget relative --escena ui/fixtures/relative.snapshot.json`
y repetir con `multiclass-relative` y `head-to-head` y sus escenas.

No se han comprobado estos tres widgets con LMU/OBS en vivo. H2H conserva
la limitación previa del host: el Widget usa Ahead; la proyección pura acepta
Behind y lo prueba. Cablear el ajuste del host no formó parte de este cambio.
No hay dependencias nuevas, unsafe nuevo, push, PR, merge, CI remota,
promoción de canal ni release. Este candidato no cierra la issue ni la fase.
