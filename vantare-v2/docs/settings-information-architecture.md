# Arquitectura de Información de la Página de Ajustes (SET1)

Este documento define la estructura de navegación, la distribución de controles y el diseño de la experiencia de usuario (UX) para la página de **Ajustes** de **Vantare Suite**. El objetivo es organizar la creciente cantidad de configuraciones locales (OBS, hotkeys, actualizador, diagnósticos, telemetría en vivo y futuros soportes LAN) bajo un esquema coherente, intuitivo y de baja fricción para los testers y usuarios finales.

---

## 1. Estructura de Secciones Recomendada

Para evitar que la página de Ajustes se convierta en una lista interminable de paneles planos, se propone organizar la interfaz mediante una estructura de **pestañas laterales (Sidebar Tabs)** o **secciones colapsables de flujo vertical claro (Section Accordions)**.

Las secciones propuestas y sus contenidos específicos son:

### 📑 Sección 1: General
- **Propósito**: Ajustes básicos del comportamiento de la aplicación.
- **Controles**:
  - *Ejecutar al inicio*: Toggle para arrancar Vantare Suite al encender Windows (minimizado en la bandeja del sistema).
  - *Idioma*: Selector de idioma de la suite (Español / Inglés).
  - *Minimizar al cerrar*: Toggle para ocultar la app en la bandeja del sistema en lugar de cerrarla al presionar la `X`.

### 📊 Sección 2: Telemetría
- **Propósito**: Controlar cómo se leen y fusionan los datos del simulador.
- **Controles**:
  - *Modo Delta*: Selector de referencia del Delta Best (Personal / Sesión / Global).
  - *Frecuencia de Muestreo (Hz)*: Slider o input para limitar el refresco de datos (Clamp de Hz, ej. 15Hz o 30Hz), protegiendo equipos de gama baja.
  - *Filtro de Ruido*: Toggle para suavizar pequeñas fluctuaciones en señales analógicas del simulador.

### 🎥 Sección 3: Overlays y OBS Studio
- **Propósito**: Facilitar la integración de los overlays en software de transmisión local o remoto.
- **Controles**:
  - *URL del Perfil Activo*: Campo de texto con la dirección local `/overlay?profile=...` lista para copiar.
  - *Botón de Copiado Rápido*: Copia la URL al portapapeles con un clic.
  - *Instrucciones OBS Local*: Enlace interactivo que abre la guía `docs/obs-local-setup.md`.
  - *Configuración LAN (Doble PC)*:
    - Campo de texto que muestra la URL con la IP de red local (ej. `http://192.168.1.15:39261/...`).
    - *Abrir puerto a la Red Local*: Toggle avanzado para activar/desactivar la escucha en `0.0.0.0` (explicando los requerimientos del Firewall de Windows).

### ⌨️ Sección 4: Atajos de Teclado (Hotkeys)
- **Propósito**: Personalización de los comandos globales.
- **Controles**:
  - *Tabla de Atajos*:
    - Mapeo de `toggleOverlay` (Alternar overlay).
    - Mapeo de `nextProfile` (Siguiente perfil).
    - Mapeo de `prevProfile` (Perfil anterior).
  - *Botón de Guardado Explicito*: Guarda las combinaciones registradas en el backend nativo.
  - *Restaurar Predeterminados*: Botón para restablecer los atajos de fábrica.
  - *Ayuda y Leyenda*: Texto aclaratorio de sintaxis válida (ej. `ctrl`, `alt`, `shift`, `win`, `space`, flechas) y advertencia crítica sobre los privilegios de Administrador (UAC) para su correcto funcionamiento en carrera.

### 🛠️ Sección 5: Diagnóstico y Soporte
- **Propósito**: Facilitar la resolución de fallos y el reporte de bugs.
- **Controles**:
  - *Copiar Paquete de Diagnóstico*: Botón para empaquetar y copiar de forma segura al portapapeles el JSON sanitizado de sistema y perfiles.
  - *Ver Incidencias Conocidas*: Enlace a `docs/tester-known-issues.md`.
  - *Abrir Carpeta de Logs*: Botón para abrir la carpeta del sistema donde se guardan los archivos de registro.

