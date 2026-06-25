# Plan de Investigación: OBS Doble PC / Streaming LAN

Este documento contiene la investigación técnica y el plan de diseño para soportar la integración avanzada de **OBS Studio en configuración de Doble PC (LAN)**, donde el PC de juego ejecuta el simulador y **Vantare Suite**, y el PC de transmisión (streaming) renderiza los overlays en OBS conectándose a través de la red local.

---

## 1. Respuestas a las Preguntas de Investigación

### 1. ¿Cómo se levanta hoy el servidor local?
El servidor HTTP local se inicializa y arranca en `cmd/vantare/main.go` al iniciar la aplicación:
1. Se define la dirección y puerto de escucha mediante el flag `-http` (por defecto `127.0.0.1:39261`).
2. Se instancia el servidor en `internal/server/server.go` llamando a `server.New(server.ServerConfig{...})`.
3. Se configuran las rutas/endpoints en el enrutador HTTP (`http.ServeMux`):
   *   `GET /health`: Health-check rápido.
   *   `GET /overlay`: Sirve el `index.html` compilado de la SPA (React).
   *   `GET /api/profile`: Carga el archivo JSON del perfil solicitado de la carpeta de perfiles y devuelve su configuración y origen geométrico.
   *   `GET /telemetry/stream`: Stream SSE de telemetría.
   *   `GET /engineer/stream`: Stream SSE de notificaciones del spotter.
   *   `GET /assets/` y `GET /favicon.svg`: Distribuye los archivos estáticos (JS/CSS compilados) embebidos en el binario (`frontend.DistFS`).
4. Se ejecuta el servidor de forma asíncrona mediante una goroutine con `s.srv.ListenAndServe()`.
5. Se apaga de forma segura al cerrar la aplicación utilizando `s.srv.Shutdown(ctx)` en el método `Stop()`.

---

### 2. ¿Si escucha solo en `127.0.0.1` o puede escuchar en `0.0.0.0`?
Actualmente, el servidor está configurado por defecto para escuchar en `127.0.0.1:39261` (localhost), restringiendo el acceso únicamente al mismo PC de juego. Sin embargo, **puede escuchar en `0.0.0.0` perfectamente**.
*   Esto se controla mediante el flag `-http` al iniciar el ejecutable por consola:
    ```bash
    vantare.exe -http 0.0.0.0:39261
    ```
*   Al realizar este enlace (bind) a `0.0.0.0`, Go le indica al sistema operativo que acepte conexiones entrantes en el puerto `39261` a través de **cualquier interfaz de red activa** (red local ethernet, Wi-Fi, y localhost).

---

### 3. ¿Qué endpoints necesita OBS remoto?
Para que el PC de streaming renderice los overlays correctamente mediante una fuente de Navegador (Browser Source), necesita acceso a los siguientes endpoints alojados en el PC de juego:
1.  **`GET /overlay?profile=<nombre_perfil>`**: Carga el contenedor React en el navegador de OBS.
2.  **`GET /assets/*`**: Descarga los estilos CSS y bundles de JavaScript necesarios para renderizar la página.
3.  **`GET /api/profile?profile=<nombre_perfil>`**: Llamada interna de React para recuperar las posiciones de los widgets y sus variantes configuradas.
4.  **`GET /telemetry/stream`**: Canal de Server-Sent Events (SSE) que transmite las actualizaciones en tiempo real a los widgets.
5.  **`GET /engineer/stream`**: Canal SSE dedicado que transmite las notificaciones visuales del spotter.
6.  **`GET /health`**: Utilizado para diagnósticos de conexión del PC remoto.

*Nota de diseño excelente*: Al usar URLs relativas en el frontend (ej. `fetch('/api/profile')` y `new EventSource('/telemetry/stream')`), el navegador de OBS en el PC de streaming resuelve automáticamente las consultas contra la dirección IP del PC de juego (el origen de la página), por lo que **no se requiere configurar dinámicamente la IP en el código del cliente**.

---

### 4. Riesgos y Mitigaciones Técnicas

*   **Firewall de Windows**:
    *   *Riesgo*: Por defecto, el Cortafuegos de Windows bloquea conexiones entrantes en puertos no estándar como el `39261`.
    *   *Mitigación*: Al escuchar en `0.0.0.0`, Windows mostrará al usuario una alerta de seguridad de red. Debemos documentar explícitamente en la UX que el usuario debe marcar "Permitir acceso en redes privadas".
*   **Tipo de Red (Pública vs. Privada)**:
    *   *Riesgo*: Si el perfil de red de Windows del PC de juego está configurado como "Público", el firewall ignorará las reglas de exclusión y bloqueará la conexión LAN.
    *   *Mitigación*: Documentar que el adaptador de red en Windows debe estar establecido como **"Red Privada"** en ambos PCs.
