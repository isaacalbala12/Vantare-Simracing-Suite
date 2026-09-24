# Volantes LMU · catálogo y evidencia (24/09/2026)

Candidato ISA-1355 sobre `nightly f50ab4ab`. Seguimiento: [Asana · Pedals telemetry](https://app.asana.com/1/1210926733859493/project/1218742976551956/task/1218756738610082). Implementación en `frontend/src/overlay/design-systems/vantare-functional/steering-wheels/`.

## Alcance confirmado

El selector contiene 31 opciones LMU y conserva el genérico original: 16 Hypercar, 10 LMGT3, un Oreca 07 para LMP2 y cuatro LMP3. Incluye DLC. Las libreas, equipos y ajustes de motor/aerodinámica no crean volantes adicionales. BMW M Hybrid V8 tiene dos opciones por su cambio de volante en Le Mans 2024; Toyota GR010/TR010 y Peugeot 9X8 2023/2024 conservan identidades separadas. Las evoluciones de BMW M4, Ferrari 296, Cadillac y Alpine están cubiertas por su familia. El Oreca agrupa las temporadas WEC y ELMS. No incluye GTE, fuera del encargo.

Fuentes primarias consultadas:

- [Catálogo oficial LMU](https://lemansultimate.com/cars/): modelos y categorías, incluidas las fichas de [Genesis GMR-001](https://lemansultimate.com/cars/genesis-gmr-001/), [Ligier JS P325](https://lemansultimate.com/cars/ligier-js-p325/), [Duqueine D09](https://lemansultimate.com/cars/duqueine-d09/) y [Ginetta](https://lemansultimate.com/cars/ginetta-g61-lt-p325-evo/).
- [ELMS, actualización 2026 del 4 de junio](https://www.europeanlemansseries.com/en/news/le-mans-ultimate-gets-2026-season-update-and-free-content-ahead-of-24-hours-le-mans/13313): Toyota TR010 y ADESS, además de las evoluciones 2026.
- [Notas oficiales V1.4](https://guide.lemansultimate.com/hc/en-gb/articles/16987981296015-V1-4-release-notes) y [V1.4.2](https://guide.lemansultimate.com/hc/en-gb/articles/17713037697807-V1-4-2-Update-1-4-Patch-2): incorporaciones, evoluciones y correcciones posteriores. La denominación de ADESS se toma de las notas actuales, **AD25**; la ficha web conserva un título ADESS-03 y descripción del modelo anterior, por lo que no se añade otro coche a partir de esa inconsistencia.
- [Notas de diciembre de LMU](https://lemansultimate.com/december-update-patch-notes/): documentan el volante BMW desde Le Mans 2024 y ajustes del volante Ferrari 499P de 2024. Este candidato diferencia BMW, pero simplifica las variantes de detalle de Ferrari dentro de una opción de familia.

## Representación visual y límites

Son interpretaciones propias para 72 px. El catálogo de vehículos está contrastado; **la colocación y el número exacto de controles de todos los volantes no están certificados**. No se presentan como réplicas oficiales ni como una reproducción exacta de cada temporada. Los contornos y grupos de controles se reutilizan cuando conviene a la legibilidad. GR010 y TR010 comparten dibujo mientras no haya evidencia suficiente de un volante diferente. No hay texturas del juego, logotipos, imágenes externas ni números decorativos que parezcan telemetría.

Referencias visuales verificables: [Ferrari, creación del volante 499P](https://www.ferrari.com/en-EN/hypercar/articles/ferrari-499p-the-creation-of-the-maranello-hypercars-steering-wheel), [BMW/Fanatec M4 GT3](https://www.bmw-m.com/en/fastlane/motorsport/bmw-automotive-gaming.html), [cockpit BMW M Hybrid V8 publicado por LMU](https://lemansultimate.com/wp-content/uploads/2024/06/BMW-MHV8-V2-35.png) y [cockpit Ligier publicado por LMU](https://lemansultimate.com/wp-content/uploads/2025/09/le-mans-ultimate.exe-Screenshot-2025.09.12-13.02.57.98-scaled.png). Varias galerías de los demás vehículos solo ofrecen exteriores: no se deriva de ellas una validación del interior.

El ajuste `steeringWheel` pertenece a la apariencia guardada del widget `pedals-telemetry`. Valores ausentes o desconocidos recuperan el genérico, sin cambiar contenido, tamaño o datos. Studio, Desktop, OBS y Workshop comparten renderer. Workshop usa el parámetro `steeringWheel`, validado y descartado fuera del widget/sistema correspondientes. No existe selección automática del coche del jugador.

La dirección de producción permanece sin señal validada en el contrato LMU de esta base. Los dibujos quedan centrados si no llega dirección; la demostración usa la señal de su fixture. La rotación existente de ±450° es una convención del widget, **no un ángulo físico validado por vehículo**. La revisión de datos y la retirada/renombrado del compacto se incorporan después en commits separados de la misma PR #1356; el [handoff](../vantare-program/handoffs/overlays-launcher-hub.md) registra la verificación conjunta. La posición V2 también permanece sin dato.

## Verificación del primer commit de volantes

- 172 pruebas focales finales, incluidos idiomas: guardado/lectura de perfil V4 mediante el control de Studio, recuperación del genérico, cobertura de los 31 dibujos, conservación de cifras/pedales, navegación del selector y paridad de las cuatro superficies.
- Suite frontend completa con Node 22.23.2 y cuatro workers: **482 archivos, 4080 pruebas aprobadas y 2 omitidas**. La primera ejecución con Node 26 alpha falló por incompatibilidad de `localStorage` y workers; no se ocultó ni se modificaron las pruebas para evitarla.
- Typecheck `tsc -b --noEmit`, lint y build aprobados. Ratchet con Node 22: **PASS, NEW=0, MOVED=0, policy_changed=false**. Se extrajeron los nombres comerciales comunes de las traducciones para evitar duplicación.
- Revisión visual en Safari: Ferrari 499P y cambio a BMW M4 desde el selector de Workshop, misma composición y medidas; lámina de las 32 opciones renderizada desde el componente productivo a 72 px. Sin certificación física Windows/LMU/OBS ni aceptación visual del usuario.

Preview aislado: `http://127.0.0.1:5188/workshop?widget=pedals-telemetry&system=vantare-functional&steeringWheel=bmw-m4-gt3&brand=off`. Lámina local temporal: `/tmp/vantare-wheel-review/catalogue.html`; captura `/tmp/vantare-wheel-review/catalogue-safari.png`. La lámina es evidencia estática generada desde el renderer, no una superficie productiva alternativa.

Siguiente paso: revisión del orquestador y de Isaac, especialmente fidelidad de las interpretaciones. No merge, promoción ni publicación realizados.
