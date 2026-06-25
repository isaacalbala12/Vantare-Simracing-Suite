# Auditoría de Endurecimiento de Perfiles, Schema y Backup (PROF1)

Este documento presenta una auditoría técnica detallada sobre la robustez y seguridad del sistema de perfiles, variantes y layouts en **Vantare Suite**, con el objetivo de prevenir la pérdida de perfiles, la corrupción de datos en disco y comportamientos anómalos durante las pruebas de la beta.

---

## 1. Análisis de los Puntos Solicitados

### 1. Carga Legacy v1
- **Mecanismo actual**: La función `config.LoadFile` lee y parsea el archivo JSON del perfil sin validar de forma restrictiva la presencia de la versión del esquema. Si el archivo no cuenta con `schemaVersion: 2` ni con los bloques `layouts` o `variants`, se carga directamente en memoria el arreglo plano de `widgets`.
- **Mitigación de riesgos**: Al iniciar el Hub, la función frontend `withDefaultWidgetVariants` detecta perfiles legacy e inyecta dinámicamente en memoria las propiedades normales de variantes por defecto (`variant-${widget.id}-default`). Esto asegura que la interfaz no falle.
- **Riesgo residual**: Si un tester edita un perfil legacy cargado directamente desde disco sin pasar por el Hub (por ejemplo, mediante una API directa o llamada manual), el backend en Go podría no inicializar de forma segura las variantes por defecto si se omiten las llamadas de inicialización de Wails, lo que causaría que el frontend no pueda rellenar los datos.

### 2. Conversión a Schema v2
- **Mecanismo actual**: La conversión se realiza en el backend mediante `config.ConvertProfileToV2(p)`, la cual devuelve un clon profundo v2 sin mutar el puntero de entrada. Esta función inicializa el `schemaVersion = 2`, genera las variantes por defecto para los widgets de tipo `relative` y `standings`, y crea el layout `general` obligatorio a partir de las coordenadas planas de `widgets`.
- **Evaluación**: La separación es limpia. No hay migración silenciosa ni destructiva en la carga inicial de disco; la conversión a v2 ocurre en memoria y solo se escribe físicamente en disco cuando el usuario realiza una acción explícita de modificación, como un guardado de diseño o el duplicado de un recomendado.

### 3. widgets Espejo vs. layouts.general.widgets
- **Mecanismo actual**: En el schema v2, la configuración posicional de los widgets vive bajo el objeto `layouts.general.widgets`. Sin embargo, para mantener una compatibilidad absoluta hacia atrás con renderizadores legacy (como versiones anteriores de la app o integraciones sencillas), la función `config.SetGeneralLayoutWidgets` mantiene un espejo actualizado del arreglo `widgets` al mismo nivel de la raíz del JSON.
- **Riesgo residual**: Hay una doble fuente de verdad en el archivo JSON físico. Si un editor externo modifica el arreglo raíz `widgets` pero no actualiza `layouts.general.widgets`, al volver a cargar el perfil en la suite v2 se podría priorizar el layout `general` sobre el espejo raíz, perdiéndose los cambios manuales del usuario.

### 4. Persistencia de variants
- **Mecanismo actual**: Las variantes de widgets (que definen las columnas activas, filtros y formatos de visualización) se almacenan en el arreglo plano `variants` en la raíz del perfil JSON. Cada instancia de widget en un layout referencia su configuración correspondiente mediante el campo `variantId`.
- **Evaluación**: El desacoplamiento es correcto y sigue las mejores prácticas de diseño. Los datos internos del widget (apariencia, formato, columnas) se separan físicamente de la información posicional del lienzo (x, y, w, h). Esto permite que múltiples layouts referencien la misma variante compartida.

### 5. Rollback en Error de Disco
- **Mecanismo actual**: En `ProfileService.SaveProfileState` (en Go), antes de realizar cualquier mutación sobre el perfil en memoria, el sistema realiza copias de seguridad de los campos mutables:
  ```go
  backupWidgets := s.profile.Widgets
  backupLayouts := config.CopyProfileLayouts(s.profile.Layouts)
  backupVariants := config.CopyProfileVariants(s.profile.Variants)
  ```
  Si la llamada de escritura física en disco `config.SaveFile` devuelve un error (por ejemplo, por disco lleno, permisos denegados o archivo bloqueado), el servicio restaura de inmediato los arreglos en memoria y propaga el error hacia arriba.
- **Evaluación**: Excelente nivel de robustez. Garantiza que un fallo de E/S no deje la memoria de la aplicación en un estado inconsistente o divergente de lo que realmente quedó persistido en el disco.

### 6. Copia de Recomendados como Perfil Propio
- **Mecanismo actual**: Al hacer clic en "Guardar como perfil propio", el frontend clona el JSON de solo lectura del recomendado, elimina cualquier ID persistente del sistema, añade metadata de origen (`source: { kind: "recommended", ... }`), le asigna un nombre con sufijo `(copia)` y llama a `HubService.SaveProfileAsOwnCopy`. El backend valida el ID, resuelve colisiones de archivos y lo escribe en el directorio de usuario convertido a schema v2.
- **Evaluación**: Es seguro y previene colisiones accidentales o mutaciones sobre los presets de solo lectura suministrados con la suite.

