# Guía de Pruebas para Testers - Vantare Suite (Beta Abierta)

Bienvenido a la **Beta Abierta** de **Vantare Suite** — la suite local para sim racing con Overlays Studio, Ingeniero y telemetria live para Le Mans Ultimate.

> [!IMPORTANT]
> **Aviso de SmartScreen / Firma de codigo no disponible**
> Los ejecutables de esta beta **no tienen firma digital (Authenticode)**. Windows SmartScreen mostrara una advertencia de "Editor desconocido" al ejecutar el instalador o el portable. Esto es normal y esperado. Haz clic en **"Mas informacion"** → **"Ejecutar de todas formas"**. La firma de codigo se implementara antes del release estable v1.0.
> Los checksums SHA256 publicados junto a cada descarga permiten verificar la integridad del binario (ver seccion 6).

---

## 1. Requisitos del Sistema y Preparación

Para ejecutar la aplicación y realizar las pruebas en modo de telemetría en vivo, necesitas:
*   **Sistema Operativo**: Windows 10 u 11 (64 bits).
*   **Simulador**: Le Mans Ultimate (LMU) instalado y configurado para compartir memoria.
*   **Modo de prueba sin simulador**: La app incluye un modo **Mock** (con datos sintéticos) por defecto si el simulador no está abierto, lo que permite probar la interfaz y los widgets en cualquier momento.

---

## 2. Instalación y Ejecución

Tienes dos métodos para abrir la aplicación suministrada en el paquete:

### Método A: Instalador NSIS (Recomendado)
1. Ejecuta el archivo `vantare-amd64-installer.exe`.
2. Sigue los pasos del asistente de instalación de Windows.
3. Abre la aplicación desde el acceso directo del escritorio o el menú Inicio.

### Método B: Ejecutable Portable
1. Extrae el contenido del archivo comprimido de distribución en una carpeta local.
2. Asegúrate de que la carpeta `configs/` que contiene los perfiles predeterminados está en la misma ruta que el ejecutable `vantare.exe`.
3. Haz doble clic en `vantare.exe` para iniciar.

---

## 3. Flujo de Pruebas Recomendado

### Bloque A: Overlays Studio (Edición de Widgets)
1. En el menú lateral del Hub, entra en **Overlays Studio**.
2. Haz clic en el panel **Widgets** y selecciona uno de los widgets configurables principales:
   *   **Relative**
   *   **Standings**
3. **Prueba de columnas y filtros**:
   *   Activa o desactiva columnas opcionales en el panel derecho.
   *   Modifica anchos, formatos de tiempo (Vuelta rápida, Última vuelta) y alineación.
   *   Observa cómo la **Preview Aislada** central ajusta su ancho intrínseco automáticamente sin dejar espacios vacíos a la derecha ni recortar los nombres de forma forzada.
4. **Prueba de escenarios sintéticos (Standings)**:
   *   Cambia el selector de escenario en la preview entre `Práctica`, `Qualy` y `Carrera`.
   *   Verifica que los datos cambian coherentemente para simular cada tipo de sesión.
   *   **Nota**: Cambiar el escenario de la preview no modifica el perfil ni activa el botón **Guardar**.
5. **Guardar cambios**:
   *   Modifica una columna real y confirma que el botón **Guardar** en la cabecera superior derecha pasa a estar activo.
   *   Haz clic en **Guardar** para persistir los cambios en tu perfil.

### Bloque B: Gestión de Perfiles y Lienzo (LayoutStudio)
1. En la pantalla principal de **Overlays Studio**, navega a **Mis perfiles**.
2. **Recomendados por Vantare**:
   *   Entra en la sección de recomendados, selecciona un perfil predefinido y haz clic en **Guardar como perfil propio**.
   *   Confirma que se crea una copia editable con el sufijo `(copia)` en tu sección de **Mis perfiles**.
3. **Control del Overlay**:
   *   En la tarjeta de tu perfil activo, haz clic en **Abrir overlay**.
   *   Se abrirá una ventana transparente de pantalla completa que mostrará tus widgets configurados sobre el escritorio.