### 🔄 Sección 6: Actualizaciones
- **Propósito**: Mantener la suite al día.
- **Controles**:
  - *Canal de Actualización*: Selector de canal (Solo releases estables / Incluir pre-releases).
  - *Buscar Actualizaciones*: Botón para forzar una consulta contra GitHub.
  - *Versiones Disponibles*: Lista detallada con las notas de cambios colapsables de cada release e instaladores de descarga directa.

### ⚙️ Sección 7: Avanzado
- **Propósito**: Opciones técnicas para usuarios expertos.
- **Controles**:
  - *Muestreo de CPU*: Toggle para habilitar/deshabilitar el sampler del procesador en el panel del Hub.
  - *Puerto del Servidor*: Campo de texto para redefinir el puerto de escucha del servidor HTTP (por defecto `39261`).

---

## 2. Pautas de Diseño de Experiencia de Usuario (UX)

Para garantizar un diseño de alta gama y gran legibilidad en la pantalla de Ajustes, se deben seguir las siguientes directrices:

1.  **Textos de Ayuda Contextuales (Inline Tooltips)**:
    - Cada control que afecte a la red, hotkeys o rendimiento debe ir acompañado de una pequeña descripción en tipografía pequeña y color atenuado (`text-vantare-textMuted`).
    - *Ejemplo en Modo Delta*: *"Determina qué vuelta de referencia se usará para calcular la diferencia de tiempos en el widget Delta. 'Personal' compara contra tu propio récord de la sesión."*
2.  **Ocultación de Opciones de Red Complejas**:
    - La IP LAN para Doble PC y el toggle de escucha en `0.0.0.0` no deben abrumar al usuario común. Deben presentarse bajo un acordeón colapsado por defecto titulado: *"¿Usas una configuración de Doble PC para Streaming? Configurar red local (LAN)"*.
3.  **Feedback Visual de Guardado Explicito**:
    - Los controles que no requieren guardado (toggles directos de canal, delta o rendimiento que llaman a la API inmediatamente) deben mostrar un micro-indicador de "Guardado..." verde que desaparezca a los 2 segundos para dar tranquilidad al usuario.
    - Los atajos de teclado, al poder estar a medio escribir, requieren mantener su botón de "Guardar atajos" con estados visuales claros (Habilitado / Guardando... / ¡Guardado!).
4.  **Advertencia de Privilegios UAC**:
    - Si el backend detecta que Vantare Suite no se está ejecutando con permisos de administrador, la sección de Hotkeys debe mostrar un banner amarillo de advertencia:
      - *⚠️ "Nota: Vantare no se está ejecutando como Administrador. Si tu simulador (LMU) se ejecuta con privilegios elevados, los atajos de teclado no responderán en carrera."*

---

## 3. Miniplan de Reordenación UX de Ajustes

Para transformar la pantalla de Ajustes actual de un listado vertical largo a una arquitectura modular de alta fidelidad, se propone ejecutar la siguiente hoja de ruta en la siguiente minifase:

1.  **Crear Componente de Navegación de Ajustes (`SettingsNavigation.tsx`)**:
    - Implementar una barra lateral izquierda de navegación densa con iconos de tipo micro-vector (General, Telemetría, Overlays, Hotkeys, Soporte, Actualizaciones, Avanzado).
    - Conectar la selección de tabs a un estado de React local para conmutar los paneles visibles.
2.  **Agrupar los Paneles Existentes**:
    - Mover el componente `ObsSetup` al panel de "Overlays".
    - Mover la funcionalidad de "Copiar Diagnóstico" al panel de "Soporte".
    - Mover los radio buttons de canales y la lista de releases al panel de "Actualizaciones".
3.  **Robustecer Inputs de Hotkeys**:
    - Integrar la advertencia UAC en base a una llamada a una nueva API de Go (`vapp.IsRunningAsAdmin()`).
4.  **Verificación**:
    - Ejecutar los tests focalizados de `SettingsPage.test.tsx` adaptados a la nueva estructura de pestañas y validar la persistencia de cada sección.
