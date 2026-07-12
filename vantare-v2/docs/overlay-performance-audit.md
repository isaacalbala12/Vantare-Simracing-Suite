# Auditoría de Rendimiento de Overlays en Runtime (PERF1)

Este documento contiene un análisis profundo del rendimiento en tiempo real (runtime) de los overlays de **Vantare Suite** (tanto para el overlay de escritorio de Wails como para la fuente de navegador de OBS Studio). Se evalúan los ciclos de pintado, la concurrencia de bucles de fotogramas, la sobrecarga de re-renderizado de React, la latencia de transporte de red SSE y se define un plan de optimización para la beta.

---

## 1. Evaluación de Componentes y Mecanismos de Rendimiento

### A. Gestión de Bucles de Pintado (Frame Loops)
- **¿Cuántos loops pueden existir a la vez?**: Cada widget configurable (`RelativeWidget`, `StandingsWidget`, `DeltaWidget`) inicializa su propio bucle de pintado asíncrono utilizando la utilidad `startFrameBudgetLoop`. Si el usuario tiene habilitados 6 widgets simultáneamente en su perfil activo, existirán **6 bucles concurrentes de `requestAnimationFrame` (rAF)** ejecutándose de forma paralela en el navegador.
- **Evaluación del Cleanup**: La utilidad `startFrameBudgetLoop` devuelve una función de limpieza de alta calidad que cancela el rAF activo mediante `cancelAnimationFrame(raf)`. Cada widget ejecuta este cleanup de forma segura en el retorno de su `useEffect`:
  ```typescript
  useEffect(() => {
    return startFrameBudgetLoop(updateHz, () => { ... });
  }, [...]);
  ```
  Esto garantiza que cuando un widget se oculta, se deshabilita o se cambia de pantalla, su bucle de CPU asociado se detiene inmediatamente, previniendo fugas de CPU (CPU leaks).
- **Control de Pestaña Oculta (Tab visibility)**: La utilidad incluye un guardado inteligente basado en `document.hidden`. Si la ventana del overlay o la escena de OBS no están visibles, el rAF se salta el ciclo de dibujado pesado (`paint`), lo que ahorra el 100% de la carga de procesado visual en segundo plano.

---

### B. El Cuello de Botella: Re-renders de React por Ticks de Telemetría
- **Análisis del flujo actual**: En `ObsOverlayApp.tsx` y `CompositeApp.tsx`, el EventSource escucha las tramas de telemetría entrantes y ejecuta lo siguiente:
  ```typescript
  applyTelemetryUpdate(parseTelemetryPayload(event.data));
  setTelemetryKey((k) => k + 1);
  ```
  El hook de estado `setTelemetryKey` provoca un **re-renderizado completo de React desde la raíz del overlay en cada tick de telemetría (que puede ser de 15Hz a 30Hz)**.
- **El Impacto real**: Los widgets están diseñados de manera brillante para evitar React a nivel de pintado interno (usan `useRef` y escriben directamente en el DOM con `setHTMLIfChanged` y `setTextIfChanged`). Sin embargo, al re-renderizarse el componente padre (`ObsOverlayApp`), **todos los componentes hijos de los widgets se evalúan como funciones de JavaScript en cada tick de telemetría**. Esto genera una sobrecarga de CPU de reconciliación de React innecesaria, especialmente si hay lógica compleja fuera de los efectos.
- **Causa de la Suscripción**: El padre se suscribe a la telemetría en cada tick únicamente para recalcular la visibilidad de los widgets (por ejemplo, saber si el coche del jugador está en pista o boxes para ocultar/mostrar un widget mediante `isWidgetVisible`). El estado que determina la visibilidad (tipo de sesión, en boxes, etc.) cambia de forma extremadamente lenta (segundos o minutos), por lo que re-evaluarlo y re-renderizar a 30Hz es un desperdicio masivo de recursos.

---

### C. Uso de Refs y Direct DOM Writes (Bypassing React)
- **Evaluación**: Los widgets de telemetría continua utilizan una estrategia óptima:
  - No mantienen estado de React para los datos de telemetría veloces (velocidad, RPM, distancias).
  - Leen de la referencia mutable global `getTelemetryRef()` dentro del loop de dibujado del rAF.
  - Calculan un hash/fingerprint de los datos de la fila y solo actualizan el DOM con `setHTMLIfChanged` o `setTextIfChanged` si el fingerprint ha variado.
- **Resultado**: El DOM virtual de React permanece 100% estático durante el flujo de telemetría rápida, y las escrituras en el DOM real son sumamente eficientes. Esta es la razón por la cual la aplicación se siente ágil a pesar de la falta de optimización del renderizado del padre.

