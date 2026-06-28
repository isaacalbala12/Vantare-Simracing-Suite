# Protocolo de Feedback y Reporte de Bugs - Beta Abierta

¡Gracias por ayudarnos a probar **Vantare Suite**! Para mantener el desarrollo ordenado y solucionar los problemas lo más rápido posible, hemos establecido este protocolo de comunicación a través de nuestro servidor de Discord.

---

## 1. Estructura de Canales en Discord

Para las pruebas de la Beta Abierta, utilizaremos los siguientes canales dedicados:

*   📢 **`#beta-announcements`**: Comunicados oficiales de desarrollo y publicación de nuevas builds.
*   💾 **`#beta-downloads`**: Enlaces de descarga del instalador, binarios portables y checksums SHA256.
*   📌 **`#beta-known-issues`**: Lista viva de fallos conocidos bajo investigación (sincronizada con el documento de incidencias).
*   🐛 **`#beta-bug-reports`**: Canal exclusivo para reportar fallos utilizando la plantilla obligatoria.
*   💡 **`#beta-feedback`**: Canal libre para proponer sugerencias, ideas de diseño, mejoras visuales y debates generales.

---

## 2. ¿Qué SÍ y qué NO reportar?

### ✅ SÍ debes reportar (En `#alpha-bug-reports`)
*   **Crashes**: La aplicación se cierra sola al abrirla o durante su uso.
*   **Fallos de persistencia**: Haces cambios en `WidgetStudio` o `LayoutStudio`, haces clic en **Guardar**, pero al cerrar y reabrir la app los cambios se pierden.
*   **Discrepancias visuales**: El widget se ve de una forma en la preview de `WidgetStudio` pero cambia de tamaño, posición o diseño al abrir el overlay real o cargarlo en OBS.
*   **Problemas de recorte (Clipping)**: Textos cortados, tablas que no se muestran completas o espacio vacío gigante y anómalo a los lados de los widgets.
*   **Errores en OBS**: La URL local `/overlay?profile=...` no renderiza correctamente los widgets o no se conecta al flujo de datos.
*   **Problemas en perfiles**: Errores al duplicar perfiles recomendados o al guardar perfiles personalizados.

### ❌ NO debes reportar (Fuera de Scope)
*   Ausencia de audio o voces de spotter en la sección de Ingeniero.
*   Falta de datos en tiempo real del Ingeniero conduciendo en LMU (se simula mediante replay).
*   Falta de telemetría precisa en los widgets de pedales.
*   Soporte para otros simuladores que no sean Le Mans Ultimate.
*   Propuestas de reworks visuales completos de pantallas (el diseño actual de `WidgetStudio` está fijado para esta fase).
*   Advertencia de SmartScreen al ejecutar la app (comportamiento esperado, ver Known Issues).
*   Widget Track Map o Input Telemetry/Trace no disponibles (son experimentales, no incluidos).

---

## 3. Plantilla Obligatoria de Reporte de Bugs

Cuando encuentres un fallo, por favor copia y rellena la siguiente plantilla en el canal **`#beta-bug-reports`**:

```text
**[Bug] Nombre corto descriptivo del problema**

- **Versión de la App**: v0.3.10.0 (o la que corresponda)
- **Versión de Windows**: Windows 10 / Windows 11
- **Simulador Abierto**: Sí / No
- **Origen de datos**: Live (LMU abierto) / Mock (sintético)
- **Modo de visualización**: Overlay de escritorio / OBS local

**Pasos para reproducir:**
1. [Ejemplo: Entrar a Overlays Studio]
2. [Ejemplo: Hacer clic en Widgets -> Relative]
3. [Ejemplo: Desactivar la columna de vuelta rápida y guardar]

**Resultado esperado:**
[Ejemplo: El widget debe guardarse sin la columna y ajustar su ancho automáticamente]

**Resultado actual:**
[Ejemplo: La columna desaparece pero queda un espacio negro vacío a la derecha]

**Capturas/Vídeos:**
[Arrastra aquí tu captura de pantalla o vídeo demostrando el fallo]

**JSON de Perfil (Opcional pero recomendado):**
[Si el fallo es con un perfil, adjunta el archivo JSON correspondiente de la carpeta `configs/`]

**Checksum del instalador/portable (Opcional):**
[Solo si el fallo es de instalacion, descarga o actualizacion. Adjunta el SHA256 de tu descarga para verificar integridad]
```
