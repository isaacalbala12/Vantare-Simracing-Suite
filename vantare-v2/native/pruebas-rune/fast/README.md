# B-GPUI fast · VANTA-141, pieza 5

El parche se aplica al SHA de la rama fast indicado en procedencia.json:
745bd52b847d1c6a53151146a124db4edcf95aa6. Contiene solo la instrumentación y
el mosaico de medición. No arrastra al PR contra nightly la divergencia histórica
de esa rama (1.413 archivos), ni cambia el comportamiento del motor.

El código compilado completo se conserva en la rama
vantareapp/isa-2213-gpui-fast, SHA 56cb2c701a356eafa324e4237626952d259a77f0.
`git apply --unidiff-zero --check medir-fast.patch` se ejecuta desde un checkout limpio de
la base exacta; después `git apply --unidiff-zero medir-fast.patch`. El parche excluye solo
el handoff documental; incluye todos los archivos de código modificados.

Compilar siempre en servidor por la cola actual de nightly. La cola antigua
de fast no asigna target persistente y el guardián la rechaza antes de Cargo.
Usar la cola de un worktree nightly completo y pasar al guardián y a
--manifest-path las rutas absolutas del worktree fast, sin modificar su código.
Comprobar captura.lock antes y después de adquirir turno; Release -j 2.
Features: gpui-fast,medir-latencia; opt3/lto=false/cgu16/debug0.

Una ventana real por monitor con 1/4/10 Relative, fuentes actuales y demanda
33 ms idénticas. Se conserva el código GPUI fast y su anfitrión de producto.
Binario 17.800.192 bytes; SHA256
da5e6e08a4b2fbd09fa7869ebc8b515b89910694393578eae1b6fa9d6987592f.
Compilación final incremental 1m11s, espera de cola aparte. El primer intento
falló por un import de trait exclusivo de nightly; en fast el método ya es
inherente y solo se retiró ese import de la función de medición. Se conservaron
las advertencias preexistentes HWND y shader_path del vendor sin ocultarlas.

No ejecutar el binario en servidor. Dumpbin y procedencia se comprueban leyendo
el PE; paridad, GPU, foco, DPI, segundo monitor, OBS y latencia hasta pantalla
quedan para Isaac. Sin merge ni release.

Clippy Release all-targets -D warnings con gpui-fast,medir-latencia PASS
(3m06s) en el paquete UI; conserva las dos advertencias vendor descritas.
