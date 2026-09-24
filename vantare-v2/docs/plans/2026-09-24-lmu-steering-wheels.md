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

## Ampliación aprobada: un único Pedales avanzados

Isaac solicita retirar el duplicado del catálogo y renombrar el widget con volantes. El orquestador aprueba el 24/09/2026 un segundo commit en #1356, porque el gate exige base `nightly`.

Se evaluaron tres opciones: borrar el tipo compacto (rompería perfiles), convertirlo al principal (perdería `showSpeed`/`showRpm`, tamaño y presentación iRacing), o retirarlo del catálogo manteniendo compatibilidad. Se elige la tercera: `pedals-telemetry-compact` sigue aceptado y renderizable, pero no se ofrece para añadir en Studio ni elegir en Workshop. Su etiqueta de tipo es «Pedales antiguos»; los nombres personalizados no se modifican. `pedals-telemetry` pasa a «Pedales avanzados» en ES, EN, PT e IT y conserva el selector y sus identificadores. Los enlaces directos antiguos de Workshop conservan la vista de compatibilidad con un aviso y opción deshabilitada; no aparece en el catálogo normal y los perfiles no se reescriben.

Plan: declarar retirada en la definición; filtrar catálogos y actualizar etiquetas visibles; probar perfiles mixtos V3/V4 con ajustes, memorias, procedencia y políticas; verificar selector, renderer antiguo, idiomas, frontend y revisión visual. Mantener manifest, parser, backend y IDs de diseños antiguos para resolver perfiles existentes. La auditoría de señales sigue separada. Sin merge ni cambio al Workshop 5178.
