> **Plan status: historical**
> Snapshot conservado como evidencia. No autoriza ejecución. Las referencias a
> `docs/current-plan.md`, `develop`, `refactor`, ramas, bases o siguientes
> acciones son históricas y quedan sustituidas por Linear y Git.

# Plan de Optimización de Rendimiento en Overlays (PERF1-Plan)

Este miniplan describe la estrategia y los cambios arquitectónicos recomendados para solucionar las ineficiencias de rendimiento (P2/P3) detectadas en la auditoría de overlays de **Vantare Suite**, con especial enfoque en reducir el coste de CPU de React a 0 durante la inyección de telemetría rápida a 30Hz.

---

## 1. Objetivo y Alcance

El objetivo principal es eliminar los re-renderizados de React a 30Hz del componente raíz (`ObsOverlayApp` y `CompositeApp`) y evitar la normalización repetitiva de variantes en cada fotograma. El alcance es puramente conceptual y planificador para la siguiente minifase de rendimiento, sin modificar código de producto en esta sesión.

---

## 2. Soluciones Técnicas Propuestas (Plan-Only)

### A. Eliminar Re-renders de React a 30Hz en el Padre (PERF-H1)

**El Problema:**
El padre (`ObsOverlayApp.tsx`) se suscribe a todos los eventos SSE del canal de telemetría y actualiza un estado de React (`setTelemetryKey`) a la frecuencia de ticks del simulador (hasta 30Hz). Esto re-evalúa todos los widgets hijos en cada frame, solo para recalcular si un widget debe estar visible o invisible (por ejemplo, si el jugador entró a boxes).

**Diseño de la Solución:**
1.  **Suspensión de la suscripción directa de React**: Eliminar el estado `telemetryKey` y la llamada a `setTelemetryKey` del listener de SSE en el componente padre.
2.  **Suscripción a cambios discretos de visibilidad**:
    - Crear un listener de telemetría ligero en el padre que evalúe únicamente el estado de visibilidad relevante: `sessionType`, `sessionName`, e `inPits` (que provienen de `getCurrentTelemetryState()`).
    - Comparar este estado de visibilidad con el del tick anterior.
    - **Solo** si el estado de visibilidad ha cambiado (lo cual ocurre de forma discreta una vez cada muchos segundos o minutos al entrar a boxes o cambiar de sesión), llamar a un estado de React `setVisibilityState(...)` para provocar el re-renderizado y ajustar qué widgets están montados en el DOM.
3.  **Ejemplo conceptual de la optimización en el listener de `ObsOverlayApp.tsx`**:
    ```typescript
    // En lugar de setTelemetryKey((k) => k + 1) en cada tick:
    let lastVisibilityHash = "";

    es.addEventListener("telemetry", (event: MessageEvent) => {
      try {
        const payload = parseTelemetryPayload(event.data);
        applyTelemetryUpdate(payload);

        // Calcular hash de visibilidad rápido
        const player = payload.snapshot?.player;
        const session = payload.snapshot?.session;
        const inPits = player?.throttle === undefined ? false : ...; // obtener inPits de forma segura
        const visibilityHash = `${session?.sessionType}|${session?.sessionName}|${inPits}`;

        if (visibilityHash !== lastVisibilityHash) {
          lastVisibilityHash = visibilityHash;
          // Provocamos re-render de React SOLO cuando cambia un estado que altera la visibilidad
          triggerVisibilityUpdate();
        }
      } catch (err) {
        console.error("SSE parse error", err);
      }
    });
    ```

---

### B. Memoización de la Normalización de Variantes (PERF-H2)

**El Problema:**
En cada render, se llama a `enrichWidgetPropsWithVariant(profile, w)` para cada widget. Esta función invoca validaciones y comparaciones profundas en caliente, ejecutándose 30 veces por segundo por cada widget en pantalla, saturando la memoria y el Garbage Collector.

**Diseño de la Solución:**
1.  **Pre-normalización al cargar/guardar el perfil**:
    - En lugar de normalizar en caliente en el renderizado de cada widget, normalizar y enriquecer el perfil completo una única vez cuando se carga desde la API (`fetch('/api/profile')`) o cuando se guardan los cambios de diseño.
    - Almacenar este perfil normalizado enriquecido en un estado dedicado `const [enrichedProfile, setEnrichedProfile] = useState<ProfileConfig | null>(null)`.
2.  **Uso de `useMemo` local**:
    - En el renderizado de la lista de widgets de `ObsOverlayApp`, memoizar la obtención de las propiedades enriquecidas asociándolas al `id` del widget y a la referencia del perfil:
      ```typescript
      const enrichedProps = useMemo(() => {
        if (!profile) return {};
        return widgets.reduce((acc, w) => {
          acc[w.id] = enrichWidgetPropsWithVariant(profile, w);
          return acc;
        }, {} as Record<string, any>);
      }, [profile, widgets]);
      ```
      De esta forma, `enrichWidgetPropsWithVariant` se ejecutará **únicamente cuando el perfil cambie físicamente** (por ejemplo, al guardar o cambiar de perfil), y nunca durante los ticks de telemetría rápidos.

---

### C. Bucle de Pintado Unificado (Paint Loop) (PERF-H3)

**Diseño de la Solución (Opcional de Endurecimiento):**
Para evitar tener múltiples `requestAnimationFrame` concurrentes e independientes compitiendo por el hilo principal del navegador, se propone diseñar un **Unificador de Paint Loops** a nivel del layout padre:
1. El componente padre (`ObsOverlayApp` o `CompositeApp`) registra un único bucle global de rAF.
2. Cada widget expone un método de pintado directo en su referencia (`widgetRef.current.paint(telemetry)`).
3. En cada tick del rAF global, el padre itera sobre los widgets montados y llama a su método `paint` pasando la última telemetría leída de la referencia global.
4. Esto sincroniza perfectamente el dibujado de todos los widgets del lienzo bajo un único ciclo de refresco del navegador, eliminando la latencia entre widgets y reduciendo el uso de CPU.

---

## 3. Plan de Verificación

- **Pruebas de CPU en Staging**: Cargar el overlay en una pestaña del navegador Chrome con la consola de desarrollo abierta. Iniciar una simulación inyectando telemetría sintética a 30Hz y realizar un perfil de rendimiento (*Performance Profiling*) de 10 segundos. Verificar que el uso de CPU de *Scripting* cae en más del 80% al aplicar estas optimizaciones.
- **Verificación de Regresiones**: Comprobar que todos los widgets siguen visualizándose correctamente y que su estado de visibilidad reacciona de forma reactiva al entrar y salir de boxes en el simulador.
