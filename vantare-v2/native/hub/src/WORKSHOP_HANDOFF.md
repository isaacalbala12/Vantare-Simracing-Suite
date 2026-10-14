# ISA-1430 — Workshop y Ajustes locales

Worker Codex; revisión de todo el diff: Claude Opus 5.5.
Issue leída: https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1430
Notion no disponible; excepción explícita de Isaac. No se afirma seguimiento
Notion actualizado ni entrega de toda la fase 5.

Rama: `vantareapp/isa-1430-w-hub-workshop`.
Base asignada y HEAD inicial: `a6cd70ab8c7abdcc700c74105fee5ffa2fd36a69`.
Se obtuvo y leyó `origin/nightly` (`f29b5fee04022756f9ae59f19bf153f91eebe4ed`)
sin sustituir la base de integración asignada por el orquestador.
Sin push, PR, merge, promoción, release, red de producto ni cuenta.

## Qué se aplica

- Catálogo directo a partir de `Kind::ALL`, sin copiar ni inventar widgets.
- Fotos DTO vigente y arrays JSON de esas fotos; se mantiene JSONL existente.
  `.snapshot.json`, `.sequence.json` y `.jsonl` en fixtures; un archivo externo
  se abre con `--scene` y aparece también en el catálogo.
- Play, pausa, paso, inicio y bucle con intervalos del reloj recibido original.
  Límite de escena: 16 MiB/512 fotos. Rechaza arrays vacíos, versiones antiguas,
  revisiones duplicadas/regresivas, reloj regresivo y cambios de época.
  Una recarga corrupta mantiene la foto válida y se reintenta; no se modifica
  `ui/src/capture.rs` ni `ui/src/workshop.rs`, propiedad de wtrazas.
- Cambiar/recargar escena o retroceder reconstruye el mismo Overlay productivo
  para limpiar historiales y avisos del futuro; avanzar conserva sus animaciones.
  Regresión reproducida con `fastest_lap::Records`: sin reinicio, el bucle devuelve
  `Unchanged` al volver atrás e impide repetir el aviso. El test exige `Clear`
  al retroceder y un nuevo `Notice` al reproducir otra vez la mejora.
- PNG congelado `ui/reference/<widget>.png` lado a lado, superpuesto al 50 %
  u oculto. Selección, cursor, bucle, fondo y modo se guardan al cerrar o mediante
  Guardar selección; widget/escena también se guardan al elegirlos.
- Capturar y calcular reutiliza `vantare-workshop.exe --captura`: exporta solo
  la foto elegida a un temporal, pausa la secuencia y ejecuta el renderer
  productivo existente. Plazo 30 s, cancelación/recogida del hijo al cierre
  ordenado, cleanup de archivos propios. Resultado descartado si cambia la
  foto, el widget o el formato mientras se captura.
- PNG decodificado por GPUI, sin dependencias nuevas ni Win32/unsafe añadido.
  Diferencia en Rust como `ui/diff.py`: float32, RGB premultiplicado, alfa recto,
  píxel distinto si cualquier canal supera 8; sin máscaras. Tamaños diferentes
  son error, nunca se escalan para producir un porcentaje.
- Ajustes ES/EN y métrico/imperial en `Layout.preferences`, defaults para layouts
  anteriores. El campo reside en UI con serde local; el dominio sigue puro.
  Se aprovechan escritura atómica, backup, conflicto por bytes y vigilancia
  existentes: una sola confirmación aplica posiciones y formato. Studio usa
  ese mismo documento; Workshop observa sus preferencias y overlays reconstruye
  con la última foto al recargarlo, sin esperar nueva telemetría.
- Rendimiento, actualizaciones y atajos muestran pendiente sin callback ni foco:
  no hay contrato nativo de configuración en esta base. Sin cuentas ni red.

## Límites y preguntas para revisión

1. El capturador actual solo admite `Preferences::default()` (ES/métrico).
   La interfaz etiqueta ese formato y muestra los PNG calculados al obtener el
   resultado; no atribuye el porcentaje al preview EN/imperial. ¿Debe wtrazas
   ampliar el contrato de captura para preferencias y opciones del widget?
2. El capturador requiere su binario con `parity-capture` junto al Hub, DPI 100 %,
   widget dentro del monitor y ventana visible. Si falta o falla, se informa;
   no se compila automáticamente ni se crea renderer alternativo. El orquestador
   debe construir/distribuir juntos esos binarios para usar esta acción.
3. Referencias congeladas corresponden a sus escenas concretas. Comparar otra
   foto arroja diferencias de contenido y no acredita paridad del widget.
   No hay evaluación automática de toda una secuencia ni interpolación de DTO.
4. `Layout` sigue v1 con campo opcional: el lector nuevo acepta archivos previos.
   Un binario nativo antiguo con `deny_unknown_fields` rechazará el nuevo campo;
   desplegar Hub/UI juntos. Este cambio no garantiza downgrade de esos binarios.
