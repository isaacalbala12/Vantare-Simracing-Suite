# Visual Regression Harness para Previews

Este documento presenta el plan técnico detallado para implementar un arnés de pruebas de regresión visual basado en un navegador real utilizando **Playwright**.

## 1. Por qué JSDOM es insuficiente

Actualmente, la suite de pruebas del frontend utiliza **Vitest** con **happy-dom** (un entorno similar a JSDOM). Aunque happy-dom es rápido y excelente para verificar la lógica de estado, los eventos, la persistencia y la estructura del DOM, tiene limitaciones críticas que impiden detectar problemas visuales reales:

1. **Sin motor de renderizado real**: JSDOM/happy-dom no calcula la geometría real de los elementos (layouts, flujos, envolturas). Las llamadas a `getBoundingClientRect()`, `scrollWidth`, `scrollHeight`, `clientWidth` o `clientHeight` devuelven valores predeterminados de cero o aproximaciones estáticas.
2. **Clipping y Desbordamiento**: No puede detectar si un texto largo o una columna opcional se corta (clipping), se superpone con otro elemento o si se desplaza fuera del área visible debido a reglas de CSS como `overflow: hidden` o `text-overflow: ellipsis`.
3. **Centrado y Posicionamiento**: No puede verificar si un widget está físicamente centrado en un contenedor de cuadrícula (checkerboard) o si tiene márgenes/espacios vacíos anómalos a la derecha debido a un mal uso de `w-full` o `inline-flex`.
4. **Redimensionamiento Proporcional**: En `LayoutStudio`, la deformación de cajas, la correcta escala y el posicionamiento de los tiradores de redimensionamiento (resize handles) dependen de cálculos en vivo del DOM y del viewport del navegador. happy-dom no tiene un viewport real ni calcula transformaciones CSS en vivo.
5. **Cajas Invisibles**: Un elemento puede tener opacidad cero, estar oculto por otro elemento encima (z-index) o estar desplazado fuera de la pantalla, pero en JSDOM seguirá apareciendo en el documento como "visible" siempre que esté presente en el DOM.

---

## 2. Estrategia del Arnés de Regresión Visual

Para garantizar la estabilidad visual de los widgets sin introducir dependencias pesadas ni mutar la base de datos de perfiles, el arnés de regresión visual utilizará **Playwright** (ya declarado en `package.json` pero no configurado) operando sobre el servidor de desarrollo de Vite.

### Flujo de Ejecución Local e Integración
```
+-----------------------------------------------------------+
| 1. Levantar servidor de desarrollo Vite (puerto temporal) |
+-----------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------+
| 2. Playwright abre navegador headless contra Vite local   |
+-----------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------+
| 3. Inyectar perfiles mock / estados de telemetría en DOM  |
+-----------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------+
| 4. Capturar screenshots de componentes y comparar diffs   |
+-----------------------------------------------------------+
```

---

## 3. Configuración Técnica de Playwright

