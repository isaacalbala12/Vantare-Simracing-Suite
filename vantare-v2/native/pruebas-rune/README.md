# Pruebas Rune - VANTA-141 / #2213

Workspace independiente de native. Rune y sus cuatro parches se fijan al SHA
d5338988a7c1b3377adb60853815b6d0843dae7c. Rust declarado y validado: 1.99.1;
el compilador del producto permanece intacto. No se ha probado un minimo menor.

**Servidor: no compilar Rune ni ejecutar ningun binario grafico.** La excepcion
que Isaac reserva a Release -j 1 fuera de horas punta no esta activada aqui.
Tampoco ejecutar --snap/--frames/--video/--tree: crean grafica.

Se compila en el Mac por SSH conforme a cabecera-mac.md. Unico target:
~/target-isa-2213-rune. compilar_mac.py fija cuatro jobs, dependencias sin
debuginfo, desactiva sccache, controla espacio cada dos segundos y cancela su
propio grupo al bajar de 18 GiB, antes del minimo de 15 GiB pedido por Isaac.
Comprueba tambien que el checkout no cambie durante el comando.

Desde este directorio en el Mac:

```sh
python3 compilar_mac.py --log ~/orq/vanta141/nombre-nuevo.log -- rustup run 1.99.1 cargo xwin build --release --locked --timings --target x86_64-pc-windows-msvc -p vantare-rune-hola -j 4
python3 compilar_mac.py --log ~/orq/vanta141/test-nuevo.log -- rustup run 1.99.1 cargo test --release --locked -p vantare-rune-hola -j 4
```

El unico test usa Runtime::new/frame; no crea ventanas ni dispositivos GPU.
Release comun: opt-level=3, lto=false, codegen-units=16, incremental=false,
debug=false. Limpio significa target propio vacio y dependencias/SDK ya
descargados; incremental significa cambiar un texto. Ambos se miden en el Mac
para las tres variantes. El primer intento con descargas no se confunde con
la medida limpia. Logs y JSON quedan en ~/orq/vanta141 y se copian al servidor.

cargo-xwin 0.23.1 oficial universal2 (SHA256 verificado), clang-cl 23.1.5 y
rust-lld 23.1.1. No se cambia la configuracion global de Rust ni se anaden
paquetes al producto. Los ejecutables Windows se copian al servidor para
leer cabeceras, procedencia e imports con dumpbin; no se arrancan alli.
