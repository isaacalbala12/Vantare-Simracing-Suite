# Plan: Standings Eficiencia `default` con ventana del jugador

1. Añadir el contrato de ventana de Standings: opciones `around` pares de 0 a
   8, helper puro de selección y tests para top 3, jugador centrado, límites,
   jugador en podio, parrillas pequeñas y jugador ausente.
2. Mantener `V1` y `Foco`, añadir `Default` como estilo de estudio de
   Eficiencia Standings y hacerlo la selección inicial; serializar el estilo y
   `around` en el Workshop sin afectar otros widgets, sistemas ni perfiles
   globales.
3. Integrar la política en el view-model de Standings, conservando la posición
   original, la identidad de fila y el `rowCount` total de la parrilla; ajustar
   la altura visible a las filas realmente seleccionadas.
4. Exponer `Pilotos alrededor` únicamente para `Default`, conectar el harness
   con el runtime efímero y conservar la resolución real del widget como base.
5. Actualizar pruebas de query, controles, view-model, layout y paridad del
   Workshop; ejecutar tests focalizados, typecheck, lint/build disponibles y
   revisar el diff para no incluir cambios concurrentes.
