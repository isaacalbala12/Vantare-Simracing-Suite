# Revisiones visuales — recorrido completo ISA-1063

Base: 4c08b834. Revisor independiente: visual_adversarial. Solo inspección de
imágenes; no valida backend, precisión matemática ni runtime Wails.
Cada pantalla debe superar estrictamente 9/10. Nunca se utiliza la media.

| Pantalla | Primera revisión (pass03) | Segunda revisión (pass05) |
|---|---:|---:|
| Inicio |8,1|9,1|
| Simulador |7,9|9,1|
| Evento |8,1|9,1|
| Coche y circuito |8,5|8,9|
| Reglas |8,5|8,9|
| Pilotos |7,9|9,1|
| Sesiones |8,2|8,9|
| Carrera |8,1|8,7|
| Datos |8,3|8,9|
| Plan |8,6|9,0|
| Cálculo |8,2|9,1|
| Revisiones |8,7|9,2|

Primera revisión: escenario sin identidad/equipo, footer recortado, escalas e
iconos secundarios, distribución de Carrera y ritmo vertical de Cálculo.
Segunda revisión: seis pantallas pasan. Pendientes: tarjeta Plan de Carrera
excesivamente ancha, escala/alineación de tabla Datos, ficha de circuito,
cheurones/reservas, filtros/notas de sesiones y marcador de llegada circular.
Pass06 aplica estas correcciones. El dictamen final se recoge al final de este informe.

Las referencias congeladas son las imágenes aprobadas generadas en esta tarea:
A4, Reglas, Pilotos, Sesiones, Carrera, Datos, Plan y Cálculo. El tablero
concepts-missing.png completa Inicio, Simulador, Evento y Revisiones.
Se permite la adaptación carmín moderada y el sidebar comprimido del editor.
Los valores y procesos no conectados permanecen explícitamente pendientes.

## Comprobaciones personales

- Sintaxis de los cuatro JS: correcta.
- Duración negativa: bloquea continuar y conserva la pantalla Reglas.
- Duración de 60 minutos y nombre con caracteres HTML: conservados como texto
  literal al pasar por Pilotos/Sesiones/Carrera.
- Excluir sesión y Deshacer: estados restaurados, anuncio accesible correcto.
- Las doce rutas se renderizan en Chrome. Evaluación de anchuras en responsive.json.
- Un desbordamiento de 10 px en Sesiones a 320 px se corrigió permitiendo que el
  botón de búsqueda envuelva texto; repetido y sin desbordamiento tras el último CSS.
- No build/test React o Go: solo prototipo documental sin cambios productivos.

## Dictamen final

Tercera revisión (pass06): todas superan9 excepto Carrera8,9. Se corrige el
reparto exterior: fuente hasta x938, Plan desde x962, bases alineadas en y840.
Cuarta revisión (pass07-summary): **Carrera9,1**. Gate mínimo final **9,1/10**.
Plan y Revisiones9,2; las otras diez9,1. Revisor confirma ausencia de regresión
material en stint9,2 y parada9,1 frente a las capturas previamente aceptadas.
Quedan diferencias menores de fotografía, siluetas y espaciado interior.

Evidencia final: pass06 para once pantallas y pass07-summary para Carrera.
Galería navegable: [gallery.html](gallery.html).
Responsive final: 48/48 comprobaciones sin desbordamiento de página/main.
El stepper y la tabla de datos conservan desplazamiento interno cuando lo necesitan.
Consola Chrome: sin errores recogidos. No acredita renderer Wails ni producto conectado.

Archivos: index.html/recorded-editor.js coordinan vistas; wizard-preview.js,
workspace-preview.js y journey-icons.js componen el prototipo; journey-parity.css
ajusta su apariencia; garage-journey-v2.png es imagen decorativa generada.
Documentación: README, handoff único, roadmap y esta evidencia. Sin cambios en
frontend productivo, Go, originales DuckDB, LMU, dependencias o secretos.
