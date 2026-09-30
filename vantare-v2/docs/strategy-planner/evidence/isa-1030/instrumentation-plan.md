# ISA-1030 — Instrumentación acotada de auditoría

La herramienta histórica solo expone el prefijo del hash en CSV y no congela
preparación/evaluación. Se añade `audit_corpus.py` exclusivamente como instrumento
de evidencia, antes de tomar muestras. No cambia el producto ni sus filtros.

1. `split`: lee el inventario, reidentifica fuentes estables con SHA-256 completo,
   conserva mapa privado de rutas solo fuera de Git y deduplica por contenido.
   Agrupa por coche/categoría/trazado. Reserva las carreras más recientes
   (20%, redondeo superior, al menos una cuando hay historia anterior), excluyendo
   las analizadas en el spike histórico de ISA-694. El 20% es regla de muestreo,
   no umbral de calidad. Resto posterior al cutoff queda embargo, no training.
2. `inspect`: acepta solo IDs training; usa staging y helper aprobados para
   catalogar todos los nombres de canales y resumir un subconjunto explícito.
   No ejecuta el solver ni declara el detector histórico como verdad de terreno.
3. Datos analíticos completos y mapa privado quedan en carpeta local separada.
   Git solo recibe agregados sanitizados y anotaciones revisadas.
4. Cada lectura valida que el archivo conserva su identidad; salida JSON con
   referencias/dimensiones/versiones permite repetir la selección.

Verificación: `python -m py_compile .../audit_corpus.py`; ejecutar split y comprobar
disjunción de hashes/cutoffs; el comando inspect rechaza IDs fuera de training.
No se añaden dependencias. El lector de bajo nivel se importa del spike existente,
cuya versión queda anclada al SHA de la base.
