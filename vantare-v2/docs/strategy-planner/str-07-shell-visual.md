# STR-07 — Shell visual y navegación del workspace

## Resultado

ISA-142 implementa la primera experiencia visual productiva de Strategy Planner
sobre el shell real de Vantare. La referencia inspeccionada fue
`C:\Users\isaac\Desktop\strategy-base.html`; no se copió su topbar ni su dock
ficticios. La ruta real reutiliza `V52Shell`, `Topbar`, `LauncherDock` y la
política de acceso actual.

El flujo visible cubre:

1. galería `Mis planes`;
2. entrada manual o importación todavía no conectada;
3. revisión explícita de los datos;
4. workspace de tres columnas;
5. comparación de variantes;
6. guardado limitado y descrito honestamente como estado de la sesión.

## Contrato visual

En layout ancho el workspace conserva la composición `3 / 6 / 3` del HTML:

- estrategias y fuel-save a la izquierda;
- stints y pit stops en el centro;
- inventario y resumen de entrada manual a la derecha;
- `20px` entre columnas;
- paneles oscuros, borde neutro y rojo reservado para selección, acción y
  jerarquía;
- tarjetas, ritmos tipográficos y densidad derivados de la referencia.

La medición Playwright a `1920x1080` fue `441 / 881 / 441px`; el inicio de los
paneles queda en `y=210`, frente a `y=215` en la captura de referencia. Esa
diferencia de cinco píxeles procede del shell real y no reinterpreta las
proporciones del producto.

## Responsive

- **Wide, 1920x1080:** las tres columnas permanecen en una fila con relación
  lateral/centro `1:2:1`.
- **Medium, 1280x900:** estrategias y stints conservan la fila primaria; el
  inventario ocupa una fila completa debajo.
- **Compact, 800x900:** un grupo de botones muestra una sola columna a la vez.
  Flechas, `Home` y `End` cambian el panel activo.

Las tres composiciones verifican `documentElement.scrollWidth === innerWidth`.
El nav superior conserva su scroll interno en ventanas estrechas sin producir
overflow global.

## Honestidad de datos y ownership

- El harness muestra `Datos de ejemplo · sin telemetría live`.
- El workspace conserva `DEMO · SIN LIVE` y describe sus cifras como valores
  visuales de ejemplo.
- La opción de telemetría explica que todavía no lee archivos.
- Guardar no escribe en el repositorio de STR-03 ni crea otra persistencia.
- STR-07 no importa Telemetry Core, Analysis ni fuentes LMU.
- El store y el servicio de STR-04 permanecen sin wiring productivo; STR-15A y
  STR-16 poseen las conexiones correspondientes.

## Accesibilidad y teclado

- La página tiene un único título asociado al `section` principal.
- Los modos de entrada publican `aria-pressed`.
- Los paneles compactos usan un grupo de botones con `aria-pressed` y navegación
  con flechas, Home y End. Los paneles se etiquetan directamente, sin referencias
  a controles que quedan ocultos en wide/medium.
- La comparación recibe el foco inicial, atrapa Tab y Shift+Tab, responde a
  `Escape`, devuelve el foco al botón que la abrió y vuelve inerte el workspace
  de fondo mientras permanece abierta.
- Estados de carga, error, guardado y ausencia usan `status`/`alert` cuando
  corresponde.
- Todos los controles tienen nombre accesible y foco visible.

## Harness y evidencia

`pnpm --dir frontend visual:strategy-planner`:

1. inicia Vite en un puerto estricto;
2. espera como máximo 20 segundos y conserva la cola diagnóstica;
3. abre Chrome mediante Playwright;
4. recorre galería, entrada, revisión y workspace;
5. valida proporciones, responsive, teclado, comparación y guardado;
6. falla ante overflow, errores de consola o errores de página;
7. cierra el navegador y termina el árbol de procesos de Vite incluso al
   fallar.

Capturas versionadas en `docs/strategy-planner/evidence/str-07/`:

- `reference-wide.png` y `reference-workspace-wide.png`;
- `actual-gallery-wide.png`;
- `actual-entry-wide.png`;
- `actual-review-wide.png`;
- `actual-workspace-wide.png`;
- `actual-workspace-medium.png`;
- `actual-workspace-medium-inventory.png`;
- `actual-workspace-compact.png`;
- `actual-workspace-compact-inventory.png`;
- `actual-comparison-compact.png`.

## Verificación final

- `pnpm exec vitest run --maxWorkers=1`: `302/302` archivos y `2059/2059`
  tests PASS.
- La ejecución paralela evidenció dos flakes ajenos al diff, uno por intento:
  primer movimiento de canvas y montaje de la sección activa del inspector.
  Ambos pasan `5/5` aislados; no se modificó ningún archivo de Overlay Studio.
- `pnpm build`: PASS. Conserva el warning heredado del chunk principal mayor de
  500 kB.
- ESLint focal sobre todos los archivos tocados: PASS. Conserva el warning
  heredado por `.eslintignore`.
- `pnpm visual:strategy-planner`: PASS con consola, errores de página y overflow
  global en cero; también valida el contrato completo del modal.
- `git diff --check`: PASS.

## Exclusiones deliberadas

- No hay solver, Monte Carlo, algoritmo avanzado ni estrategia óptima.
- No hay lectura live, importación real ni parser histórico.
- No hay persistencia nueva ni wiring del repositorio.
- No hay drag and drop, edición de stint ni asignación de neumáticos: pertenecen
  a STR-08.
- No hay tabla avanzada ni cálculo productivo de fuel-save: pertenecen a
  STR-09.
- No se copió el shell falso del HTML ni se añadió una dependencia UI.

## Rollback

La entrega es aditiva salvo por registrar la nueva sección en navegación,
access policy y `HubApp`, y por acotar correctamente el nav superior cuando
aparecen más pestañas. Revertir el commit elimina la ruta, componentes,
harness, capturas y documentación sin migrar datos ni modificar contratos Go.
