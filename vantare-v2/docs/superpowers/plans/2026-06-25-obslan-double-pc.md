# Plan de Implementación: OBS Doble PC / Streaming LAN

Este documento define el plan de implementación técnica para soportar de manera oficial la integración de OBS en doble PC (LAN), permitiendo a los streamers visualizar y copiar sus URLs de red local directamente desde la interfaz del Hub, y habilitando la compatibilidad de red necesaria en el backend.

## User Review Required

> [!IMPORTANT]
> **Seguridad de Red Local (Escucha en 0.0.0.0) e IP Binding**
> Para permitir la conexión desde un PC secundario, el servidor HTTP debe escuchar en `0.0.0.0` en lugar de `127.0.0.1`. Esto expone los datos de telemetría en tiempo real y el perfil activo a cualquier dispositivo en la misma subred.
> *   *Decisión tomada*: Mantener el valor predeterminado en `127.0.0.1:39261` para máxima seguridad local. El usuario podrá activar la escucha en red local (`0.0.0.0`) de forma explícita mediante un nuevo ajuste en `app-settings.json` o mediante un control en el Hub, además del flag de consola `-http` ya existente.

> [!WARNING]
> **Riesgo de CORS Wildcard (`*`) y DNS Rebinding**
> Habilitar `Access-Control-Allow-Origin: *` de forma irrestricta cuando el servidor escucha en `0.0.0.0` introduce un riesgo de seguridad de red: una pestaña de navegador maliciosa abierta por el usuario en internet podría interactuar con el servidor local y extraer telemetría o configuraciones.
> *   *Mitigación recomendada*: **No usar CORS `*` por defecto**. OBS Studio no lo requiere, ya que al cargar la página directamente desde la dirección IP del PC de juego (`http://192.168.1.XX:39261/overlay`), se considera un origen idéntico (Same-Origin). Si se requiere CORS para integraciones de desarrolladores, debe habilitarse como una opción explícita y restringirse a los orígenes autorizados, o bien exigir un token local.

> [!CAUTION]
> **Exclusión del Firewall de Windows y Redes Públicas**
> El primer arranque en modo red local requerirá que el usuario acepte la advertencia del Firewall de Windows Defender. Se agregará un aviso visual destacado en la interfaz del Hub para guiar al usuario a no activar esto en redes públicas (Wi-Fi de hoteles o cafeterías) y usar exclusivamente el perfil de **"Red Privada"** en Windows.

> [!CAUTION]
> **Revisión Obligatoria de Arquitectura (Review GLM 5.2)**
> **CUALQUIER cambio de código** en el backend o en el enrutamiento HTTP relacionado con la integración de doble PC / LAN (incluyendo la escucha en `0.0.0.0`, CORS o tokens de seguridad) **requiere una revisión y aprobación previa y explícita del modelo GLM 5.2** antes de tocar una sola línea de código, garantizando que el diseño de red sea 100% hermético y libre de regresiones de seguridad.

---

## Open Questions

> [!NOTE]
> **¿Debemos añadir un Token de Seguridad (Read-Token) en la URL?**
> Para evitar que cualquier dispositivo conectado a la misma red local acceda a la telemetría (o que scripts maliciosos en la LAN espíen la sesión), proponemos que las URLs de red local incluyan un token de acceso aleatorio autogenerado al arrancar la aplicación (ej. `/overlay?profile=racing.json&token=a8b3d9`).
> *   *Recomendación*: Implementar este token en Fase 1 como un mecanismo transparente: el Hub genera las URLs copiables incluyendo este token, y el servidor HTTP valida que coincida.
> *   *Rate Limiting*: Proponemos añadir un rate-limiter básico por IP en el backend para evitar inundaciones accidentales de peticiones en los endpoints de telemetría y perfiles.

---

## Proposed Changes

La implementación se dividirá en tres capas: infraestructura backend para detección de IPs, cabeceras CORS en el servidor HTTP, y actualizaciones en la UI de ajustes del Hub.

### 1. Backend: Detección de IP y Configuración de Red

Se creará un nuevo servicio/helper en Go para descubrir las direcciones IP locales activas en la máquina y se expondrá a Wails.

