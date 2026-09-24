# Volantes LMU · ISA-1355

Asana: [Pedals telemetry](https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218756738610082). Puente técnico: [#1355](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1355). Base: `f50ab4ab` de `origin/nightly`.

## Diseño acordado

El widget `pedals-telemetry` conserva composición, medidas, pedales y cifras. Su volante genérico sigue siendo el predeterminado. Un ajuste de apariencia `steeringWheel` permite escoger una interpretación SVG del volante de cada vehículo LMU, agrupados por Hypercar, LMGT3, LMP2 y LMP3. Los modelos y evoluciones se verifican con fuentes oficiales hasta el 24 de septiembre de 2026. Las libreas no añaden opciones.

El selector de Studio guarda el identificador en `visual.appearanceOverrides`; Workshop reproduce ese mismo contrato mediante un parámetro validado. El renderer no accede a almacenamiento, red ni datos del simulador. Solo cambia el dibujo; ni calibra ángulos ni inventa marcha, RPM o pantallas encendidas. Los SVG son dibujos propios simplificados para una caja de 72 px, sin texturas extraídas ni logotipos.

Las temporadas/evoluciones que no documentan otro volante comparten diseño. La modificación de BMW M Hybrid V8 en Le Mans 2024 se distingue expresamente. La exactitud del catálogo no certifica una réplica de cada botón o año: esa fidelidad visual queda pendiente de aceptación.

## Plan

1. Registrar catálogo y procedencia; dibujar piezas estáticas y mantener el genérico.
2. Conectar ajuste de apariencia, traducciones y Workshop al renderer productivo.
3. Probar selección, normalización, persistencia y paridad de superficies; revisar visualmente a escala real.
4. Ejecutar checks de frontend y calidad aplicables; actualizar roadmap, changelog y handoff; entregar candidato sin merge.

La auditoría de señales y el cambio de nombre/eliminación del widget compacto son tareas de otros agentes; este cambio no modifica sus contratos.
