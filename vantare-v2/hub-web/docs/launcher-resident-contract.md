# Adaptador del residente del Launcher

Estado: preparado en Rust; pendiente de registrar el contrato y conectarlo a la interfaz después de #2051. No cambia `native/ipc` ni el runtime/residente.

La vista contiene disponibilidad, ejecución observada, presencia de error, decisión tipada y registros reales de atajos. Reutiliza la misma proyección de Ajustes: solo confirma un registro cuando coinciden el perfil y el atajo guardados, y el estado del residente es vigente. Leer no registra nada.

Las decisiones usan ID decimal como cadena para conservar cualquier `u64` a través de JavaScript. Las acciones forman una lista cerrada y sus etiquetas proceden de `vantare_ipc::launcher::Action::label`. Esc se proyecta como `Leave` si la decisión contiene esa opción y como `Cancel` en los demás casos, igual que el Hub GPUI.

La respuesta utiliza `answer-v2`, que ya existe. Rust exige núcleo verificado y fuera de Live, vuelve a leer el estado vigente, compara la decisión y valida la acción antes de escribir el buzón solo si está libre. `Busy` es reintentable y no sustituye otra petición. Una aceptación solo significa que la respuesta quedó encolada. El mismo ID ya encolado no se presenta otra vez durante esa sesión.

Diferencias conocidas con GPUI: `Status.progress`, `Status.error` y `Decision.message` son cadenas libres que pueden contener rutas o argumentos. Se conservan en Rust; el renderer recibe estados y una clase de pregunta con texto de i18n, en vez del mensaje libre. El residente no publica un contador estructurado `n/total`, así que no se inventa. La decisión y los botones siguen teniendo la disposición y etiquetas del GPUI.
