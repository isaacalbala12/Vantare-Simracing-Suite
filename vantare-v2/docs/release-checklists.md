# Checklist de aceptación por build

Registrar versión, SHA, canal, entorno y resultados en la tarea de release de Notion. Una casilla sin marcar es una comprobación pendiente; esta plantilla no afirma que una build pase. Los criterios de etapa están en el [plan de lanzamiento](plan-beta-publica-y-lanzamiento.md).

## Producto y persistencia

- [ ] La app instala, arranca y muestra la versión esperada en Windows con WebView2.
- [ ] Acceso a cuenta y permisos corresponden al usuario y al canal.
- [ ] Un perfil recomendado se abre y se puede copiar como editable.
- [ ] Studio permite editar contenido/apariencia y mover/redimensionar widgets en el mismo documento.
- [ ] Se confirma el autoguardado antes de salir; reabrir conserva contenido y posición.
- [ ] Un fallo de guardado se muestra y permite recuperar el cambio, sin anunciarlo como guardado.
- [ ] Desktop abre/cierra y representa el perfil; OBS en el mismo PC muestra los widgets según la [guía local](obs-local-setup.md).
- [ ] Relative, Standings, Pedals y demás widgets incluidos se prueban con datos disponibles; las ausencias no se presentan como valores reales.
- [ ] Live, desconectado y fixtures de prueba son distinguibles; la prueba LMU real queda identificada.
- [ ] Hotkeys, delta y funciones experimentales incluidas cumplen lo anunciado o tienen una limitación explícita aceptada para ese corte.

## Verificación técnica

- [ ] Checks de la PR y del canal pasan según [branch-channels](branch-channels.md).
- [ ] Build frontend antes de Go cuando necesita los assets embebidos; usar los comandos de [operaciones](operations.md) y [pruebas](testing-strategy.md).
- [ ] Artefactos oficiales, runtime DuckDB y checksums pasan la [receta de release](release-artifacts.md).
- [ ] Prueba de instalación/update en entorno limpio y recuperación del perfil con una copia verificada.
- [ ] Rendimiento junto a LMU medido cuando el corte lo exige; harness visual y tests no sustituyen esta evidencia.

## Experiencia del tester

- [ ] Un tester completa [instalación y primeros pasos](tester-build-instructions.md) sin asistencia.
- [ ] Notas de la build describen cambios, comprobaciones y limitaciones reales.
- [ ] Se conoce el [canal de feedback](tester-feedback-process.md) y se puede reproducir un reporte.
- [ ] No hay P0/P1 abiertos en el alcance; los P2 aceptados constan en la tarea y notas.

## Venta y apertura pública

- [ ] Flujo Polar compra → acceso → renovación/cancelación/refund validado con la matriz [Billing](billing/README.md) en el entorno autorizado.
- [ ] Identidad, dispositivo, credencial offline y acceso por canal comprobados.
- [ ] Soporte, refund y distribución tienen procedimiento aprobado.
- [ ] Guías de usuario y limitaciones publicables corresponden a esa build.
- [ ] Aceptación y autorización de Isaac registradas; el cierre técnico no levanta por sí solo el NO-GO comercial.

## Publicación

- [ ] Manifiesto `docs/releases/<tag>.json` y fragmentos seleccionados completos y validados con `release_notes.py --check`.
- [ ] Tag/canal/SHA coherentes, sin reutilizar un tag distribuido.
- [ ] Release remota contiene los seis artefactos oficiales y sus checksums.
- [ ] Comunicaciones usan los destinos dedicados de [Discord](discord-communications.md), después de verificar los artefactos.
- [ ] Notion registra lo realmente integrado/publicado y los enlaces a evidencia.