Para implementar este plan, se creará el archivo `frontend/playwright.config.ts` con la siguiente estructura óptima para Vite:

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Levanta automáticamente el servidor de desarrollo de Vite antes de los tests
  webServer: {
    command: "pnpm dev --port 5173",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
```

---

## 4. Casos Mínimos de Prueba y Verificación Visual

Los tests de regresión visual se estructurarán en `frontend/e2e/visual-regression.spec.ts`. Cubrirán los siguientes escenarios críticos:

### Escenario 1: WidgetStudio / Relative
*   **Centrado en Checkerboard**:
    *   *Test*: Cargar la preview aislada de `Relative` en modo compacto.
    *   *Verificación*: Obtener la bounding box del checkerboard y la del widget. Comprobar matemáticamente que el centro horizontal del widget coincide con el del checkerboard (margen de error < 2px).
*   **Sin espacio vacío a la derecha**:
    *   *Test*: Activar y desactivar columnas opcionales en el panel derecho.
    *   *Verificación*: El ancho de la caja visible (`logicalSize.width`) debe encogerse exactamente al ancho de las columnas reales y no extenderse al contenedor de la preview.
*   **Clipping de columnas (`bestLap` / `lastLap`)**:
    *   *Test*: Activar las columnas `bestLap` y `lastLap` en formato extendido.
    *   *Verificación*: Verificar mediante comparación de píxeles o inspección de bounding boxes que el texto de los tiempos no se superpone con los nombres de los pilotos y que los nombres de los pilotos se truncan correctamente si el ancho es insuficiente y la opción está activa.
*   **Compact vs Fill**:
    *   *Test*: Alternar entre el modo compacto y fill.
    *   *Verificación*: En modo compacto, el widget no debe desbordar verticalmente el viewport. En modo fill, la altura debe estirarse para cubrir las filas deseadas respetando el mínimo visual.

### Escenario 2: WidgetStudio / Standings
*   **Centrado y Dimensionado**:
    *   *Test*: Cargar `Standings` en la preview aislada.
    *   *Verificación*: Confirmar que el widget se renderiza alineado al centro del checkerboard.
*   **Columnas Opcionales sin Recorte**:
    *   *Test*: Activar secuencialmente columnas como `vehicleClass`, `currentLap` e `interval`.
    *   *Verificación*: Validar que el contenedor de la preview (`WidgetSandboxPreview`) se ensancha automáticamente y que ninguna columna queda renderizada con ancho cero o invisible.
*   **Escenarios Mock (Sesiones)**:
    *   *Test*: Hacer clic en el segmented control de escenario de sesión (`Práctica`, `Qualy`, `Carrera`).
    *   *Verificación*: Capturar la pantalla para asegurar que el contenido visual cambia (por ejemplo, en Práctica se muestran deltas o vueltas en lugar de posiciones de carrera).
*   **Independencia de Guardado**:
    *   *Test*: Cambiar de escenario de sesión en la preview.
    *   *Verificación*: Asegurar que el botón **Guardar** en la cabecera superior permanece deshabilitado (el cambio de mock es preview-only y no ensucia el perfil).

### Escenario 3: LayoutStudio (Lienzo)
*   **Ajuste de Frame desde Primer Render**:
    *   *Test*: Cargar un perfil heredado (legacy) con widgets deformados.
    *   *Verificación*: Comprobar que el contorno visual del frame rodea exactamente los bordes de `Relative` y `Standings` desde el primer milisegundo, sin aplicar mutaciones en disco ni dejar el widget desalineado del tirador de resize.
*   **Redimensionamiento Proporcional**:
    *   *Test*: Simular un drag del tirador inferior derecho (handle) de `Relative`.
    *   *Verificación*: Comprobar que la caja del widget escala de forma proporcional y que el handle permanece pegado al borde real del widget durante todo el movimiento.

### Escenario 4: Regresiones de Separación de Responsabilidades
*   **WidgetStudio Limpio**:
    *   *Test*: Cargar la pantalla de `WidgetStudio`.
    *   *Verificación*: Asegurar que NO existen en el DOM elementos con las clases de arrastre, tiradores de tamaño (`.react-resizable-handle`) ni controles para eliminar el widget.
*   **LayoutStudio Limpio**:
    *   *Test*: Cargar la pantalla de `LayoutStudio`.
    *   *Verificación*: Asegurar que NO existen en el DOM selectores de columnas, filtros de telemetría, controles de formato ni segmented controls de escenarios de sesión.

---

## 5. Implementación de Comparación de Píxeles (Visual Snapshots)

Playwright proporciona de forma nativa la funcionalidad de comparación de capturas de pantalla. Para evitar falsos positivos causados por fuentes del sistema o renderizado de subpíxeles ligeramente diferente entre sistemas operativos (Windows vs CI de GitHub Actions), se aplicarán los siguientes parámetros de tolerancia:

```typescript
import { test, expect } from "@playwright/test";

test("Relative widget compact mode alignment", async ({ page }) => {
  // Ir al editor de widgets con el perfil de pruebas
  await page.goto("/#/hub/overlays/studio/widget/relative");

  // Esperar a que la preview cargue y se estabilice
  const preview = page.locator("[data-testid='widget-sandbox-preview']");
  await expect(preview).toBeVisible();

  // Comparar con el snapshot de referencia
  await expect(preview).toHaveScreenshot("relative-compact-default.png", {
    maxDiffPixels: 20, // pequeña tolerancia de renderizado
    threshold: 0.2,    // sensibilidad de diferencia de color
    animations: "disabled", // detener animaciones de pulso
  });
});
```

---

## 6. Siguientes Pasos Recomendados

Una vez aprobado este plan:
1. Crear la carpeta `frontend/e2e` para alojar los archivos de prueba.
2. Crear `frontend/playwright.config.ts` en la raíz del frontend.
3. Escribir los primeros tests de regresión visual para `RelativeWidget` y `StandingsWidget`.
4. Añadir un script en `frontend/package.json`: `"test:visual": "playwright test"`.
5. Ejecutar localmente y confirmar la generación de las imágenes de referencia en `frontend/e2e/visual-regression.spec.ts-snapshots/`.