4. **Edición de Layout**:
   *   Haz clic en **Editar layout** en tu perfil.
   *   Entrarás a la cuadrícula de diseño. Arrastra los widgets para cambiar su posición y usa los tiradores para redimensionarlos.
   *   Haz clic en **Guardar** en la barra superior.
   *   Verifica que el overlay abierto en tu pantalla se updates en tiempo real reflejando la nueva distribución y escala proporcional.

### Bloque C: Sección del Ingeniero
1. En el menú lateral, haz clic en **Ingeniero**.
2. Revisa la pantalla de control donde puedes ajustar el nivel de sensibilidad del spotter y activar/desactivar sus avisos.
3. Propara un mensaje de prueba a través del modo simulator/replay si está activo.
4. Verifica que el historial de notificaciones del Hub muestra los mensajes entrantes de forma reactiva.
5. Abre tu overlay y comprueba que el widget `engineer-notifications` muestra las alertas del spotter en tiempo real con sus animaciones y que estas desaparecen automáticamente cuando expira su tiempo (`expiresAt`).

---

## 4. Atajos de Teclado Globales (Hotkeys)

Vantare Suite incluye soporte para atajos de teclado globales nativos en Windows. Esto te permite interactuar con la aplicación en segundo plano mientras conduces en el simulador (incluso cuando el juego tiene el foco a pantalla completa).

### Hotkeys predeterminadas disponibles:
*   `ctrl+shift+v`: **Toggle Overlay**. Alterna (muestra u oculta) de forma instantánea el overlay activo en tu pantalla.
*   `ctrl+shift+right`: **Siguiente perfil**. Cambia tu overlay activo al siguiente perfil en tu lista de perfiles (solo funciona si el overlay está en ejecución).
*   `ctrl+shift+left`: **Perfil anterior**. Cambia tu overlay activo al perfil anterior en tu lista de perfiles (solo funciona si el overlay está en ejecución).

> [!IMPORTANT]
> **Privilegios de Administrador (UAC)**
> Si ejecutas Le Mans Ultimate (LMU) con privilegios de Administrador (muy común para compatibilidad con ciertos volantes o herramientas de telemetría de terceros), Windows por seguridad impedirá que Vantare capture los atajos globales si se está ejecutando con permisos normales. Para solucionarlo, **debes abrir Vantare Suite como Administrador** (clic derecho sobre el ejecutable o acceso directo > *Ejecutar como administrador*).

> [!WARNING]
> **Colisiones con otros programas**
> Si otra aplicación que se ejecuta en segundo plano (como GeForce Experience, el software de AMD, Steam, Discord u OBS Studio) ya tiene registrado alguno de estos atajos, Windows no permitirá que Vantare lo registre. Puedes cambiar y personalizar estas combinaciones de teclas en cualquier momento desde la página de **Ajustes** en el Hub de Vantare y hacer clic en **Guardar atajos**.

---

## 5. Widgets y su estado actual

Cada widget tiene un estado que refleja su madurez para la beta:

| Widget | Estado | Que puedes probar |
|--------|--------|-------------------|
| **Relative** | ✅ Stable | Columnas configurables, filtros de clase/rango, ancho intrinseco en preview. |
| **Standings** | ✅ Stable | Columnas configurables, escenarios mock (Practica/Qualy/Carrera), variantes schema v2. |
| **Delta** | ✅ Stable | Delta best live nativo LMU, muestra Target y Lap. Valores negativos en verde, positivos en rojo. |
| **Pedals** | 🟡 Tester | Maqueta compacta CLT/BRK/THR. Colores editables desde WidgetStudio (throttle, brake, clutch). |
| **Ingeniero (notifications)** | 🟡 Tester | Widget de notificaciones del spotter. Funciona en modo simulacion/replay. Historial visible en el Hub. |
| **Track Map** | 🔴 Experimental | En desarrollo, no disponible. |
| **Input Telemetry/Trace** | 🔴 Experimental | En desarrollo, no disponible. |