*   **Exposición LAN y Seguridad**:
    *   *Riesgo*: Al abrir el puerto a `0.0.0.0`, cualquier dispositivo de la red local puede acceder a la telemetría del simulador y leer las configuraciones de los perfiles.
    *   *Mitigación*: Los endpoints expuestos son puramente de lectura (`GET`). No existen APIs de modificación (`POST`/`DELETE`) en el servidor HTTP remoto (las operaciones de edición se realizan exclusivamente mediante el bridge nativo de Wails en local). Por seguridad, se debe advertir al usuario que **nunca realice redirección de puertos (port-forwarding) en su router** hacia el puerto `39261` para no exponer su telemetría a Internet.
*   **Falta de Cabeceras CORS**:
    *   *Riesgo*: Actualmente el servidor no expone cabeceras de origen cruzado (`Access-Control-Allow-Origin`). Aunque OBS funciona bien porque carga la página directamente desde la IP del servidor (mismo origen), si un usuario intentara usar un archivo HTML local (`file:///...`) que apunte a la IP remota de Vantare, las llamadas de red fallarían por restricciones de CORS.
    *   *Mitigación*: Añadir soporte CORS básico (`*` o el origen del cliente) a los endpoints `/api/profile`, `/telemetry/stream` y `/engineer/stream`.
*   **Latencia de Red y Wi-Fi**:
    *   *Riesgo*: La telemetría en tiempo real requiere flujos fluidos (30Hz). Si el PC de streaming o el de juego están conectados por Wi-Fi inestable, la pérdida de paquetes provocará tirones visuales en las barras o tablas.
    *   *Mitigación*: Recomendar conexión por cable Ethernet Gigabit en ambos ordenadores.
*   **Perfiles no encontrados o nombres inválidos**:
    *   *Riesgo*: Si la URL del PC de streaming apunta a un perfil que no existe en el PC de juego, el servidor devolverá un error HTTP 404 y OBS se quedará vacío.
    *   *Mitigación*: Normalizar la URL copiada para evitar errores tipográficos y dar una respuesta visual clara de 404.

---

### 5. UX Mínima Recomendada
Para ofrecer una experiencia premium y automatizada en la sección de **Ajustes** del Hub:

1.  **Detección de IP LAN en Go**:
    *   Implementar un método en el backend que escanee las interfaces de red activas del PC de juego, filtre las IPs de bucle de retorno (`127.0.0.1`) y las virtuales (VirtualBox, VPNs), y obtenga la IP real de la red local (ej. `192.168.1.50`).
2.  **Visualización Paralela en el Hub**:
    *   Mostrar claramente dos secciones en la configuración de OBS:
        *   **Conexión Local (Mismo PC)**: `http://127.0.0.1:39261/overlay?profile=example-racing.json`
        *   **Conexión Doble PC (Red Local)**: `http://<IP_LAN>:39261/overlay?profile=example-racing.json`
3.  **Botón de Copiar Inteligente**:
    *   Un botón reactivo que copie la URL seleccionada directamente al portapapeles.
4.  **Alerta de Cortafuegos y Seguridad**:
    *   Un cartel informativo breve: *"Para streaming en doble PC, asegúrate de iniciar Vantare con el flag de red abierta y configurar tu Firewall de Windows para permitir tráfico local"*.

---

### 6. Cómo Testearlo sin Dos PCs
Podemos verificar la estabilidad de red y el comportamiento LAN usando un único ordenador de desarrollo de la siguiente forma:

1.  **Levantar el Servidor en `0.0.0.0`**:
    *   Iniciar el backend de Vantare desde una consola especificando la escucha en todas las interfaces:
        ```bash
        go run ./cmd/vantare -http 0.0.0.0:39261 -live=false
        ```
        *(Usamos `-live=false` para que inyecte telemetría sintética de pruebas sin requerir abrir el simulador LMU)*.
2.  **Identificar la IP LAN local**:
    *   Ejecutar `ipconfig` en Windows y localizar la dirección IPv4 de la tarjeta de red activa (ej. `192.168.1.15`).
3.  **Prueba desde Dispositivo Externo**:
    *   Conectar un teléfono móvil, tablet u otro ordenador a la misma red Wi-Fi local.
    *   Navegar en el dispositivo móvil a `http://192.168.1.15:39261/health`. Debe responder `{"ok":true}` de inmediato.
    *   Navegar a `http://192.168.1.15:39261/overlay?profile=example-racing.json`. El navegador móvil debe renderizar la interfaz del overlay y reflejar los movimientos de los coches del modo Mock de forma fluida a 30 FPS.
4.  **Prueba con OBS en el mismo PC a través de la IP LAN**:
    *   Abrir OBS Studio en la misma máquina.
    *   Crear una fuente de Navegador apuntando a la IP de la interfaz local (`http://192.168.1.15:39261/...`) en lugar de `127.0.0.1`.
    *   Comprobar las herramientas de desarrollo de OBS (clic derecho en la fuente > Interactuar > F12 si está configurado) y verificar que las conexiones de red no sufren bloqueos de seguridad y que el stream de eventos SSE fluye de forma constante.
