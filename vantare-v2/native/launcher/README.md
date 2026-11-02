# Launcher compartido

Motor sin GPUI consumido por Hub y supervisor `vantare` mediante Cargo.
Conserva catálogo, documentos, discovery local, cadenas, políticas, migración
Wails, procesos y disparadores. `files` conserva lectura acotada y guardado
atómico para los consumidores anteriores del Hub. La presentación y las
fixtures demo permanecen en `hub/src/launcher`.

Depende de serde/serde_json, IPC (escritor común) y services sin su feature HTTP, ya presentes:
conserva el hash y la ruta de confianza existentes. No depende de runtime
ni ui. Sus pruebas de comportamiento existentes se ejecutan en el crate
y en Hub; el lifecycle del supervisor verifica los procesos reales.

Fuera de Windows, `discovery::running_all`/`running` devuelven un error
`Unsupported` hasta implementar inspección real de procesos (#1542). Una
lista vacía afirmaría ausencia sin comprobarla y permitiría eludir Reuse/Restart.

El cierre normal de apps propias mata y recoge sus procesos. La API
`processes::Processes::request_close_profile` sólo solicita la terminación y
consulta el estado, sin `wait`: el supervisor la usa después de vencer P.
La espera de confirmación pertenece al cierre normal o al arnés de pruebas,
no al camino forzado. Sólo actúa mediante los handles de hijos registrados.

El Hub abre un Launcher dañado con el catálogo por defecto y aviso de su copia
`.invalid`, conservando bytes originales para el siguiente CAS. Una versión
futura se protege sin copia ni importación Wails y no se puede sobrescribir.
El residente también conserva los originales; sin perfiles válidos no hay nada
que lanzar. La importación Wails activa se retira en el paso 9, no en este PR.
