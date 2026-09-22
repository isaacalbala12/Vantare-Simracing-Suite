# Plan aprobado: Standings Eficiencia

- [x] Revisar renderer, motor, contratos, nightly y seguimiento Notion.
- [x] Registrar la opción intermedia aprobada por Isaac y sus límites de conducción.
- [x] Proyectar autoridad de mejor vuelta completa y derivar eventos por identidad/posición.
- [x] Aplicar FLIP inicial, avisos contenidos de puestos y vueltas, y PIT ligado a la fila.
- [x] Añadir escenas individuales/combinada y regresiones de continuidad/política/recorte.
- [x] Verificar build, lint, calidad; actualizar roadmap/handoff y Notion; servir Workshop.

## Segundo bloque autorizado

- [x] Confirmar autorización, base vigente y seguimiento Notion; registrar el diseño.
- [x] Implementar batalla discreta con autoridad numérica y umbrales estables.
- [x] Implementar entrada/salida de ventana con identidad y limpieza de recursos.
- [x] Añadir escenas individuales y regresiones del renderer/VM/harness.
- [x] Revisar el cambio e investigar el fallo remoto previo sin relajar controles.
- [x] Validar y preparar la entrega en la misma PR con roadmap, handoff y seguimiento Notion.

Evidencia del segundo bloque: worker `78115bd9`, consolidado como `ed8d1985`; revisión independiente sin hallazgos y 152 pruebas / 7 suites PASS. Suite completa: 468 archivos, 3832 PASS y 2 omitidos; build/TypeScript, lint y ratchet PASS (NEW=0/MOVED=0, sin cambiar políticas). El fallo intermitente de voz del primer bloque pasó diez repeticiones locales y un rerun remoto del mismo código.

La publicación y los checks del SHA final se verifican en VAN-41 / PR #1306. Quedan pendientes la revisión visual de Isaac de las escenas **Batalla cercana · conducción** y **Entrada y salida de ventana**, y LMU real; Standings no se declara terminado ni integrado por esta entrega.

## Seguimiento: ambas animaciones en la secuencia del harness

- [x] Ampliar la secuencia combinada con batalla y ventana conservando el resultado de los eventos anteriores.
- [x] Aplicar el recorte de demostración también en V1 sin modificar el estilo seleccionado.
- [x] Corregir el redondeo del reloj que aparcaba ciertos fotogramas en la muestra anterior y proteger límites exactos a 15/30 Hz.
- [x] Verificar las 170 pruebas de autoría / 13 suites, build/TypeScript y lint; reflejar el ajuste en roadmap y handoff.
