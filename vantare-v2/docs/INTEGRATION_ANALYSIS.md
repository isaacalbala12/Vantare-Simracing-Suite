# Análisis de Integración: Vantare Ingeniero Go y Vantare Overlays v2

Este documento analiza la viabilidad, estrategia y cambios necesarios para unificar los proyectos `Vantare-Ingeniero-Go` y `Vantare-Overlays-v2` en un solo producto, basándose en la revisión de su arquitectura y stack tecnológico (Go + Wails + React).

## 1. ¿Cómo podríamos juntarlos en una sola app manteniendo las features?

Ambos proyectos están construidos sobre la misma base (Wails v3, Go, React, Vite) y comparten un objetivo común: leer la telemetría (shared memory) de Le Mans Ultimate (LMU) para proporcionar retroalimentación al piloto (visual o auditiva).

Para fusionarlos manteniendo todas las características, la estrategia ideal es **absorber las capacidades de Ingeniero dentro del ecosistema de Overlays v2 (que actualmente sirve como "Hub")**:

*   **Motor de Telemetría Único:** El proyecto `vantare-v2` posee un pipeline de telemetría avanzado (`internal/telemetry/pipeline`, `normalizer`, deadbands, diffs). En lugar de que ambas aplicaciones hagan polling independiente al juego, el motor de telemetría de `vantare-v2` se convierte en la única fuente de verdad. El sistema de `spotter` de Ingeniero simplemente se suscribiría a las actualizaciones de este pipeline de telemetría centralizado.
*   **Unificación del Hub (Frontend):** `vantare-v2` ya posee un Hub/Dashboard en React para gestionar perfiles y visualizar widgets. La interfaz gráfica de configuración de Ingeniero se puede integrar como una nueva pestaña o sección dentro de este mismo Hub (ej. "Spotter & Audio Settings").
*   **Módulos de Audio y Lógica:** Trasladar los paquetes `internal/spotter`, `internal/audio`, `internal/tts` y `internal/replay` de Ingeniero directamente al directorio `internal/` de `vantare-v2`.

## 2. ¿Es viable hacer un producto conjunto o mejor un launcher?

Es **altamente viable y muy superior crear un producto conjunto (monolito)** en lugar de un launcher.

Razones para evitar un launcher:
*   **Sobrecarga de Recursos:** Wails utiliza un motor web (WebView2) que consume una cantidad significativa de memoria RAM y CPU. Un launcher que abra dos ejecutables `.exe` independientes lanzaría dos procesos WebView2 y dos procesos de Go completos.
*   **Duplicación de I/O:** Ambos programas tendrían su propio ciclo de lectura (polling) sobre el mapa de memoria (mmap) de Le Mans Ultimate, duplicando el esfuerzo de CPU y complicando la sincronización de datos.

Ventajas del producto conjunto:
*   **Eficiencia:** Una sola app leyendo el disco/memoria, un solo binario ejecutándose, y una sola ventana principal (Hub) de Wails.
*   **UX Centralizada:** El usuario abre "Vantare Hub" y desde un solo lugar configura sus overlays visuales y su spotter de audio, e inicia ambos sistemas simultáneamente con un solo clic.
*   **El runtime "invisible":** El Hub puede tener el proceso del spotter ejecutándose silenciosamente en el background de Go (enviando audio), mientras lanza la ventana overlay transparente para la visualización.

## 3. ¿Qué tanto habría que cambiar?

Dado que comparten el stack y ambos consumen los datos del mismo simulador, el esfuerzo de refactorización es **de bajo a moderado**, centrado en la unificación más que en reescribir lógica. Los cambios clave serían:

1.  **Refactorización de Modelos de Datos (Bajo/Medio):** Modificar el `internal/spotter` de Ingeniero para que deje de depender de su propio modelo de telemetría (`model.go`) y pase a consumir los tipos unificados (`snapshot.go` o equivalente) que emite el pipeline de `vantare-v2`.
2.  **Migración de Componentes UI (Bajo):** Mover los componentes de React de Ingeniero a la carpeta `frontend/src/` de `vantare-v2`. Esto requerirá adaptar algo de Tailwind o el diseño para que encaje con la paleta de estilo "glass-panel" del Hub actual.
3.  **Unificación de Perfiles (Medio):** Extender el esquema JSON de configuración de perfiles (`pkg/config/` en `vantare-v2`) para que incluya no solo la posición de los widgets visuales, sino también la configuración del spotter (volumen, nivel de verbosidad, voz del TTS, etc.).
4.  **Gestión de Dependencias (Bajo):** Mezclar el `go.mod`. Si Ingeniero usa librerías extra (por ejemplo, para interactuar con la API de voz de Windows u otros paquetes), hay que importarlos en `vantare-v2`.
5.  **Ciclo de Vida de la App (Bajo):** Ajustar la función `main.go` y la inicialización de Wails en `vantare-v2` para arrancar el servicio de audio/TTS al mismo tiempo que se arrancan los servicios de telemetría gráfica.

**Conclusión:** La unificación es el camino lógico y técnicamente natural. Convertir "Vantare Hub" en la plataforma central tanto para Overlays como para el Spotter optimizará enormemente el consumo de recursos de la PC del usuario (algo crítico en simracing) y simplificará el mantenimiento futuro del código.
