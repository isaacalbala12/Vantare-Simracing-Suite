# Guía de Configuración de OBS Studio (Local)

Esta guía explica cómo integrar los overlays de **Vantare Suite** en **OBS Studio** de forma local en el mismo ordenador donde se ejecuta la aplicación y el simulador.

---

## 1. Funcionamiento del Servidor Local de Overlays

Cuando inicias **Vantare Suite**, la aplicación arranca un servidor web interno en segundo plano.
*   **Dirección por defecto**: `http://127.0.0.1:39261`
*   **Función**: Expone las páginas de los overlays y transmite los datos del simulador mediante un canal de eventos en tiempo real (SSE) a través de `/telemetry/stream`.
*   **Ingeniero**: Las notificaciones del spotter se transmiten automáticamente a OBS a través del canal dedicado `/engineer/stream`. El widget del overlay detecta que está en modo OBS y se conecta sin configuración manual.

---

## 2. Instrucciones Paso a Paso para OBS Local

### Paso 1: Identificar el Perfil y la URL Correcta
Los overlays se generan dinámicamente según el perfil de configuración seleccionado. 

1.  Asegúrate de que la app Vantare Suite está abierta.
2.  El formato estándar de la URL para OBS es:
    ```text
    http://127.0.0.1:39261/overlay?profile=<nombre_de_archivo>
    ```
3.  Reemplaza `<nombre_de_archivo>` por el nombre real del archivo JSON o ID de tu perfil. Ejemplos válidos:
    *   `http://127.0.0.1:39261/overlay?profile=example-racing.json`
    *   `http://127.0.0.1:39261/overlay?profile=custom-hfg`

> [!TIP]
> **URL lista para copiar desde Overlays Studio**:
> La sección **OBS** al final del panel de ajustes (dock derecho) de Overlays Studio muestra la URL real del servidor interno con el perfil abierto en el editor. Haz clic en **"Copiar URL"** para obtener la URL exacta y válida en tu portapapeles, o en **"Copiar instrucciones"** para llevarte la guía paso a paso. Si no hay ningún perfil abierto, la URL usa el perfil predeterminado `example-streaming.json`.



---

### Paso 2: Añadir la Fuente en OBS Studio
1.  Abre **OBS Studio**.
2.  En el panel de **Fuentes (Sources)**, haz clic en el icono **`+`** y selecciona **Navegador (Browser)**.
3.  Asigna un nombre descriptivo a la fuente (por ejemplo, `Vantare Overlays`).
4.  En la ventana de propiedades de la fuente, configura los siguientes campos:
    *   **URL**: Pega la URL de tu perfil (ej. `http://127.0.0.1:39261/overlay?profile=example-racing.json`).
    *   **Ancho (Width)**: `1920` (o la resolución nativa de tu pantalla).
    *   **Alto (Height)**: `1080` (o la resolución nativa de tu pantalla).
    *   **Usar tasa de fotogramas personalizada**: Opcional (se recomienda dejar la de OBS).
    *   **Controlar audio mediante OBS**: Desmarcado (el Ingeniero de esta fase es puramente visual).
5.  Haz clic en **Aceptar**.

---

## 3. Actualización y Caché
*   **Refrescar cambios**: Si realizas modificaciones en el diseño (posición, columnas o colores) desde **Overlays Studio** y haces clic en **Guardar**, OBS reflejará los cambios de telemetría de inmediato.
*   **Forzar recarga**: Si por alguna razón los cambios de posición de `LayoutStudio` no se visualizan en OBS, haz clic derecho sobre la fuente de Navegador en OBS y selecciona **"Interactuar"** o haz clic en el botón **"Refrescar la caché de la página actual"** en las propiedades de la fuente.

---

## 4. Resolución de Problemas Comunes (Troubleshooting)

### Error "Failed to load profile: HTTP 404"
*   **Causa**: El nombre del perfil especificado en el parámetro `?profile=...` no existe en la carpeta `configs/` de la aplicación.
*   **Solución**: Revisa en **Overlays Studio → Mis perfiles** el nombre exacto del perfil y escríbelo tal cual en la URL de OBS.

### El overlay se muestra completamente negro o vacío
*   **Causa**: La aplicación Vantare Suite no está abierta, o el puerto de red `39261` está bloqueado por otra aplicación o cortafuegos local.
*   **Solución**:
    1.  Asegúrate de que Vantare Suite se está ejecutando.
    2.  Abre un navegador web en tu PC e ingresa a `http://127.0.0.1:39261/health`. Si devuelve `{"ok":true}`, el servidor funciona bien.
    3.  Verifica que no tengas otra instancia de la app o servidor usando el mismo puerto de red.

### Los widgets no se mueven al cambiar su posición en el Hub
*   **Causa**: No has guardado los cambios en la interfaz de diseño.
*   **Solución**: En el Hub, dentro de **LayoutStudio**, haz clic en el botón **Guardar** de la barra superior para persistir el diseño de las cajas del perfil en el disco.

---

## 5. Integración Avanzada: Doble PC (Streaming LAN)

> [!NOTE]
> **Limitación de la fase Alpha/Beta**: El soporte automatizado para doble PC (LAN) no está implementado en la interfaz de usuario en esta fase. Sin embargo, es posible configurarlo de manera manual si dispones de conocimientos técnicos.

### Configuración manual de Doble PC:
1.  **Ejecución en PC de juego**: Inicia Vantare Suite desde la terminal de comandos especificando que el servidor escuche en todas las interfaces de red locales:
    ```bash
    vantare.exe -http 0.0.0.0:39261
    ```
2.  **Identificar la IP**: Obtén la dirección IP local de tu PC de juego (ej. `192.168.1.50`).
3.  **Configuración en PC de streaming**: En el OBS de tu ordenador de transmisión, añade la fuente de Navegador apuntando a la IP del PC de juego:
    ```text
    http://192.168.1.50:39261/overlay?profile=example-racing.json
    ```
4.  **Cortafuegos**: Asegúrate de abrir el puerto `39261` (TCP) en el Firewall de Windows del PC de juego para permitir conexiones entrantes de la red local.
