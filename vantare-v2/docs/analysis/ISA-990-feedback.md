# ISA-990 - Instrumentos tras feedback del tester

Base: `origin/nightly@659b2c57`, rama `vantareapp/isa-990-instrumentos-tester`.
Subcorte de ISA-989. Sin cambios de fuente canonica, persistencia ni WidgetVisualHost.

## Cambios

- Marcha: formatter puro compartido `-1 -> R`, `0 -> N`, positivos enteros numericos y valores negativos desconocidos/fraccionarios/no disponibles -> guion. Los builders heredados conservan el signo; V2 ya lo conservaba. La convencion -1/0 existe en `packages/sim-core/src/normalizer.ts`; falta validarla en la build LMU real.
- THR/BRK/CLU: las etiquetas reciben el mismo color configurado que sus barras.
- Trail: las tres variantes conservan las muestras cero del embrague; Dense dibuja tambien ese canal. El test de rerender confirma que un historial nuevo cambia el path. No reproduce un fallo temporal de la fuente.
- Dense: el grafico tenia solo 2px de ancho a 360px de base, observado en Chrome con el TSX/CSS productivo. Se reserva una fila de historial completa y se ensanchan barras/textos. Capsule/Blade reservan espacio para grafico y pedales.
- RPM: ambos modelos usan escala explicita `0-10k RPM` con color neutro, sin fingir limite de motor. El valor numerico permanece real por encima de escala. Compact muestra RPM y respeta showRpm. No hay alerta de corte hasta disponer de contrato de limite de vehiculo.
- Retiradas sombras exteriores de las capsulas de pedales telemetria. No se alteran otros fondos del catalogo.

## Evidencia RED/GREEN

- Regresiones previas: -1 se convertia en 0; 0 se imprimia numerico; etiquetas sin color inline; clutch 0/1/0 producia un solo punto en Capsule/Blade y Dense solo dos canales.
- RPM previo: etiqueta de escala ausente, umbral Compact completo a 6300, colores de corte y showRpm ignorado.
- Vitest focal: 15 archivos, 65 tests pasaron, incluidos cuatro casos V2 para ambos instrumentos.
- `pnpm --dir frontend typecheck`: correcto. ESLint focal productivo: correcto.
- `cd frontend; node scripts/isa990-input-geometry.mjs`: Chrome headless, TSX productivo renderizado con React y CSS real; no es Wails/LMU. Verifica contencion de secciones y lecturas a 280x100,360x140,480x180. A 360px, historial Dense 344px/Capsule 118px/Blade 134px. Compact contenido a 260x92, incluso 12500 RPM.
- Script deposita capturas de inspeccion en el temporal del sistema. No genera renderers paralelos ni datos productivos.

## Pendiente de integracion y validacion real

El orquestador actualiza handoff y roadmap comun y ejecuta suite/build/lint globales del conjunto. Este corte no hace push, PR, CI ni promocion.
Con perfil real: cambiar los tres colores, R/N/marchas, alternar embrague y observar historial continuo en las tres variantes; verificar tamaños y DPI reales. Comprobar RPM numericas contra LMU y que no se interprete escala como corte. No se ha lanzado Wails ni LMU y no se afirma cierre de esos gates.