#### [NEW] [network.go](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/internal/app/network.go)
*   Implementar la función `GetLocalIPs() ([]string, error)` utilizando el paquete estándar `net`.
*   Filtrar direcciones de bucle de retorno (`127.0.0.1`), IPv6 de enlace local y adaptadores virtuales comunes (VPNs, virtualización).
*   Implementar `NetworkService` registrado en Wails para permitir al frontend consultar las IPs locales activas del PC de juego.

#### [MODIFY] [main.go](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/cmd/vantare/main.go)
*   Instanciar y registrar `NetworkService` en el arranque de la aplicación de Wails (`wailsApp.RegisterService(...)`).

---

### 2. Servidor HTTP: Cabeceras CORS y Robustez

#### [MODIFY] [server.go](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/internal/server/server.go)
*   Crear un middleware ligero en Go para inyectar cabeceras CORS básicas en todas las respuestas HTTP y streams SSE:
    ```go
    w.Header().Set("Access-Control-Allow-Origin", "*")
    w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
    w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
    ```
*   Asegurar que las peticiones con método `OPTIONS` (preflight) se respondan inmediatamente con un estado HTTP 200 OK.

---

### 3. Frontend: Interfaz del Hub y Generador de URLs

#### [MODIFY] [SettingsPage.tsx](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/frontend/src/hub/pages/SettingsPage.tsx)
*   Crear una sección dedicada a **"Streaming en Doble PC / OBS por LAN"**.
*   Consultar de forma reactiva las IPs locales llamando a `NetworkService.GetLocalIPs()` al cargar la página.
*   Mostrar dos tarjetas interactivas de URL del overlay para el perfil activo:
    1.  **Enlace Local (Mismo PC)**: Usa `127.0.0.1`.
    2.  **Enlace LAN (PC Secundario)**: Usa la IP local detectada (ej. `192.168.1.50`). Si existen múltiples interfaces activas, permitir al usuario seleccionar la IP correcta mediante un menú desplegable sencillo.
*   Implementar botones individuales de "Copiar Enlace" con feedback visual breve (tooltip o check verde de copiado).
*   Añadir una nota explicativa sobre cómo iniciar la aplicación en modo red local (`vantare.exe -http 0.0.0.0:39261`) y la necesidad de abrir el Firewall de Windows en modo "Red Privada".

---

## Verification Plan

### Automated Tests

1.  **Tests Unitarios en Go**:
    *   Crear `internal/app/network_test.go` para verificar que el descubridor de IPs filtra correctamente la dirección local `127.0.0.1` y que el filtrado de interfaces virtuales no produce errores en entornos sin adaptadores físicos activos.
2.  **Tests de Integración del Servidor (CORS)**:
    *   Modificar `internal/server/server_test.go` para realizar peticiones HTTP de tipo `OPTIONS` y comprobar que las cabeceras `Access-Control-Allow-Origin: *` están presentes en las respuestas de `/health`, `/api/profile` y los endpoints de SSE.
3.  **Tests de Frontend (React/Vitest)**:
    *   Añadir pruebas unitarias en `SettingsPage.test.tsx` simulando el retorno de múltiples IPs desde `NetworkService` y validando que el selector de IP renderiza y copia las URLs con el formato adecuado de forma reactiva.

### Manual Verification

1.  **Prueba de Bind de Red**:
    *   Compilar y ejecutar la app especificando la escucha local-red:
        ```bash
        go run ./cmd/vantare -http 0.0.0.0:39261 -live=false
        ```
2.  **Prueba de Detección de IP**:
    *   Abrir el Hub, navegar a Ajustes y confirmar que se muestra la IP real asignada por el router de casa (ej. `192.168.1.XX`).
3.  **Prueba de Navegador Cruzado (LAN)**:
    *   Abrir el navegador de un móvil conectado al mismo Wi-Fi y entrar en la URL LAN copiada. Verificar que el overlay se carga y recibe el stream de telemetría de prueba (Mock) sin retardo apreciable.
4.  **Prueba de CORS**:
    *   Ejecutar una petición `fetch` desde la consola de desarrollo de una pestaña del navegador con origen distinto (ej. `google.com`) hacia `http://127.0.0.1:39261/health` y comprobar que no hay bloqueos de CORS.