### 7. IDs Únicos de Perfil
- **Mecanismo actual**: El backend implementa `uniqueProfileFileID` en `hub_service.go`, la cual comprueba si un archivo con el ID deseado existe. Si existe, inicia un bucle incremental añadiendo sufijos numéricos (ej. `custom-profile-1.json`, `custom-profile-2.json`) hasta encontrar una ranura vacía.
- **Evaluación**: Idempotente y robusto. Evita la sobreescritura accidental si el usuario duplica el mismo recomendado varias veces o crea perfiles con nombres idénticos.

### 8. Riesgo de Autosave vs. Guardado Explícito
- **Análisis**: El comportamiento inicial con guardado automático (autosave) ininterrumpido en `WidgetStudio` provocaba regresiones en la experiencia de usuario (desenfoque de inputs de texto, parpadeo de selecciones al guardarse en disco y sincronizarse dinámicamente con Wails). La implementación del botón de guardado explícito en la cabecera superior derecha de `WidgetStudio` resolvió este problema de interacción de raíz.
- **Evaluación**: La UI se comporta de forma predecible y la persistencia en disco ocurre únicamente bajo demanda del usuario, reduciendo el desgaste de ciclos de escritura/lectura y previniendo estados intermedios corruptos.

### 9. Riesgo de Edición Simultánea (WidgetStudio vs. LayoutStudio)
- **Análisis**: Aunque el editor separa de forma estricta el alcance de ambos estudios (`WidgetStudio` edita el interior de la variante; `LayoutStudio` edita la posición en el lienzo), si un usuario abre simultáneamente el Hub (con `WidgetStudio` activo en un navegador o monitor secundario) y el lienzo de edición en el overlay de escritorio, las escrituras concurrentes podrían colisionar.
- **Riesgo**: `LayoutStudio` emite `layout:save` mandando el arreglo completo de widgets. Si `WidgetStudio` no está sincronizado en ese mismo instante, la sobreescritura en disco de uno de los servicios pisará la última mutación del otro debido a que ambos consumen y actualizan el archivo físico completo.

### 10. Perfiles Corruptos o Parciales
- **Análisis**: Si un tester altera manualmente un archivo JSON de perfil dejando una sintaxis incorrecta o eliminando llaves obligatorias, `LoadFile` devolverá un error de parseo (`json.Unmarshal`).
- **Comportamiento actual**: El arranque de `main.go` intercepta este error al cargar el perfil de inicio y carga un perfil por defecto virtual en memoria (`default-fallback`) para que la app no crashe al iniciar. Sin embargo, no se informa al usuario de que su perfil de inicio está corrupto; la app arranca silenciosamente usando la configuración por defecto, lo que puede confundir al tester.

### 11. Necesidad de Backup antes de Guardar
- **Análisis**: En sistemas operativos modernos, si la escritura física en disco mediante `os.WriteFile` se interrumpe de forma abrupta (corte de energía, crasheo del proceso de Wails o apagado forzado), el archivo original se corrompe y su contenido queda en blanco o con datos parciales irrecuperables.
- **Falta actual**: Actualmente, `config.SaveFile` escribe directamente sobre el archivo destino (`0644`). No hay un flujo de escritura segura a nivel de sistema de archivos (como escribir primero a un archivo temporal `.tmp` y luego renombrarlo atómicamente, o mantener una copia `.bak` de la versión anterior).

### 12. Necesidad de Export/Import Manual para Testers
- **Análisis**: En la fase Alpha/Beta, los testers necesitan compartir sus perfiles personalizados para reportar fallos de diseño o compartirlos en el canal `#alpha-feedback`.
- **Falta actual**: No existe un botón en la interfaz de la aplicación para "Exportar Perfil" (que descargue el archivo JSON) ni "Importar Perfil" (que cargue un JSON externo). Los testers deben buscar manualmente los perfiles en la ruta física `%APPDATA%` o en la carpeta del ejecutable.

---

## 2. Hallazgos y Severidades de la Auditoría

| ID | Hallazgo | Severidad | Descripción | Mitigación Recomendada |
| :--- | :--- | :---: | :--- | :--- |
| **PROF-H1** | Falta de escritura atómica en disco | **P2** (Importante) | Si la app crashea a mitad de `SaveFile`, el perfil JSON se destruye por completo. | Cambiar la lógica de guardado en Go para escribir en un temporal y renombrar de forma atómica. |
| **PROF-H2** | Doble fuente de verdad en perfiles v2 | **P3** (Menor) | El arreglo `widgets` y `layouts.general.widgets` conviven en el mismo archivo físico. | Implementar validación en la carga de perfiles para detectar divergencias y priorizar. |
| **PROF-H3** | Falta de exportación/importación en la interfaz | **P3** (Menor) | Dificulta a los testers el flujo de reporte de fallos y compartición de configuraciones. | Añadir controles simples en "Mis perfiles" para descargar y cargar perfiles JSON. |
| **PROF-H4** | Degradación silenciosa ante perfiles corruptos | **P3** (Menor) | Si el JSON de inicio está corrupto, carga el fallback sin notificar el error visualmente. | Mostrar un banner de advertencia en el Hub si la app tuvo que arrancar en modo fallback. |

*Nota sobre Stop Conditions*: Ninguno de los hallazgos califica como P0/P1 bloqueante para la distribución inmediata de la alpha actual, ya que no impiden el arranque del sistema bajo uso normal. Son clasificados como P2/P3 de endurecimiento para la beta, por lo que se anexa un plan específico de corrección.