5. Cancelación cubre cierre ordenado; matar abruptamente al Hub no coloca el
   capturador en un Job Object nuevo. Su rutina de captura propia tiene plazos,
   pero esa contención requiere decisión del propietario de procesos.
6. Sin QA física de teclado, DPI mixto, multimonitor, LMU/ACC/OBS ni mediciones
   de recursos. Las realiza el orquestador en serie. No se cambian widgets,
   kit, núcleo, adaptadores, DTO ni políticas de promoción.
7. Avisos temporales respetan su semántica productiva: una primera foto puede
   establecer referencia silenciosa. La captura de paridad usa el modo existente
   del helper; no se fabrican eventos para hacer visible un aviso en Workshop.

## Verificación

Gates ejecutados desde `native/`, compilación siempre con `-j 2`:

- `cargo fmt --check`: PASS.
- `cargo clippy --workspace --all-targets -j 2 -- -D warnings`: PASS (14,53 s).
- `cargo test --workspace -j 2`: no está verde en la revisión final. Primera
  repetición: dos timeouts de cierre en `storage/tests/process.rs`. Siguientes
  repeticiones: el test de pipe autorizado de `engineer/tests/lifecycle.rs`
  falló esperando EOF y después por timeout. Sin modificar ni excluir tests.
- Última ejecución con `--no-fail-fast` para continuar todos los paquetes:
  Engineer y Hub pasan, pero falla el presupuesto de reinicios de Engineer
  en `runtime/tests/lifecycle.rs`: código 101, un target fallido. Storage pasa
  (incluidos sus cinco tests de procesos); Hub: 24 tests de biblioteca PASS;
  UI: 94 tests de biblioteca PASS. Los resúmenes estándar suman 550 PASS y
  cuatro ignorados por requerir LMU/ACC físicos; el harness propio de lifecycle
  informa por separado un fallo en
  `engineer_restart_budget_closes_every_child_after_exactly_two_retries`.

No se crea commit mientras falle el gate obligatorio de workspace. Los fallos
están fuera de las rutas autorizadas; no se ha establecido su causa ni se
atribuye su arreglo a este worker. Una suite completa anterior había pasado
antes de añadir la última regresión del bucle; no sustituye la verificación
del diff final.
HEAD final continúa en `a6cd70ab8c7abdcc700c74105fee5ffa2fd36a69`;
los once archivos del diff quedan sin commit para revisión del orquestador.

Logs locales conservados en `%TEMP%`: `vantare-isa1430-workshop-final-clippy.log`,
`vantare-isa1430-workshop-final-tests.log`,
`vantare-isa1430-workshop-storage-timeout.log`,
`vantare-isa1430-workshop-engineer-eof.log` y
`vantare-isa1430-workshop-engineer-timeout.log`.

Entorno de compilación: `CARGO_PROFILE_DEV_DEBUG=0`,
`CARGO_PROFILE_TEST_DEBUG=0`, `CARGO_INCREMENTAL=0`, igual que la evidencia previa.
Sin modificar Cargo.toml, Cargo.lock ni perfiles del repo.

Oráculo Python ejecutado con el `load_premultiplied` real de `ui/diff.py`:
caso conocido de cinco píxeles = 2 distintos / 5 = 40.0 %. Test Rust verifica
el mismo caso, transparencia, igualdad y buffers inválidos. Tests adicionales
cubren PNG reales/tamaños distintos, arrays DTO, reproducción, persistencia de
selección, preferencias/undo/redo/reinicio/vigilancia y aplicación de formato
en la última foto del renderer productivo.

Archivos del diff: `hub/src/{comparison.rs,scene.rs,workshop.rs,shell.rs,studio.rs,
document.rs,lib.rs,main.rs,WORKSHOP_HANDOFF.md}` y `ui/src/{layout.rs,app.rs}`.
No se ejecutan checks Go/frontend porque no se han modificado esos productos.

QA propuesta para Opus (no acreditada por tests):

```powershell
cd vantare-v2/native
cargo build -j 2 -p vantare-hub
cargo build -j 2 -p vantare-ui --bin vantare-workshop --features parity-capture
target/debug/vantare-hub.exe --workshop --data-dir C:/tmp/hub-workshop-qa --layout C:/tmp/hub-workshop-qa/layout.json
```

Elegir el widget y su fixture correspondiente; capturar, comprobar porcentaje
y alternar ambos modos. Abrir un array DTO con `--scene`, probar pausa en última
foto, paso y bucle; cambiar selección durante captura y verificar descarte.
Salir/reabrir y comprobar selección. En Ajustes alternar idioma/unidades;
abrir Studio y overlays con ese mismo `--layout` y comprobar aplicación sin
reinicio y sin foto nueva. Provocar conflicto con otro editor y confirmar
que la escritura se rechaza y el formato anterior permanece hasta Recargar.
