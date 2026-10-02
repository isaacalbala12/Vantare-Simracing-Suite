# Plan: separación tonal del top 3 en Standings Default

1. Añadir al renderer compartido de Standings metadatos DOM de presentación
   derivados de las filas ya proyectadas: top 3, contexto y primera fila de
   contexto. Activarlos solo para clasificación Normal.
2. Añadir en el CSS del Workshop el bloque tonal bajo
   `data-study-style="default"`, sin modificar tokens globales, tamaños ni
   reglas de V1/Foco/Multiclass.
3. Componer la capa tonal con jugador, movimiento y estados de fuente sin
   sustituir sus fondos o sombras existentes.
4. Cubrir el comportamiento con pruebas de renderer y una matriz del harness:
   Default, V1, Foco; jugador arriba/medio/abajo; `around=0/4/8`; Normal y
   Multiclass.
5. Ejecutar typecheck, build y las pruebas dirigidas; revisar visualmente el
   harness y comprobar que la lista de filas y la altura intrínseca no cambian.
