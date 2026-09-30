# ISA-1331 — Completar la experiencia Strategy v5

Decisión de Isaac: 23-09-2026. [Issue](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1331). Base exacta `4f3d029f23efa056ef3fdd59ca46aad06148dcb3`; rama `vantareapp/isa-1331-strategy-v5-complete`, worktree `C:/tmp/vantare-isa1331`. GitHub es autoridad por las instrucciones del usuario. Este plan amplía el porte parcial de #1314/#1322 y no acepta sus pantallas posteriores por herencia.

## Resultado

Una misma mesa de trabajo desde abrir una sesión hasta guardar y reabrir el plan. El inicio usa el ancho de la aplicación y muestra estrategias guardadas en una columna derecha. Preparación muestra referencias reales de las revisiones elegidas. Las pantallas de edición conservan los grises, la escala, el rail y los inspectores v5. El circuito sólo se dibuja con geometría que corresponda a su identidad.

## Orden de ejecución

Root dirige el plan, revisa los cambios y mantiene la documentación. GPT-6 Sol medium ejecuta cortes secuenciales; sin Astra, Devin, OpenCode ni subdelegación. Un escritor por worktree. Cada corte comunica sus archivos antes de editar; si excede cinco rutas de lógica/tests, se subdivide. CSS, traducciones y documentación de soporte se agrupan con el comportamiento que describen.

1. **Inicio y guardadas.** Reutilizar `useRecordedLibrary`, repositorio y callbacks actuales. Lista derecha visible con borradores y planes diferenciados, abrir e historial; estados vacío, carga, error y recuperación. Mantener búsqueda/biblioteca completa. Retirar el ancho máximo centrado que deja gran parte de la ventana vacía; adaptar la lista por debajo en tamaños estrechos. Evitar pérdida del borrador o salida durante operaciones pendientes.
2. **Referencias de preparación.** Usar la proyección pública existente de Analysis para las revisiones exactas. Mostrar ritmo, Fuel y VE aplicable con unidades y procedencia; invalidar/cancelar al cambiar selección o revisión, sin mezclar respuestas tardías ni correcciones sin adoptar. Distinguir una entrada de carrera pendiente de una métrica no disponible. No crear promedios en React ni rellenar capacidades o pilotos con supuestos invisibles.
3. **Circuito.** Resolver el recurso existente por identidad/trazado verificados. Retirar el óvalo decorativo que parece un trazado. Si el proveedor público ya ofrece geometría histórica, reutilizarla para generar el SVG; si no, documentar el contrato faltante y mostrar ausencia explícita. No leer DuckDB directamente desde la UI ni abrir automáticamente centenares de archivos para producir miniaturas. No sustituir por un circuito similar.
4. **Continuidad de mesa.** Aplicar una cabecera compacta y distribución v5 coherente a Carrera, Datos y Revisiones; luego Plan y sus inspectores Stint/Parada; finalmente biblioteca e historial. Mantener navegación directa, teclado, borradores, correcciones, adopción, obsolescencia, cancelación, guardado y aceptación. Retirar texto «asistente», títulos gigantes y resúmenes duplicados. Una carrera incompleta debe explicar qué falta y permitir corregirlo en el mismo contexto.
5. **Verificación completa.** Tests de regresión antes/durante cada comportamiento, focales por corte; al final suite frontend, typecheck, lint, build localdev e i18n. Go test sólo si cambia Go/contrato compartido. Computer Use con DuckDB real para inicio → preparación → datos → cálculo/causa de bloqueo → plan → stint/parada → guardar/reabrir. Manual también. Capturas por estado a ventana normal y maximizada; revisión visual independiente por pantalla, sin nota global que esconda pantallas pendientes.

## Criterios de cierre

- La lista derecha procede del repositorio y abre la estrategia correcta; no duplica almacenamiento.
- Una revisión con datos utilizables muestra referencias canónicas; estados vacíos tienen causa. La ausencia no se transforma en cero, un nombre de archivo no acredita identidad y una respuesta tardía no pertenece a la nueva selección.
- Circuito está identificado o explícitamente no disponible. Generación histórica depende de señales y contrato reales.
- Cada vista del recorrido tiene evidencia propia de composición v5 y controles completos. Los tamaños se adaptan; no se llenan huecos agrandando tarjetas vacías.
- Reglas/estimaciones/manual se diferencian de telemetría observada. Calcular y aceptar no se confunden con guardar configuración.
- Originales intactos, backend/solver conservados y sin nuevas dependencias. Live, Monte Carlo, calibración empírica y disponibilidad horaria mantienen sus gates del SDD.
- No merge, promoción ni release. La aceptación humana sigue pendiente hasta que Isaac vea el recorrido completo.

## Evidencia y estado

El estado vivo se registra únicamente en el handoff de Strategy y la issue. Este documento es el plan de ejecución, no un segundo registro de estado. Las puntuaciones de #1322 sólo cubrían la preparación y no sirven como aceptación de este alcance.