> **Stable**: listo para uso general. **Tester**: funcional pero puede tener cambios o necesitar validacion adicional. **Experimental**: en desarrollo, no disponible para testers.

## 6. ¿Qué NO está soportado todavía? (Limitaciones de la Beta)

Por favor, no reportes como fallos las siguientes características planificadas para fases posteriores:
*   **Ingeniero con LMU en vivo real (Fase EN6)**: La conexión del spotter con LMU live está en desarrollo. Actualmente funciona en modo simulación/replay.
*   **Audio/Voces TTS del Ingeniero**: Los avisos son puramente visuales y textuales.
*   **Widget Pedals Completo**: Es una maqueta estética inicial. Lectura de embrague y calibración profundas se completarán post-beta.
*   **Soporte Multisimulador**: Exclusivo para Le Mans Ultimate. iRacing, Assetto Corsa, etc. tras release estable v1.0.
*   **Doble PC / LAN para OBS**: La URL local funciona, pero la optimización de red para streaming remoto no forma parte del alcance actual. Configuracion manual posible (ver guia OBS).

## 7. Autoupdater

Vantare Suite incluye un sistema de actualizacion automatica:

- Al iniciar la app, verifica si hay una nueva version en GitHub Releases.
- Si hay una actualizacion, aparece un banner en el Hub. Puedes hacer clic para descargar e instalar.
- El instalador descargado se verifica contra su checksum SHA256 antes de ejecutarse.
- Si el checksum no esta disponible, la instalacion desde el updater se rechaza. En ese caso descarga el instalador manualmente desde Discord/GitHub y verifica el SHA256 publicado.
- Tambien puedes ir a **Ajustes → Actualizaciones** para buscar actualizaciones manualmente.

## 8. Verificacion de Checksums SHA256

Cada descarga (installer, portable zip, binario) se publica con su archivo `.sha256` sidecar. Puedes verificar la integridad del archivo descargado:

```powershell
# Opcion A: PowerShell
Get-FileHash .\vantare-amd64-installer.exe -Algorithm SHA256

# Opcion B: certutil (Windows nativo, sin dependencias externas)
certutil.exe -hashfile .\vantare-amd64-installer.exe SHA256
```

Compara el hash obtenido contra el publicado en `#beta-downloads` o en el archivo `.sha256` de la GitHub Release. Si coinciden, el archivo no ha sido alterado.

## 9. Politica de versionado

- **No se publica una release por cada commit.** Las versiones se acumulan y se publican mediante un tag `v*` cuando hay un conjunto de cambios coherente.
- Las builds de desarrollo diarias no se distribuyen a testers.
- Cada version publicada incluye entrada en el changelog y anuncio en Discord.

---

## 10. Cómo Reportar Bugs

Si encuentras un comportamiento inesperado, errores visuales o problemas de rendimiento:
1. **Captura de pantalla o vídeo**: Toma una captura del problema (especialmente si es un fallo visual en el editor o en el overlay).
2. **Pasos para reproducir**: Describe detalladamente qué acciones realizaste justo antes de que ocurriera el fallo.
3. **Archivos de configuración**: Si el problema está relacionado con perfiles que no se guardan o se visualizan mal, adjunta el archivo JSON del perfil afectado que se encuentra en la carpeta `configs/`.
4. **Log de errores**: Si la app se cierra inesperadamente, comprueba si existe algún archivo `.log` en la carpeta raíz y adjúntalo.

---

## 11. Documentos Relacionados

*   Para conocer la lista completa de problemas identificados y limitaciones actuales, consulta la [Guía de Incidencias Conocidas (Known Issues)](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/docs/tester-known-issues.md).
*   Para saber cómo y dónde reportar fallos y compartir tus comentarios, revisa el [Protocolo de Feedback y Reporte de Bugs](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/docs/tester-feedback-process.md).
*   Para configurar los overlays en tu software de transmisión, consulta la [Guía de Configuración de OBS Studio (Local)](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/docs/obs-local-setup.md).
