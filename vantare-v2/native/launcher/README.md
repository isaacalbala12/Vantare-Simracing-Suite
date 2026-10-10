# Launcher compartido

Motor sin GPUI consumido por Hub y supervisor `vantare` mediante Cargo.
Conserva catálogo, documentos, discovery local, cadenas, políticas, migración
Wails, procesos y disparadores. `files` conserva lectura acotada y guardado
atómico para los consumidores anteriores del Hub. La presentación y las
fixtures demo permanecen en `hub/src/launcher`.

Depende de serde/serde_json y services sin su feature HTTP, ya presentes:
conserva el hash y la ruta de confianza existentes. No depende de runtime
ni ui. Sus pruebas de comportamiento existentes se ejecutan en el crate
y en Hub; el lifecycle del supervisor verifica los procesos reales.

Fuera de Windows, `discovery::running_all`/`running` devuelven un error
`Unsupported` hasta implementar inspección real de procesos (#1542). Una
lista vacía afirmaría ausencia sin comprobarla y permitiría eludir Reuse/Restart.
