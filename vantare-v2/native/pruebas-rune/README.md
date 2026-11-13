# Pruebas Rune - VANTA-141 / #2213

## Integración aislada de los nueve PR

Este banco reúne #2222, #2224, #2238, #2242, #2241, #2249, #2251, #2261 y
#2273. No modifica archivos del producto: overlays distribuidos, hub-host,
instalador, Hub Electron y workspace nativo quedan idénticos a la base nightly.
Los cuatro parches de instrumentación en `parches/` se aplican exclusivamente
a `fuentes-generadas/`, un directorio ignorado dentro de este banco. El parche
fast NO se aplica a native/ui, a su vendor ni al empaquetado distribuido.

`preparar_fuentes.py gpui|gpui-fast|hub-fast|electron` extrae el SHA base fijado
en fuentes-medicion.json, aplica el parche allí y comprueba los blobs Git de
la fuente resultante. Rechaza fuentes alteradas y no sobrescribe intentos.
Relative Rune y el contador enlazan IPC/domain/profiling de esa misma copia
GPUI; no duplican Subscriber ni la proyección. Preparar `gpui` antes de Cargo.

Desde vantare-v2, por la cola de producto usada solo como cola:

```powershell
pwsh -NoProfile -File native/scripts/compilar.ps1 pwsh -NoProfile -File native/pruebas-rune/VALIDAR_RUST.ps1
pwsh -NoProfile -File native/scripts/compilar.ps1 pwsh -NoProfile -File native/pruebas-rune/kit/CONSTRUIR_VARIANTE.ps1 -Variant gpui -ArtifactDirectory D:/VantareServer/evidence/rune-vs-gpui/artefactos/NUEVA
```

Los wrappers solo aceptan sus copias aisladas y fijan Rust 1.99.1. El de GPUI
admite también gpui_fast y hub_fast. EMPAQUETAR_HUB.ps1 usa la copia Electron.
Nunca construir Rune en servidor. `verificar_aislamiento.py` y su CI comprueban
el diff de producto vacío, los cuatro miembros propios y sus dependencias.
La CI solo compila IPC/profiling/contador y comprueba el workspace Rune sin
compilar su renderer; la validación gráfica y Runtime Rune siguen en Mac/PC.

Guía para Isaac: kit/PASO_A_PASO_ISAAC.txt. Fuentes y límites de los binarios ya
construidos siguen en CONSTRUCCION.md del servidor; la integración no los
recompila ni cambia sus hashes. Los nueve PR antiguos permanecen abiertos
hasta que el orquestador fusione el nuevo PR de integración.

## Rune y límites de construcción

Workspace independiente de native. Rune y sus cuatro parches se fijan al SHA
d5338988a7c1b3377adb60853815b6d0843dae7c. Rust declarado y validado: 1.99.1;
el compilador del producto permanece intacto. No se ha probado un minimo menor.

**Servidor: no compilar Rune ni ejecutar ningun binario grafico.** La excepcion
que Isaac reserva a Release -j 1 fuera de horas punta no esta activada aqui.
Tampoco ejecutar --snap/--frames/--video/--tree: crean grafica.

Se compila en el Mac por SSH conforme a cabecera-mac.md. Unico target:
~/target-isa-2213-rune. compilar_mac.py fija cuatro jobs, dependencias sin
debuginfo, desactiva sccache, controla espacio cada medio segundo y cancela su
propio grupo al bajar de 10,25 GiB, antes del minimo de 10 GiB autorizado.
Comprueba tambien que el checkout no cambie durante el comando.

Desde este directorio en el Mac:

```sh
python3 compilar_mac.py --log ~/orq/vanta141/nombre-nuevo.log -- rustup run 1.99.1 cargo xwin build --release --locked --timings --target x86_64-pc-windows-msvc -p vantare-rune-hola -j 4
python3 compilar_mac.py --log ~/orq/vanta141/test-nuevo.log -- rustup run 1.99.1 cargo test --release --locked -p vantare-rune-hola -j 4
```

El unico test usa Runtime::new/frame; no crea ventanas ni dispositivos GPU.
Release comun: opt-level=3, lto=false, codegen-units=16, incremental=false,
debug=false. Limpio significa target propio vacio y dependencias/SDK ya
descargados; incremental significa cambiar un texto. La comparación limpia e
incremental entre los tres motores queda pendiente autorizada para una ventana
nocturna del servidor sin otros workers, Rune Release -j1 y mismo perfil.
Logs históricos del Mac no se presentan como esa comparación entre motores.

cargo-xwin 0.23.1 oficial universal2 (SHA256 verificado), clang-cl 23.1.5 y
rust-lld 23.1.1. No se cambia la configuracion global de Rust ni se anaden
paquetes al producto. Los ejecutables Windows se copian al servidor para
leer cabeceras, procedencia e imports con dumpbin; no se arrancan alli.
