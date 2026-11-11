# Contrato del editor de perfiles del Launcher

El renderer solo envía identificadores registrados y ajustes tipados. Nunca envía ni recibe rutas de ejecutables, comandos o argumentos. `hasCustomArguments` es informativo; no permite quitar argumentos. `key` es obligatorio: `null` para un paso nuevo o una cadena hexadecimal minúscula de exactamente 64 caracteres emitida por el anfitrión.

`launcher.profile.get` emite capacidades opacas para esa lectura. El anfitrión las vincula privadamente al perfil, la revisión de `launcher.json` y el índice original; no se guardan en el documento. Una clave conserva los argumentos del paso original si mantiene el mismo `appId`, aunque el paso cambie de posición. Sin clave o con otra aplicación, los argumentos son `None`. Las claves inventadas, repetidas, de otro perfil o de otra lectura/revisión se rechazan sin escribir.

Las claves valen para **una lectura** de la sesión. Cualquier nueva lectura reemplaza las anteriores; un intento de guardado las consume, tenga éxito o devuelva conflicto, Busy u otro error. El editor debe volver a leer antes de guardar otra vez. Tras guardar correctamente se cierra el editor y, para editar de nuevo, se abre con `profile.get`. Tras un fallo, tanto «Guardar» como «Reintentar guardado» releen antes de enviar otro guardado; «Descartar» también lee de nuevo.

Si la revisión no cambia, el editor puede renovar las claves manteniendo el índice original de cada paso. Si cambia la revisión, no hay identidad persistente de paso en el esquema actual: el editor conserva el borrador pero no reasigna argumentos por posición. Si el guardado descartaría argumentos personalizados de la lectura actual —por cambio de app, eliminación o reintento sobre otra revisión— pide confirmación explícita. Cancelar conserva el borrador y no escribe.

`editor::save` verifica perfil y revisión de las capacidades antes de llamar al adaptador privado `preserve`; la escritura CAS vuelve a comparar los bytes observados bajo el cerrojo del crate Launcher. Una respuesta que exceda el marco devuelve `Protected`, sin recortar datos ni cerrar la sesión.
