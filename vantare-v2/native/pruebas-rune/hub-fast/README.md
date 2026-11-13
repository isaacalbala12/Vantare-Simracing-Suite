# VANTA-141: Inicio del Hub congelado con GPUI fast

Base archivada: 56cb2c701a356eafa324e4237626952d259a77f0, que conserva
el motor fast fijado para la pieza 5. La opción medir-inicio activa el mismo
motor fast, procedencia, ventana 1440x900 y marca tras un frame completo. home.rs, demo.rs y
la carga y dibujo de las pantallas no reciben cambios.

Construir por la cola actual de nightly con el wrapper absoluto de este
worktree, build --release --locked -p vantare-hub --bin vantare-hub
--features medir-inicio -j 2. El wrapper fuerza opt-level=3, lto=false,
codegen-units=16, debug=0 e incremental=false. Respeta captura.lock.
No usar directamente la cola histórica del motor fast: no asigna target.

En el PC se inicia con --demo --control-stdin --data-dir DIR_QA_NUEVO
--pipe NOMBRE_PIPE_DE_MEDICION_NO_REAL. Inicio ya es la sección predeterminada.
No usar --capture ni --capture-batch. El controlador debe eliminar del entorno
heredado VANTARE_BETA_ROOT y VANTARE_NATIVE_DATA_ROOT y redirigir las rutas
locales a la carpeta nueva de resultados; nunca a los datos de Isaac.
El modo demo carga el fixture, omite analytics y usa privacidad de demostración.
El pipe privado evita conectarse al núcleo o cuenta reales.

Release eb8c0aa00 compilado por cola: 40.735.232 bytes, 793 s no comparables.
SHA/perfil dentro del PE y dumpbin PASS, sin ejecución. Fuentes congeladas
home.rs/demo.rs sin cambios contra 56cb2c701/745bd52b8. Aplicar el parche desde
la raíz Git con git apply --unidiff-zero. Ejecución y medición pendientes PC.
La comparación de tiempos de compilación queda pendiente autorizada por Isaac.
