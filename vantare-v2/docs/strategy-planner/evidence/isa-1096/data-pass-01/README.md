# Datos — primera integración A4

TSX/CSS productivo, harness existente, 1672×941; otras capturas a 1280×800,
1024×768 y 768×1024 con escalado Orbit. Configuración del fixture ya existente,
sin telemetría cargada ni cifras de resultado. No prueba Wails/reader/precisión.

Pestañas del editor, selección de fuente y estado vacío de muestras/detalle.
El banner usa el mismo garage-detail-v3.png aprobado, copiado como asset
productivo. data-before-final-offset conserva una iteración con el banner 60px
demasiado alto; data.png aplica el offset original del prototipo. No edición
de la imagen. Faltan familias, jerarquía de stint/vuelta y revisión visual >9.

Una primera ejecución no llegó a las pestañas dentro de 30s; no se capturó su
causa y no se atribuye a una corrección concreta. La repetición instrumentada,
cinco recorridos posteriores y la captura final terminaron sin pageerror.
Anchos de documento 1280/1024/768, iguales a viewport; panel 1208/961.75/721.31.
No equivale a aceptación nativa ni prueba de ausencia de fallos intermitentes.

Script local C:/tmp/isa1096-data-capture.cjs y logs isa1096-t10g-capture*.log.
La prueba de interfaz ejercita apertura explícita, edición de cero con motivo,
ausencia distinta de cero, formulario conservado entre pestañas y guard de salida.