---

### D. Frecuencia y Payload de SSE (Servidor de Go)
- **Evaluación**: El backend de Go en `sse.go` y `engineer_sse.go` transmite a través de Server-Sent Events (SSE) la telemetría convertida a JSON mediante `app.WireFromUpdate(upd)`.
- **Diferencia Wails vs. OBS**:
  - En **Wails (Desktop Overlay)**: El flujo de datos utiliza el bridge nativo de comunicación entre C++ y JS, que tiene un coste de transporte casi nulo y no satura la pila de red del sistema.
  - En **OBS (Fuente de Navegador)**: OBS carga la SPA de React sobre Chromium y se conecta por red local (incluso en bucle local `127.0.0.1`) al servidor HTTP de Go. Esto consume sockets de red TCP, requiere parseado continuo de JSON en JavaScript y deserialización continua a 30Hz, lo que aumenta ligeramente la latencia y el uso de CPU comparado con el overlay de escritorio.

---

### E. Ciclo de Vida del Widget de Ingeniero (`EngineerNotificationsWidget`)
- **Evaluación**: Este widget es asíncrono y discreto (las alertas del spotter llegan una vez cada varios segundos o minutos). Utiliza un estado de React normal (`[activeMsg, setActiveMsg]`) que se actualiza al recibir un evento SSE de `/engineer/stream` o un evento de Wails.
- **Rendimiento**: Excelente. Dado que la frecuencia de las alertas es extremadamente baja, el coste de re-renderizado en React es nulo. Además, el ciclo de vida del temporizador de expiración (`setTimeout`) está correctamente saneado en los cleanups de los efectos, evitando memory leaks en carrera.

---

### F. Coste de Normalización de Variantes en Caliente
- **Análisis**: En el renderizador de overlays (`ObsOverlayApp.tsx` y `CompositeApp.tsx`), para cada widget instanciado se ejecuta:
  ```typescript
  props={{ ...enrichWidgetPropsWithVariant(profile, w), ... }}
  ```
  La función `enrichWidgetPropsWithVariant` realiza llamadas a `withDefaultWidgetVariants` y `normalizeRelativeVariant`/`normalizeStandingsVariant`.
- **El coste**: Como el padre se re-renderiza a 30Hz, estas funciones de normalización de variantes (que realizan deep equals de objetos de configuración, iteraciones de arrays y mapeos de columnas) se ejecutan **en cada fotograma para cada widget**. Esto es una ineficiencia grave que satura el recolector de basura (Garbage Collector) de JavaScript por la asignación constante de objetos temporales en memoria.

---

## 2. Hallazgos y Severidades de la Auditoría

| ID | Hallazgo | Severidad | Descripción | Mitigación Recomendada |
| :--- | :--- | :---: | :--- | :--- |
| **PERF-H1** | Re-renderizado de React a 30Hz desde la raíz | **P2** (Importante) | El padre (`ObsOverlayApp`) re-renderiza toda la estructura en cada tick de telemetría solo para comprobar la visibilidad. | Desacoplar la suscripción rápida de telemetría de React. Usar un hook que escuche solo cambios de visibilidad discretos. |
| **PERF-H2** | Normalización de variantes por render en caliente | **P2** (Importante) | `enrichWidgetPropsWithVariant` normaliza y crea objetos de variantes en cada fotograma. | Pre-calcular y memoizar las variantes enriquecidas cuando el perfil se cargue o guarde, no en el render. |
| **PERF-H3** | Concurrencia de múltiples rAF concurrentes | **P3** (Menor) | Cada widget ejecuta su propio bucle rAF, lo que puede causar desalineación de fotogramas. | Centralizar los bucles de dibujado en un único bucle rAF global compartido en el layout (Unificado Paint Loop). |

Se formula un miniplan técnico de optimización a continuación para corregir estos problemas en la fase de pulido de rendimiento.
# V3 quality gate (2026-07-11)

El coordinador comparte una suscripción por cada frecuencia activa y publica estados stale/disconnected/error inmediatamente. El CSS Crystal queda limitado a blur de 16px en OBS/Desktop y contiene una regla de reduced motion. `overlay-performance.test.tsx` y el harness visual deben aportar cualquier medición posterior; no se convierten tiempos de máquina en thresholds deterministas de CI.

La regresión determinista cubre 20 instancias a 15 Hz y una a 30 Hz sobre 120 publicaciones: cada listener recibe únicamente sus ticks de bucket. Runtime y Studio consumen `useRateLimitedTelemetry` con `widget.behavior.updateHz`, y `StudioWidgetFrame` memoiza el host visual; no hay un scheduler por widget.
